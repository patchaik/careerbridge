"""Discover job requirements and learning resources using Keenable."""
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Literal, TypedDict
from urllib.parse import urlparse

import httpx
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field

from careerbridge.prompts.search_agent import job_suite, job_source_supported
from careerbridge.prompts.resources import resource_suite, resource_validation_issues
from careerbridge.model_gateway import ModelError
from careerbridge.model_tasks import generate_task
from careerbridge.timings import measure
from careerbridge.tracing import trace


def search(query: str, limit: int = 10) -> list[dict]:
    """Keenable returns ranked pages; no candidate profile data is sent."""
    key = os.getenv("KEENABLE_API_KEY")
    headers = {"X-API-Key": key} if key else {"X-Keenable-Title": "CareerBridge"}
    endpoint = "https://api.keenable.ai/v1/search" + ("" if key else "/public")
    with httpx.Client(timeout=30) as client:
        response = client.post(endpoint, headers=headers, json={"query": query, "max_results": limit,
                                                                 "snippet_max_length": 1000, "disable_cards": True})
        response.raise_for_status()
        return response.json()["results"]


def fetch_pages(results: list[dict], limit: int = 10) -> list[dict]:
    key = os.getenv("KEENABLE_API_KEY")
    headers = {"X-API-Key": key} if key else {"X-Keenable-Title": "CareerBridge"}
    endpoint = "https://api.keenable.ai/v1/fetch" + ("" if key else "/public")
    if limit <= 0:
        return []
    candidates, seen = [], set()
    for result in results:
        url = result.get("url", "")
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https") and parsed.hostname and url not in seen:
            seen.add(url)
            candidates.append(result)
    pages = []
    with httpx.Client(timeout=20) as client, ThreadPoolExecutor(max_workers=3) as pool:
        def fetch(result):
            url = result["url"]
            try:
                response = client.get(endpoint, headers=headers, params={"url": url, "max_chars": 12000, "live": "true"})
                response.raise_for_status()
                page = response.json()
                if page.get("content") and urlparse(page.get("url", url)).scheme in ("http", "https"):
                    return {"url": page.get("url", url), "title": page.get("title", result.get("title", "")),
                            "content": page["content"], "published_at": page.get("published_at")}
            except (httpx.HTTPError, ValueError, KeyError):
                pass
            return None

        offset = 0
        while offset < len(candidates) and len(pages) < limit:
            # Small batches preserve search rank and avoid fetching past the result limit.
            batch = candidates[offset:offset + min(3, limit - len(pages))]
            pages.extend(page for page in pool.map(fetch, batch) if page is not None)
            offset += len(batch)
    return pages


class Requirement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill: str = Field(min_length=1, max_length=120)
    importance: Literal["required", "preferred", "unspecified"]
    excerpt: str = Field(min_length=1, max_length=800)


