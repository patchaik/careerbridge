"""Mock-mode skill recognizer: no AI calls, just a curated list of canonical
skill name -> category -> match phrases (aliases), with whole-word,
case-insensitive matching and a handful of deliberate false-positive guards
(Go, R, C are only matched via unambiguous phrases, never bare).

Used only when CAREERBRIDGE_ANALYST_MODE=mock. `careerbridge/analyst.py` calls
`extract_mock_skills` and keeps everything else about extraction unchanged.
"""

from __future__ import annotations

import re

# Each entry: canonical display name, category ("technical" | "nontechnical"),
# and the literal phrases that count as a match (the canonical name itself is
# NOT implicitly included — list it explicitly if it should match bare).
MOCK_SKILLS: list[dict] = [
    # ---- Languages ---------------------------------------------------------
    {"name": "Python", "category": "technical", "patterns": ["Python"]},
    {"name": "Java", "category": "technical", "patterns": ["Java"]},
    {"name": "JavaScript", "category": "technical", "patterns": ["JavaScript", "JS"]},
    {"name": "TypeScript", "category": "technical", "patterns": ["TypeScript", "TS"]},
    {"name": "C++", "category": "technical", "patterns": ["C++"]},
    {"name": "C#", "category": "technical", "patterns": ["C#"]},
    {"name": "Go", "category": "technical",
     "patterns": ["Golang", "Go programming", "Go language"]},
    {"name": "Rust", "category": "technical", "patterns": ["Rust"]},
    {"name": "Kotlin", "category": "technical", "patterns": ["Kotlin"]},
    {"name": "Swift", "category": "technical", "patterns": ["Swift"]},
    {"name": "PHP", "category": "technical", "patterns": ["PHP"]},
    {"name": "Ruby", "category": "technical", "patterns": ["Ruby"]},
    {"name": "R", "category": "technical",
     "patterns": ["R programming", "R language", "RStudio"]},
    {"name": "SQL", "category": "technical", "patterns": ["SQL"]},
    {"name": "HTML", "category": "technical", "patterns": ["HTML"]},
    {"name": "CSS", "category": "technical", "patterns": ["CSS"]},

    # ---- Frameworks / libraries --------------------------------------------
    {"name": "React", "category": "technical", "patterns": ["React", "React.js", "ReactJS"]},
    {"name": "Angular", "category": "technical", "patterns": ["Angular"]},
    {"name": "Vue", "category": "technical", "patterns": ["Vue", "Vue.js"]},
    {"name": "Next.js", "category": "technical", "patterns": ["Next.js", "NextJS"]},
    {"name": "Node.js", "category": "technical", "patterns": ["Node.js", "Node", "NodeJS"]},
    {"name": "Express", "category": "technical", "patterns": ["Express"]},
    {"name": "Spring Boot", "category": "technical", "patterns": ["Spring Boot", "Spring"]},
    {"name": "Django", "category": "technical", "patterns": ["Django"]},
    {"name": "Flask", "category": "technical", "patterns": ["Flask"]},
    {"name": "FastAPI", "category": "technical", "patterns": ["FastAPI"]},
    {"name": ".NET", "category": "technical", "patterns": [".NET"]},
    {"name": "Tailwind CSS", "category": "technical", "patterns": ["Tailwind CSS", "Tailwind"]},

    # ---- Data & AI ----------------------------------------------------------
    {"name": "Machine Learning", "category": "technical", "patterns": ["Machine Learning", "ML"]},
    {"name": "Deep Learning", "category": "technical", "patterns": ["Deep Learning"]},
    {"name": "NLP", "category": "technical", "patterns": ["NLP", "Natural Language Processing"]},
    {"name": "TensorFlow", "category": "technical", "patterns": ["TensorFlow"]},
    {"name": "PyTorch", "category": "technical", "patterns": ["PyTorch"]},
    {"name": "scikit-learn", "category": "technical", "patterns": ["scikit-learn", "sklearn"]},
    {"name": "Pandas", "category": "technical", "patterns": ["Pandas"]},
    {"name": "NumPy", "category": "technical", "patterns": ["NumPy"]},
    {"name": "LLMs", "category": "technical", "patterns": ["LLMs", "LLM", "Large Language Models"]},
    {"name": "RAG", "category": "technical",
     "patterns": ["RAG", "Retrieval-Augmented Generation", "Retrieval Augmented Generation"]},
    {"name": "Prompt Engineering", "category": "technical", "patterns": ["Prompt Engineering"]},
    {"name": "LangChain", "category": "technical", "patterns": ["LangChain"]},
    {"name": "LangGraph", "category": "technical", "patterns": ["LangGraph"]},
    {"name": "Data Analysis", "category": "technical", "patterns": ["Data Analysis"]},
    {"name": "Data Visualization", "category": "technical", "patterns": ["Data Visualization"]},
    {"name": "Tableau", "category": "technical", "patterns": ["Tableau"]},
    {"name": "Power BI", "category": "technical", "patterns": ["Power BI"]},
    {"name": "Excel", "category": "technical", "patterns": ["Excel"]},

    # ---- Cloud & DevOps -------------------------------------------------------
    {"name": "AWS", "category": "technical", "patterns": ["AWS"]},
    {"name": "Azure", "category": "technical", "patterns": ["Azure"]},
    {"name": "Google Cloud", "category": "technical", "patterns": ["Google Cloud", "GCP"]},
    {"name": "Docker", "category": "technical", "patterns": ["Docker"]},
    {"name": "Kubernetes", "category": "technical", "patterns": ["Kubernetes", "K8s"]},
    {"name": "Terraform", "category": "technical", "patterns": ["Terraform"]},
    {"name": "CI/CD", "category": "technical", "patterns": ["CI/CD"]},
    {"name": "GitHub Actions", "category": "technical", "patterns": ["GitHub Actions"]},
    {"name": "Jenkins", "category": "technical", "patterns": ["Jenkins"]},
    {"name": "Git", "category": "technical", "patterns": ["Git"]},
    {"name": "Linux", "category": "technical", "patterns": ["Linux"]},
    {"name": "REST APIs", "category": "technical",
     "patterns": ["REST API", "REST APIs", "RESTful"]},
    {"name": "GraphQL", "category": "technical", "patterns": ["GraphQL"]},
    {"name": "Microservices", "category": "technical", "patterns": ["Microservices"]},

    # ---- Databases ------------------------------------------------------------
    {"name": "PostgreSQL", "category": "technical", "patterns": ["PostgreSQL", "Postgres"]},
    {"name": "MySQL", "category": "technical", "patterns": ["MySQL"]},
    {"name": "MongoDB", "category": "technical", "patterns": ["MongoDB"]},
    {"name": "Oracle", "category": "technical", "patterns": ["Oracle"]},
    {"name": "Redis", "category": "technical", "patterns": ["Redis"]},
    {"name": "Supabase", "category": "technical", "patterns": ["Supabase"]},
    {"name": "Firebase", "category": "technical", "patterns": ["Firebase"]},

    # ---- Testing & design -------------------------------------------------------
    {"name": "Unit Testing", "category": "technical", "patterns": ["Unit Testing"]},
    {"name": "Selenium", "category": "technical", "patterns": ["Selenium"]},
    {"name": "Jest", "category": "technical", "patterns": ["Jest"]},
    {"name": "Cypress", "category": "technical", "patterns": ["Cypress"]},
    {"name": "Figma", "category": "technical", "patterns": ["Figma"]},
    {"name": "UI/UX Design", "category": "technical", "patterns": ["UI/UX Design", "UI/UX", "UX Design"]},

    # ---- Interpersonal / work skills -------------------------------------------
    {"name": "Communication", "category": "nontechnical", "patterns": ["Communication"]},
    {"name": "Leadership", "category": "nontechnical", "patterns": ["Leadership"]},
    {"name": "Teamwork", "category": "nontechnical", "patterns": ["Teamwork", "Collaboration"]},
    {"name": "Project Management", "category": "nontechnical", "patterns": ["Project Management"]},
    {"name": "Agile", "category": "nontechnical", "patterns": ["Agile"]},
    {"name": "Scrum", "category": "nontechnical", "patterns": ["Scrum"]},
    {"name": "Problem Solving", "category": "nontechnical", "patterns": ["Problem Solving"]},
    {"name": "Mentoring", "category": "nontechnical", "patterns": ["Mentoring"]},
    {"name": "Customer Service", "category": "nontechnical", "patterns": ["Customer Service"]},
    {"name": "Public Speaking", "category": "nontechnical", "patterns": ["Public Speaking"]},
    {"name": "Time Management", "category": "nontechnical", "patterns": ["Time Management"]},
    {"name": "Stakeholder Management", "category": "nontechnical",
     "patterns": ["Stakeholder Management"]},
]


