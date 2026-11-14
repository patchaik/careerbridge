# CareerBridge data layer (`database/`)

All database and file-storage access goes through this package. Other modules
never write SQL or call Supabase directly. Every function returns plain dicts
or lists and raises `DBError` with a message that is safe to show in the UI.

## Setup

1. Run `database/schema.sql` once in the Supabase SQL Editor (creates 18 tables,
   integrity triggers and the private `careerbridge-private` bucket).
2. Create `.env` in the repo root (never commit it):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_KEY=<secret / service_role key>
   ```
3. `pip install -r db_requirements.txt`
4. `python3 database_tests/test_db_setup.py`, then `python3 database_tests/test_db_layer.py`

## Quick start

```python
from database import users, profiles, jobs, learning, mastery, resumes, admin, DBError

user    = users.create_user("ana@example.com", "Ana")
goal    = users.create_goal(user["id"], "Software Engineer, AI Applications")
profile = profiles.create_profile(user["id"], "resume", parsed_text=text,
                                  file_bytes=pdf_bytes, file_name="cv.pdf")
profiles.add_skill_evidence(profile["id"], "Python", "resume", "5 years Python", "present")

job = jobs.upsert_job_posting({"provider": "greenhouse", "provider_job_id": "123",
                               "title": "AI Engineer", "url": "https://..."})
jobs.add_job_requirements(job["id"], [{"skill": "RAG", "importance": "required",
                                       "excerpt": "Build RAG pipelines"}])
analysis = jobs.create_gap_analysis(goal["id"], profile["id"], [job["id"]],
                                    existing_skills=["Python"], market_skills=["Python", "RAG"],
                                    ranked_gaps=[{"skill": "RAG", "job_ids": [job["id"]]}])
report = jobs.gap_report(analysis["id"])   # gaps with job titles, links and excerpts
```

Skills can be passed by name, alias or UUID; new names are added to the shared
`skills` table automatically.

## Modules

| Module | Covers |
| --- | --- |
| `users.py` | users, career goals, workflow runs (P1), audit events (P1) |
| `profiles.py` | candidate profiles, résumé file, skills taxonomy, skill evidence |
| `jobs.py` | job postings, requirements with excerpts, gap analyses, `gap_report` |
| `learning.py` | learning paths, milestones, resources, tutor sessions (P1) |
| `mastery.py` | rubrics (draft → reviewed → frozen), attempts, verified evidence |
| `resumes.py` | résumé drafts, approval, export to private storage, signed URLs |
| `wellbeing.py` | wellbeing preferences (P1); never import from scoring code |
| `admin.py` | `health_check`, `seed_demo_data`, `delete_demo_data`, `top_skill_gaps`, `export_user_data` |
| `models.py` | shared Pydantic shapes and allowed values |

## Rules enforced here (and by database triggers)

- A skill missing from the résumé is `not_established`; only a passed attempt makes it `demonstrated`.
- Job postings need a `url` and `provider`; requirements need the job `excerpt`.
- Each gap must cite the job IDs that ask for it. Max 10 existing, market and gap skills.
- Frozen rubrics are read-only; attempts need a frozen rubric.
- Résumé changes cite only the user's verified evidence; export needs approval.
- `delete_user` removes all of a user's rows and stored files.

## Demo data

```python
from database import admin
ids = admin.seed_demo_data()     # synthetic persona, 3 jobs, RAG gap, frozen RAG rubric
admin.delete_demo_data()         # removes the persona and everything it owns
```

Demo jobs and resources use `example.com` links and are labeled synthetic or
placeholder. Replace resource links with verified ones before showing them.
