-- =====================================================================
-- CareerBridge database schema (DB Layer Design v2)
-- 18 tables in 6 domains. Run once in the Supabase SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every write
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- A. Identity and goals
-- =====================================================================
create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  name             text,
  auth_provider    text default 'email',
  preferences_json jsonb not null default '{}'::jsonb,
  consent_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists career_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  target_role   text not null,
  location      text,
  seniority     text,
  learning_goal text,
  modality      text not null default 'both'
                check (modality in ('text', 'hands_on', 'both')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- P1
create table if not exists workflow_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  goal_id     uuid references career_goals(id) on delete cascade,
  state       text not null default 'ONBOARDING'
              check (state in ('ONBOARDING', 'PROFILE_REVIEW', 'JOB_SEARCH',
                               'GAP_ANALYSIS', 'PATH_APPROVAL', 'LEARNING',
                               'ASSESSING', 'REMEDIATION', 'EVIDENCE_VERIFIED',
                               'RESUME_REVIEW', 'EXPORT_READY')),
  state_json  jsonb not null default '{}'::jsonb,
  next_action text,
  retry_count int not null default 0 check (retry_count between 0 and 3),
  errors_json jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- P1
create table if not exists audit_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  event_type  text not null,
  entity_type text,
  entity_id   uuid,
  detail_json jsonb not null default '{}'::jsonb,  -- never résumé text
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- B. Candidate profile
-- =====================================================================
create table if not exists candidate_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  source          text not null check (source in ('resume', 'manual')),
  file_ref        text,          -- path in private storage bucket
  parsed_text     text,
  experience_json jsonb not null default '[]'::jsonb,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists skills (
  id              uuid primary key default gen_random_uuid(),
  canonical_name  text not null unique,
  category        text not null default 'technical'
                  check (category in ('technical', 'interpersonal', 'domain')),
  aliases_json    jsonb not null default '[]'::jsonb,
  parent_skill_id uuid references skills(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists candidate_skill_evidence (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references candidate_profiles(id) on delete cascade,
  skill_id      uuid not null references skills(id),
  evidence_type text not null
                check (evidence_type in ('resume', 'self_reported', 'diagnostic')),
  excerpt       text,
  status        text not null default 'not_established'
                check (status in ('present', 'user_confirmed', 'self_reported',
                                  'not_established', 'demonstrated')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, skill_id)
);

-- =====================================================================
-- C. Market evidence
-- =====================================================================
create table if not exists job_postings (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null
                  check (provider in ('adzuna', 'greenhouse', 'cached', 'synthetic')),
  provider_job_id text not null,
  title           text not null,
  company         text,
  location        text,
  url             text not null,             -- no invented jobs
  description     text,
  completeness    text not null default 'full'
                  check (completeness in ('full', 'partial')),
  retrieved_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, provider_job_id)
);

create table if not exists job_skill_requirements (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references job_postings(id) on delete cascade,
  skill_id   uuid not null references skills(id),
  importance text not null check (importance in ('required', 'preferred')),
  excerpt    text not null,                  -- every gap traces to a job passage
  confidence numeric(3,2) check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, skill_id)
);

create table if not exists gap_analyses (
  id                   uuid primary key default gen_random_uuid(),
  goal_id              uuid not null references career_goals(id) on delete cascade,
  profile_id           uuid not null references candidate_profiles(id) on delete cascade,
  job_ids_json         jsonb not null default '[]'::jsonb,
  existing_skills_json jsonb not null default '[]'::jsonb,
  market_skills_json   jsonb not null default '[]'::jsonb,
  ranked_gaps_json     jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (jsonb_array_length(existing_skills_json) <= 10),
  check (jsonb_array_length(market_skills_json)   <= 10),
  check (jsonb_array_length(ranked_gaps_json)     <= 10)
);

-- =====================================================================
-- D. Learning
-- =====================================================================
create table if not exists learning_paths (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references career_goals(id) on delete cascade,
  skill_id        uuid not null references skills(id),
  objective       text not null,
  milestones_json jsonb not null default '[]'::jsonb,
  status          text not null default 'proposed'
                  check (status in ('proposed', 'approved', 'in_progress',
                                    'completed', 'paused')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists learning_resources (
  id            uuid primary key default gen_random_uuid(),
  skill_id      uuid not null references skills(id) on delete cascade,
  title         text not null,
  provider      text,
  url           text not null,
  price_type    text not null default 'unknown'
                check (price_type in ('free', 'paid', 'mixed', 'unknown')),
  modality      text,
  level         text,
  concepts_json jsonb not null default '[]'::jsonb,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (skill_id, url)
);

-- P1
create table if not exists learning_sessions (
  id           uuid primary key default gen_random_uuid(),
  path_id      uuid not null references learning_paths(id) on delete cascade,
  milestone_id text not null,
  mode         text not null check (mode in ('written', 'hands_on')),
  state_json   jsonb not null default '{}'::jsonb,
  hint_count   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =====================================================================
-- E. Mastery and evidence
-- =====================================================================
create table if not exists rubric_versions (
  id              uuid primary key default gen_random_uuid(),
  skill_id        uuid not null references skills(id),
  version         int not null,
  criteria_json   jsonb not null,
  approval_status text not null default 'draft'
                  check (approval_status in ('draft', 'reviewed', 'frozen')),
  frozen_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (skill_id, version),
  check ((approval_status = 'frozen') = (frozen_at is not null))
);

create table if not exists assessment_attempts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  rubric_id            uuid not null references rubric_versions(id),
  quiz_results_json    jsonb not null default '{}'::jsonb,
  project_results_json jsonb not null default '{}'::jsonb,
  score_json           jsonb not null default '{}'::jsonb,
  status               text not null default 'in_progress'
                       check (status in ('in_progress', 'submitted', 'passed',
                                         'failed', 'needs_review')),
  idempotency_key      text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists verified_skill_evidence (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  skill_id    uuid not null references skills(id),
  attempt_id  uuid not null unique references assessment_attempts(id) on delete cascade,
  scope       text not null,      -- e.g. 'simulated platform project'
  summary     text,
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- F. Résumé and wellbeing
-- =====================================================================
create table if not exists resume_versions (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references candidate_profiles(id) on delete cascade,
  base_file_ref     text,
  changes_json      jsonb not null default '[]'::jsonb,
  evidence_ids_json jsonb not null default '[]'::jsonb,
  status            text not null default 'draft'
                    check (status in ('draft', 'approved', 'exported', 'rejected')),
  approved_at       timestamptz,
  export_file_ref   text,
  idempotency_key   text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- export needs approval
  check (status not in ('approved', 'exported') or approved_at is not null),
  check (status <> 'exported' or export_file_ref is not null)
);

-- P1. Deliberately no foreign key from any scoring table.
create table if not exists wellbeing_preferences (
  user_id         uuid primary key references users(id) on delete cascade,
  opted_in        boolean not null default false,
  support_style   text,
  last_checkin_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- Integrity triggers
-- =====================================================================

-- 1. Frozen rubrics are read-only (changes must create a new version)
create or replace function block_frozen_rubric_update() returns trigger as $$
begin
  if old.frozen_at is not null then
    raise exception 'Rubric % version % is frozen; create a new version instead',
      old.skill_id, old.version;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rubric_frozen on rubric_versions;
create trigger trg_rubric_frozen
  before update on rubric_versions
  for each row execute function block_frozen_rubric_update();

-- 2. Attempts may only use frozen rubrics
create or replace function require_frozen_rubric() returns trigger as $$
begin
  if not exists (select 1 from rubric_versions
                 where id = new.rubric_id and approval_status = 'frozen') then
    raise exception 'Assessment attempts require a frozen rubric';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_attempt_frozen_rubric on assessment_attempts;
create trigger trg_attempt_frozen_rubric
  before insert on assessment_attempts
  for each row execute function require_frozen_rubric();

-- 3. Verified evidence only from a passing attempt, for the same user and skill
create or replace function require_passed_attempt() returns trigger as $$
declare
  a record;
begin
  select at.status, at.user_id, rv.skill_id into a
  from assessment_attempts at
  join rubric_versions rv on rv.id = at.rubric_id
  where at.id = new.attempt_id;

  if a.status is distinct from 'passed' then
    raise exception 'Verified evidence requires a passed attempt';
  end if;
  if a.user_id <> new.user_id or a.skill_id <> new.skill_id then
    raise exception 'Evidence user/skill must match the attempt';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_evidence_passed on verified_skill_evidence;
create trigger trg_evidence_passed
  before insert or update on verified_skill_evidence
  for each row execute function require_passed_attempt();

-- updated_at trigger on every table
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'career_goals', 'workflow_runs', 'audit_events',
    'candidate_profiles', 'skills', 'candidate_skill_evidence',
    'job_postings', 'job_skill_requirements', 'gap_analyses',
    'learning_paths', 'learning_resources', 'learning_sessions',
    'rubric_versions', 'assessment_attempts', 'verified_skill_evidence',
    'resume_versions', 'wellbeing_preferences']
  loop
    execute format('drop trigger if exists trg_%s_updated on %I', t, t);
    execute format('create trigger trg_%s_updated before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- Indexes for common lookups
-- =====================================================================
create index if not exists idx_goals_user        on career_goals(user_id);
create index if not exists idx_profiles_user     on candidate_profiles(user_id);
create index if not exists idx_evidence_profile  on candidate_skill_evidence(profile_id);
create index if not exists idx_reqs_job          on job_skill_requirements(job_id);
create index if not exists idx_reqs_skill        on job_skill_requirements(skill_id);
create index if not exists idx_gaps_goal         on gap_analyses(goal_id);
create index if not exists idx_paths_goal        on learning_paths(goal_id);
create index if not exists idx_resources_skill   on learning_resources(skill_id);
create index if not exists idx_attempts_user     on assessment_attempts(user_id);
create index if not exists idx_verified_user     on verified_skill_evidence(user_id);
create index if not exists idx_resumes_profile   on resume_versions(profile_id);

-- =====================================================================
-- Row-level security
-- RLS is ON with no policies: the public (anon/publishable) key can read
-- nothing. The Python backend uses the secret key, which bypasses RLS.
-- Add per-user policies later if you adopt Supabase Auth.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'career_goals', 'workflow_runs', 'audit_events',
    'candidate_profiles', 'skills', 'candidate_skill_evidence',
    'job_postings', 'job_skill_requirements', 'gap_analyses',
    'learning_paths', 'learning_resources', 'learning_sessions',
    'rubric_versions', 'assessment_attempts', 'verified_skill_evidence',
    'resume_versions', 'wellbeing_preferences']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- =====================================================================
-- Private storage bucket for résumés and exports
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('careerbridge-private', 'careerbridge-private', false)
on conflict (id) do nothing;

-- =====================================================================
-- Check: should list 18 tables
-- =====================================================================
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