def _compile(entry: dict) -> re.Pattern:
    alts = sorted({re.escape(p) for p in entry["patterns"]}, key=len, reverse=True)
    body = "|".join(alts)
    return re.compile(rf"(?<!\w)(?:{body})(?!\w)", re.IGNORECASE)


_COMPILED = [(entry, _compile(entry)) for entry in MOCK_SKILLS]


def _excerpt_for(text: str, start: int, end: int, max_len: int = 200) -> str:
    """The line containing the match, trimmed to ~max_len chars around the match.
    Always a literal substring of `text` so the "excerpt is in the document" check passes.
    """
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    if line_end == -1:
        line_end = len(text)
    line = text[line_start:line_end].strip()
    if len(line) <= max_len:
        return line
    rel_start, rel_end = start - line_start, end - line_start
    center = (rel_start + rel_end) // 2
    half = max_len // 2
    window_start = max(0, center - half)
    window_end = min(len(line), window_start + max_len)
    window_start = max(0, window_end - max_len)
    return line[window_start:window_end].strip()


def extract_mock_skills(text: str) -> list[dict]:
    """Every mock skill found in `text`, each at most once, as
    [{"name", "category", "evidence"}, ...] — same shape as careerbridge.schemas.Skill.
    """
    found = []
    for entry, pattern in _COMPILED:
        match = pattern.search(text)
        if not match:
            continue
        found.append({
            "name": entry["name"],
            "category": entry["category"],
            "evidence": _excerpt_for(text, match.start(), match.end()),
        })
    return found
