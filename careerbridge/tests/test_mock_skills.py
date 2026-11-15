"""Unit tests for careerbridge.mock_skills — run with: python -m careerbridge.tests.test_mock_skills"""

from careerbridge.mock_skills import extract_mock_skills

SAMPLE_RESUME = """
Jane Doe — Software Developer

Summary
Backend developer with 5 years building services in Java and Spring Boot.

Experience
- Designed and documented REST APIs consumed by 3 internal teams.
- Containerized services with Docker for staging and production.
- Tuned queries against a PostgreSQL database (aka Postgres) for a claims platform.
- Built a small internal tool with React.js and Node.js.
- Wrote C++ for a performance-critical pricing engine, and C# for a legacy .NET service.
- Automated releases with CI/CD pipelines on GitHub Actions.
- Mentoring two junior engineers and leading stand-ups as part of an Agile team.
- Let's go get lunch after the sprint review.
- Rounded out the quarter with some rest and relaxation.
"""


def _names(found: list[dict]) -> set[str]:
    return {item["name"] for item in found}


def test_finds_canonical_and_aliases():
    found = extract_mock_skills(SAMPLE_RESUME)
    names = _names(found)
    assert "Java" in names
    assert "Spring Boot" in names
    assert "REST APIs" in names
    assert "Docker" in names
    assert "PostgreSQL" in names  # matched via alias "Postgres"
    assert "React" in names  # matched via alias "React.js"
    assert "Node.js" in names


def test_special_characters():
    found = _names(extract_mock_skills(SAMPLE_RESUME))
    assert "C++" in found
    assert "C#" in found
    assert ".NET" in found
    assert "CI/CD" in found


def test_nontechnical_skill():
    found = extract_mock_skills(SAMPLE_RESUME)
    mentoring = next((s for s in found if s["name"] == "Mentoring"), None)
    agile = next((s for s in found if s["name"] == "Agile"), None)
    assert mentoring is not None and mentoring["category"] == "nontechnical"
    assert agile is not None and agile["category"] == "nontechnical"


def test_false_positives_are_avoided():
    found = _names(extract_mock_skills(SAMPLE_RESUME))
    assert "Go" not in found  # "Let's go" must not match
    assert "R" not in found  # no "R programming"/"R language"/"RStudio" present


def test_each_skill_appears_once():
    found = extract_mock_skills(SAMPLE_RESUME + "\nJava, Java, Java everywhere.")
    names = [item["name"] for item in found]
    assert names.count("Java") == 1


def test_excerpt_is_substring_of_document():
    found = extract_mock_skills(SAMPLE_RESUME)
    for item in found:
        assert item["evidence"] in SAMPLE_RESUME


def test_go_and_r_match_when_unambiguous():
    text = "Backend services in Golang, plus some R programming for analytics and RStudio notebooks."
    found = _names(extract_mock_skills(text))
    assert "Go" in found
    assert "R" in found


if __name__ == "__main__":
    tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for test in tests:
        try:
            test()
            print(f"[PASS] {test.__name__}")
            passed += 1
        except AssertionError as exc:
            print(f"[FAIL] {test.__name__}: {exc}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
