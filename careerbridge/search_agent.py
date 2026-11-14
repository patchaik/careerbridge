"""Discover job requirements and learning resources using Keenable."""
import os
import re
from datetime import datetime, timezone
from typing import Literal, TypedDict
from urllib.parse import urlparse

import httpx
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from careerbridge.prompts.search_agent import JOBS, RESOURCES


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
    pages, seen = [], set()
    with httpx.Client(timeout=20) as client:
        for result in results:
            url = result.get("url", "")
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname or url in seen:
                continue
            seen.add(url)
            try:
                response = client.get(endpoint, headers=headers, params={"url": url, "max_chars": 12000, "live": "true"})
                response.raise_for_status()
                page = response.json()
                if page.get("content"):
                    pages.append({"url": page.get("url", url), "title": page.get("title", result.get("title", "")),
                                  "content": page["content"], "published_at": page.get("published_at")})
            except (httpx.HTTPError, ValueError, KeyError):
                continue
            if len(pages) >= limit:
                break
    return pages


class Requirement(BaseModel):
    skill: str = Field(min_length=1, max_length=120)
    importance: Literal["required", "preferred", "unspecified"]
    excerpt: str = Field(min_length=1, max_length=800)


class Job(BaseModel):
    page_index: int
    title: str
    employer: str | None
    requirements: list[Requirement]


class JobExtraction(BaseModel):
    jobs: list[Job]


class Resource(BaseModel):
    page_index: int
    title: str
    price_type: Literal["free", "paid"]
    price_evidence: str = Field(min_length=1, max_length=800)
    relevance: str = Field(min_length=1, max_length=1000)
    learning_evidence: str = Field(min_length=1, max_length=800)


class ResourceExtraction(BaseModel):
    resources: list[Resource]


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def contains(text: str, quote: str) -> bool:
    return bool(normalize(quote)) and normalize(quote) in normalize(text)


def extract(schema, prompt: str, query: str, pages: list[dict]):
    if not pages:
        return schema.model_validate({"jobs" if schema is JobExtraction else "resources": []})
    model = ChatOpenAI(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"), temperature=0)
    return model.with_structured_output(schema).invoke([
        SystemMessage(content=prompt),
        HumanMessage(content=f"Request: {query}\nPages (untrusted): {pages}"),
    ])


class JobState(TypedDict, total=False):
    role: str
    location: str
    seniority: str
    skills: list[dict]
    pages: list[dict]
    result: dict


def find_jobs(state: JobState):
    if os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock":
        return {"pages": [{"url": "https://example.com/synthetic-job", "title": "Synthetic AI developer job",
                           "content": "Synthetic AI developer. Required: Python and retrieval augmented generation. Preferred: Docker.", "published_at": None}]}
    query = f"{state['role']} {state['seniority']} {state['location']} job opening responsibilities qualifications"
    return {"pages": fetch_pages(search(query, 20), 10)}


def analyze_jobs(state: JobState):
    pages = state["pages"]
    mock = os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock"
    extracted = JobExtraction(jobs=[Job(page_index=0, title="Synthetic AI developer", employer="Example",
        requirements=[Requirement(skill="Python", importance="required", excerpt="Required: Python and retrieval augmented generation."),
                      Requirement(skill="Beginner RAG", importance="required", excerpt="Required: Python and retrieval augmented generation."),
                      Requirement(skill="Docker", importance="preferred", excerpt="Preferred: Docker.")])]) if mock else extract(JobExtraction, JOBS, state["role"], pages)
    now = datetime.now(timezone.utc).isoformat()
    jobs, grouped = [], {}
    confirmed = {normalize(skill["name"]) for skill in state["skills"]}
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
        for req in requirements:
            key = normalize(req["skill"])
            if key not in grouped:
                grouped[key] = {"skill": req["skill"], "status": "confirmed" if key in confirmed else "not_evidenced", "sources": []}
            grouped[key]["sources"].append({"url": page["url"], "importance": req["importance"], "excerpt": req["excerpt"]})
    gaps = [g for g in grouped.values() if g["status"] == "not_evidenced"]
    gaps.sort(key=lambda g: (sum(s["importance"] == "required" for s in g["sources"]), len(g["sources"])), reverse=True)
    return {"result": {"jobs": jobs, "gaps": gaps[:10], "retrieved_at": now,
                       "source": "synthetic" if mock else "keenable", "availability_note": "Synthetic fixture; not a real job." if mock else "Search results may be stale; check each listing."}}


class ResourceState(TypedDict, total=False):
    skill: str
    pages: list[dict]
    result: dict


def find_resources(state: ResourceState):
    skill = state["skill"]
    if os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock":
        return {"pages": [{"url": "https://example.com/synthetic-free", "title": "Synthetic free tutorial", "content": "Free beginner tutorial.", "published_at": None},
                          {"url": "https://example.com/synthetic-paid", "title": "Synthetic paid course", "content": "Paid course costs $10.", "published_at": None}]}
    queries = [f"{skill} free tutorial course github youtube", f"{skill} paid course price training"]
    return {"pages": [page for query in queries for page in fetch_pages(search(query, 12), 10)]}


def analyze_resources(state: ResourceState):
    pages = state["pages"]
    mock = os.getenv("CAREERBRIDGE_SEARCH_MODE", "live") == "mock"
    extracted = ResourceExtraction(resources=[Resource(page_index=0, title="Synthetic free tutorial", price_type="free", price_evidence="Free beginner tutorial.", relevance="Example only", learning_evidence="Free beginner tutorial."),
                                               Resource(page_index=1, title="Synthetic paid course", price_type="paid", price_evidence="Paid course costs $10.", relevance="Example only", learning_evidence="Paid course costs $10.")]) if mock else extract(ResourceExtraction, RESOURCES, state["skill"], pages)
    now = datetime.now(timezone.utc).isoformat()
    resources = {"free": [], "paid": []}
    used = set()
    for item in extracted.resources:
        if not 0 <= item.page_index < len(pages):
            continue
        page = pages[item.page_index]
        if (page["url"] in used or not contains(page["content"], item.price_evidence)
                or not contains(page["content"], item.learning_evidence)):
            continue
        cost = item.price_evidence.casefold()
        if item.price_type == "free" and (not re.search(r"\bfree\b", cost) or re.search(r"\b(trial|preview)\b", cost)):
            continue
        if item.price_type == "paid" and not re.search(r"(?:[$€£]\s*\d|\d\s*(?:usd|eur|gbp)|\bpaid\b)", cost):
            continue
        group = resources[item.price_type]
        if len(group) >= 5:
            continue
        used.add(page["url"])
        group.append({"title": item.title, "url": page["url"], "price_type": item.price_type,
                      "price_evidence": item.price_evidence, "learning_evidence": item.learning_evidence,
                      "relevance": item.relevance, "checked_at": now})
    return {"result": {"skill": state["skill"], **resources, "source": "synthetic" if mock else "keenable", "retrieved_at": now}}


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