class Job(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_index: int
    title: str
    employer: str | None
    requirements: list[Requirement] = Field(max_length=10)


class JobExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    jobs: list[Job] = Field(max_length=5)


class Resource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_index: int
    title: str = Field(min_length=1, max_length=200)
    price_type: Literal["free", "paid", "mixed", "unknown"]
    price_evidence: str = Field(max_length=400)
    learning_evidence: str = Field(min_length=1, max_length=400)
    format: Literal["article", "video", "course", "exercise", "unknown"]


class ResourceExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resources: list[Resource] = Field(max_length=10)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def contains(text: str, quote: str) -> bool:
    return bool(normalize(quote)) and normalize(quote) in normalize(text)


class JobState(TypedDict, total=False):
    role: str
    location: str
    seniority: str
    workflow_id: str
    user_id: str
    model_routing: dict
    timings_ms: dict
    pages: list[dict]
    result: dict


def find_jobs(state: JobState):
    if os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock":
        return {"pages": [{"url": "https://example.com/synthetic-job", "title": f"Synthetic {state['role']} job",
                           "content": f"Synthetic {state['role']}. Required: Python and SQL. Preferred: Docker.", "published_at": None}]}
    query = f"{state['role']} {state['seniority']} {state['location']} job opening responsibilities qualifications"
    timings = state.setdefault("timings_ms", {})
    with measure(timings, "search"):
        results = search(query, 10)
    with measure(timings, "fetch"):
        pages = fetch_pages(results[:8], 5)
    if results and not pages:
        raise ModelError("source_fetch_failed")
    # Bound model input while retaining only quotes within the supplied excerpt.
    return {"pages": [{**page, "content": page["content"][:4500]} for page in pages]}



def extract_jobs(state: JobState):
    if not state["pages"]:
        return JobExtraction(jobs=[])
    result = generate_task(state, job_suite(), "job_extract", "job_requirements", {
        "role": state["role"], "location": state["location"], "seniority": state["seniority"],
        "pages": [{"content": p["content"]} for p in state["pages"]],
    }, job_source_supported)
    return JobExtraction.model_validate(result)


def analyze_jobs(state: JobState):
    pages = state["pages"]
    mock = os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock"
    with measure(state.setdefault("timings_ms", {}), "model"):
        extracted = JobExtraction(jobs=[Job(page_index=0, title=f"Synthetic {state['role']}", employer="Example",
            requirements=[Requirement(skill="Python", importance="required", excerpt="Required: Python and SQL."),
                          Requirement(skill="SQL", importance="required", excerpt="Required: Python and SQL."),
                          Requirement(skill="Docker", importance="preferred", excerpt="Preferred: Docker.")])]) if mock else extract_jobs(state)
    now = datetime.now(timezone.utc).isoformat()
    jobs = []
    used = set()
    for job in extracted.jobs:
        if not 0 <= job.page_index < len(pages) or job.page_index in used:
            continue
        page = pages[job.page_index]
        if not contains(page["content"], job.title):
            continue
        requirements = []
        names = set()
        for requirement in job.requirements:
            name = normalize(requirement.skill)
            if name not in names and contains(page["content"], requirement.excerpt):
                requirements.append(requirement.model_dump())
                names.add(name)
        if not requirements:
            continue
        used.add(job.page_index)
        jobs.append({"title": job.title, "employer": job.employer if job.employer and contains(page["content"], job.employer) else None, "url": page["url"],
                     "retrieved_at": now, "published_at": page["published_at"], "requirements": requirements,
                     "availability": "not_verified"})
    return {"result": {"jobs": jobs, "retrieved_at": now,
                       "source": "synthetic" if mock else "keenable", "availability_note": "Synthetic fixture; not a real job." if mock else "Search results may be stale; check each listing."}}


class ResourceState(TypedDict, total=False):
    skill: str
    pages: list[dict]
    user_id: str
    workflow_id: str
    model_routing: dict
    timings_ms: dict
    diagnostics: dict
    result: dict


def find_resources(state: ResourceState):
    skill = state["skill"]
    queries = [f"{skill} free beginner tutorial course", f"{skill} paid beginner course price"]
    pages, seen = [], set()
    had_results = False
    timings = state.setdefault("timings_ms", {})
    diagnostics = state.setdefault("diagnostics", {})
    for query in queries:
        diagnostics["stage"] = "search"
        with measure(timings, "search"), trace("search-resources", as_type="retriever",
                input={"skill": skill, "access": "paid" if " paid beginner" in query else "free"}) as observation:
            results = search(query, 6)
            observation.update(output={"result_count": len(results)})
        had_results = had_results or bool(results)
        diagnostics["stage"] = "fetch"
        with measure(timings, "fetch"), trace("fetch-resource-pages", as_type="retriever",
                input={"candidate_count": min(len(results), 5)}) as observation:
            fetched = fetch_pages(results[:5], 3)
            observation.update(output={"page_count": len(fetched)})
        for page in fetched:
            if page["url"] not in seen:
                seen.add(page["url"])
                pages.append({**page, "content": page["content"][:3500]})
    if had_results and not pages:
        raise ModelError("source_fetch_failed")
    return {"pages": pages}


def analyze_resources(state: ResourceState):
    data = {"skill": state["skill"], "pages": [{"content": p["content"]} for p in state["pages"]]}
    diagnostics = state.setdefault("diagnostics", {})
    diagnostics.update(stage="extraction", page_count=len(state["pages"]), validation_attempts=[])

    def validate_resources(output, source):
        issues = resource_validation_issues(output, source)
        diagnostics["validation_attempts"].append({"resource_count": len(output["resources"]), "issues": issues})
        with trace("validate-resource-evidence", as_type="guardrail",
                   input={"page_count": len(source["pages"]), "resource_count": len(output["resources"])}) as observation:
            observation.update(output={"valid": not issues, "issues": issues},
                               level="WARNING" if issues else "DEFAULT")
        if issues:
            raise ModelError("invalid_output", {"reason": "source_validation", "issues": issues})
        return True

    with measure(state.setdefault("timings_ms", {}), "model"):
        output = generate_task(state, resource_suite(), "resource_extract", "learning_resources", data,
                                validate_resources) if state["pages"] else {"resources": []}
    extracted = ResourceExtraction.model_validate(output)
    now = datetime.now(timezone.utc).isoformat()
    groups = {kind: [] for kind in ("free", "paid", "mixed", "unknown")}
    for item in extracted.resources:
        group = groups[item.price_type]
        if len(group) < 5:
            group.append({**item.model_dump(exclude={"page_index"}),
                          "url": state["pages"][item.page_index]["url"], "checked_at": now})
    return {"result": {"skill": state["skill"], **groups, "source": "keenable", "retrieved_at": now}}


job_graph = StateGraph(JobState)
job_graph.add_node("find_jobs", find_jobs)
job_graph.add_node("analyze_jobs", analyze_jobs)
job_graph.add_edge(START, "find_jobs")
job_graph.add_edge("find_jobs", "analyze_jobs")
job_graph.add_edge("analyze_jobs", END)
job_search_agent = job_graph.compile()

resource_graph = StateGraph(ResourceState)
resource_graph.add_node("find_resources", find_resources)
resource_graph.add_node("analyze_resources", analyze_resources)
resource_graph.add_edge(START, "find_resources")
resource_graph.add_edge("find_resources", "analyze_resources")
resource_graph.add_edge("analyze_resources", END)
resource_search_agent = resource_graph.compile()
