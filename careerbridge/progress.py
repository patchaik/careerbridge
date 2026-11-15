"""Read-only progress and deterministic next steps from saved learning results."""

from urllib.parse import quote, urlencode
from database import jobs, learning, mastery, users
from careerbridge.store import call, list_paths_flow


def plan_summary(plan, state):
    result = state.get("result") if state.get("status") == "completed" else None
    milestones = {m["id"]: m for m in plan["milestones"]}
    review = {}

    def add(mid, reason):
        if mid in milestones:
            item = review.setdefault(
                mid,
                {"milestone_id": mid, "title": milestones[mid]["title"], "reasons": []},
            )
            if reason not in item["reasons"]:
                item["reasons"].append(reason)

    if result:
        for item in result["quiz"]:
            if not item["correct"]:
                add(item["milestone_id"], item["explanation"])
        criteria = {c["id"]: c for c in state["content"]["criteria"]}
        for item in result["feedback"]["criteria"]:
            if not item["met"] and item["criterion_id"] in criteria:
                add(criteria[item["criterion_id"]]["milestone_id"], item["next_step"])
    return {
        "path_id": plan["id"],
        "goal_id": plan["goal_id"],
        "skill": plan["skill"],
        "objective": plan["objective"],
        "status": plan["status"],
        "progress": plan["progress"],
        "check_status": state.get("status", "not_started"),
        "check_result": {
            "quiz_score": result["quiz_score"],
            "quiz_total": result["quiz_total"],
            "criteria_met": sum(c["met"] for c in result["feedback"]["criteria"]),
            "criteria_total": len(result["feedback"]["criteria"]),
            "submitted_at": result["submitted_at"],
        }
        if result
        else None,
        "revisit": list(review.values()),
    }


def recommend(plans, goal, analysis, verified_names):
    ranked = []

    def add(priority, kind, title, reason, href, path_id=None, skill=None):
        ranked.append(
            (
                priority,
                {
                    "kind": kind,
                    "title": title,
                    "reason": reason,
                    "href": href,
                    "path_id": path_id,
                    "skill": skill,
                },
            )
        )

    for plan in plans:
        pid, skill = plan["path_id"], plan["skill"]
        href = "/learn?" + urlencode({"path": pid})
        progress = plan["progress"]
        if plan["revisit"]:
            first = plan["revisit"][0]
            add(
                0,
                "revisit",
                f"Revisit {skill}: {first['title']}",
                "Your saved learning check identified points to practice. "
                + first["reasons"][0],
                href + "#milestone-" + quote(first["milestone_id"], safe=""),
                pid,
                skill,
            )
        elif plan["status"] == "proposed":
            add(
                4,
                "accept_plan",
                f"Review your {skill} plan",
                "Accept the plan before starting its milestones.",
                href,
                pid,
                skill,
            )
        elif progress["completed"] < progress["total"]:
            add(
                2,
                "continue_plan",
                f"Continue {skill}",
                "Work through your next incomplete milestone.",
                href
                + "#milestone-"
                + quote(progress["next_milestone_id"] or "", safe=""),
                pid,
                skill,
            )
        elif not plan["check_result"]:
            pending = plan["check_status"] in ("grading", "feedback_pending")
            add(
                1 if pending else 3,
                "learning_check",
                f"{'Resume' if pending else 'Open'} your {skill} learning check",
                "Your submitted answers are saved; reload or retry feedback."
                if pending
                else "All milestones are complete. Check your understanding and save feedback.",
                href + "#learning-check",
                pid,
                skill,
            )

    # Existing plans (including other goals) remain visible above. Do not repeatedly
    # recommend starting the same skill, or imply a formative check closes a gap.
    planned = {p["skill"].casefold() for p in plans}
    gaps = sorted(
        (analysis or {}).get("ranked_gaps_json", []),
        key=lambda g: (g.get("importance") != "required", -(g.get("frequency") or 0)),
    )
    for gap in gaps:
        skill = gap["skill"]
        if skill.casefold() not in planned | verified_names:
            add(
                5,
                "learn_gap",
                f"Learn {skill}",
                "This unaddressed gap appears in your latest saved job analysis. Required skills and higher frequency come first.",
                "/courses?" + urlencode({"analysis": analysis["id"], "skill": skill}),
                skill=skill,
            )
    if not ranked:
        if not goal:
            add(
                6,
                "set_goal",
                "Set your next career goal",
                "Choose a target role to identify the skills to work on next.",
                "/start",
            )
        elif not analysis:
            add(
                6,
                "review_gaps",
                "Find your next skill gap",
                "Continue from your profile to search jobs and save a gap analysis.",
                "/start",
            )
        else:
            add(
                6,
                "review_learning",
                "Review your learning or update your goal",
                "No further practice was flagged in your saved checks. This does not independently verify mastery.",
                "/learn",
            )
    return [item for _, item in sorted(ranked, key=lambda pair: pair[0])[:5]]


def get_progress(user_id):
    goal = call(users.get_active_goal, user_id)
    analysis = call(jobs.get_latest_gap_analysis, goal["id"]) if goal else None
    saved = list_paths_flow(user_id)["plans"]
    checks = {
        w["state_json"]["path_id"]: w["state_json"]
        for w in call(learning.list_learning_checks, user_id, [p["id"] for p in saved])
    }
    plans = [plan_summary(p, checks.get(p["id"], {})) for p in saved]
    verified = call(mastery.list_verified_evidence, user_id)
    verified_names = {
        (v.get("skills") or {}).get("canonical_name", "").casefold() for v in verified
    }
    accepted = [p for p in plans if p["status"] != "proposed"]
    summary = {
        "plans_total": len(plans),
        "plans_accepted": len(accepted),
        "plans_completed": sum(p["status"] == "completed" for p in accepted),
        "milestones_completed": sum(p["progress"]["completed"] for p in accepted),
        "milestones_total": sum(p["progress"]["total"] for p in accepted),
        "checks_completed": sum(p["check_result"] is not None for p in accepted),
        "plans_to_revisit": sum(bool(p["revisit"]) for p in accepted),
    }
    gaps = []
    for gap in (analysis or {}).get("ranked_gaps_json", []):
        path = next(
            (
                p
                for p in plans
                if p["goal_id"] == goal["id"]
                and p["skill"].casefold() == gap["skill"].casefold()
            ),
            None,
        )
        status = (
            "demonstrated"
            if gap["skill"].casefold() in verified_names
            else (
                "learning" if path and path["status"] != "proposed" else "not_started"
            )
        )
        gaps.append(
            {
                "skill": gap["skill"],
                "status": status,
                "path_id": path["path_id"] if path else None,
            }
        )
    recommendations = recommend(plans, goal, analysis, verified_names)
    return {
        "goal": {k: v for k, v in goal.items() if v is not None} if goal else None,
        "gaps": gaps,
        "verified_evidence": [
            {
                k: value
                for k, value in {
                    "id": v["id"],
                    "skill": (v.get("skills") or {}).get("canonical_name"),
                    "scope": v.get("scope") or "",
                    "summary": v.get("summary"),
                    "attempt_id": v.get("attempt_id"),
                    "verified_at": v["verified_at"],
                }.items()
                if value is not None
            }
            for v in verified
        ],
        "next_action": recommendations[0]["title"],
        "summary": summary,
        "plans": plans,
        "recommendations": recommendations,
        "plan_limit": 50,
        "independently_verified": False,
    }
