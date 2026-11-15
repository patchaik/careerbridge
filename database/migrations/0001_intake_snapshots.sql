-- Additive DB-01 migration. Legacy records remain contract_version=0.
alter table users add column auth_subject uuid unique;
alter table users add column consent_version text;
alter table users add column display_name text not null default '';
alter table users alter column email drop not null;
alter table users add constraint users_id_owner unique (id, auth_subject);

alter table career_goals add column contract_version integer not null default 0 check (contract_version in (0,1));
alter table career_goals add constraint goals_owner unique (id, user_id);
alter table career_goals add constraint v1_goal_fields check (contract_version=0 or
  (length(trim(location))>0 and location is not null and length(trim(seniority))>0
   and seniority is not null and length(trim(learning_goal))>0 and learning_goal is not null));

create table assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  visibility text not null default 'private_user' check (visibility='private_user'),
  object_key text not null unique,
  media_type text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_user_id),
  check (object_key like owner_user_id::text || '/%' and object_key not like '%..%')
);
alter table candidate_profiles add column contract_version integer not null default 0 check (contract_version in (0,1));
alter table candidate_profiles add column revision integer not null default 1 check (revision>=1);
alter table candidate_profiles add column status text not null default 'draft' check (status in ('draft','confirmed','superseded'));
update candidate_profiles set status='confirmed' where confirmed_at is not null;
alter table candidate_profiles add column file_asset_id uuid;
alter table candidate_profiles add constraint profile_asset_owner foreign key (file_asset_id,user_id) references assets(id,owner_user_id);
alter table candidate_profiles add constraint profiles_owner unique (id,user_id);
alter table candidate_profiles add constraint profiles_revision unique (id,user_id,revision);
alter table candidate_profiles add constraint profile_confirmation check (contract_version=0 or ((status='confirmed')=(confirmed_at is not null)));

-- A single namespace prevents an alias from shadowing another canonical skill.
create function normalize_skill(text) returns text language sql immutable strict as $$
  select lower(regexp_replace(btrim($1), '\s+', ' ', 'g'))
$$;
create table skill_names (
  normalized_name text primary key check (normalized_name=normalize_skill(normalized_name) and length(normalized_name)>0),
  skill_id uuid not null references skills(id) on delete cascade
);
-- Fail atomically on ambiguous legacy names; never guess which skill to merge.
do $$ begin
  if exists (
    select normalize_skill(name) from (
      select id,canonical_name name from skills
      union all select s.id,a.value from skills s cross join lateral jsonb_array_elements_text(s.aliases_json) a
    ) n group by normalize_skill(name) having count(distinct id)>1
  ) then raise exception 'Ambiguous legacy skill names: resolve collisions before migrating'; end if;
end $$;
insert into skill_names select distinct normalize_skill(name),id from (
 select id,canonical_name name from skills
 union all select s.id,a.value from skills s cross join lateral jsonb_array_elements_text(s.aliases_json) a
) n;
create function register_skill_name() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (new.canonical_name,new.aliases_json) is distinct from (old.canonical_name,old.aliases_json) then
   raise exception 'Use skill_names for new aliases; canonical skill identity is stable';
 end if;
 if tg_op='INSERT' then
   insert into skill_names values (normalize_skill(new.canonical_name),new.id);
   if new.aliases_json<>'[]'::jsonb then raise exception 'Register aliases through skill_names'; end if;
 end if;
 return new;
end $$;
create trigger skill_names_register after insert or update on skills for each row execute function register_skill_name();

-- Preserve multiple source records; the legacy upsert API is no longer a v1 writer.
alter table candidate_skill_evidence drop constraint candidate_skill_evidence_profile_id_skill_id_key;
create function guard_profile_evidence() returns trigger language plpgsql as $$
declare p candidate_profiles; pid uuid;
begin
 pid := case when tg_op='DELETE' then old.profile_id else new.profile_id end;
 select * into p from candidate_profiles where id=pid for update;
 if tg_op='UPDATE' and new.profile_id<>old.profile_id then raise exception 'Evidence cannot move between profiles'; end if;
 if p.contract_version=1 then
   if p.status<>'draft' then raise exception 'Confirmed profile evidence is immutable'; end if;
   if tg_op<>'DELETE' and (new.status='demonstrated' or new.evidence_type='diagnostic') then
     raise exception 'Intake cannot create verified mastery or diagnostic evidence';
   end if;
   update candidate_profiles set revision=revision+1 where id=pid;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger profile_evidence_guard before insert or update or delete on candidate_skill_evidence for each row execute function guard_profile_evidence();

create function guard_intake_snapshot() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' then
   if new.contract_version=1 and not exists (select 1 from users where id=new.user_id and auth_subject is not null) then
     raise exception 'v1 records require a verified auth subject';
   end if;
 elsif old.contract_version=1 then
   if tg_table_name='career_goals' then
     if (to_jsonb(new)-'is_active'-'updated_at') is distinct from (to_jsonb(old)-'is_active'-'updated_at') then
       raise exception 'Goal fields are immutable; create a new goal';
     end if;
   elsif old.status<>'draft' then raise exception 'Confirmed profile is immutable; create a new profile';
   elsif new.user_id<>old.user_id or new.contract_version<>old.contract_version or new.revision<>old.revision+1 then
     raise exception 'Profile edit requires the next revision and the same owner';
   end if;
 elsif new.contract_version<>old.contract_version then raise exception 'Legacy records require explicit re-intake';
 end if;
 return new;
end $$;
create trigger goal_snapshot_guard before insert or update on career_goals for each row execute function guard_intake_snapshot();
create trigger profile_snapshot_guard before insert or update on candidate_profiles for each row execute function guard_intake_snapshot();

create table journeys (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
 goal_id uuid not null, profile_id uuid not null, profile_revision integer not null,
 state text not null default 'PROFILE_REVIEW' check (state in ('PROFILE_REVIEW','JOB_SEARCH','GAP_ANALYSIS')),
 revision integer not null default 1 check (revision>=1),
 next_action text not null default 'confirm_profile',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,user_id), unique (id,user_id,profile_id,profile_revision),
 foreign key (goal_id,user_id) references career_goals(id,user_id) on delete cascade,
 foreign key (profile_id,user_id,profile_revision) references candidate_profiles(id,user_id,revision) on delete cascade on update cascade
);
create function guard_journey() returns trigger language plpgsql as $$
begin
 if not exists (select 1 from candidate_profiles where id=new.profile_id and user_id=new.user_id
     and contract_version=1) or not exists (
     select 1 from career_goals where id=new.goal_id and user_id=new.user_id and contract_version=1) then
   raise exception 'Journey requires a v1 goal and profile';
 end if;
 if tg_op='UPDATE' and ((new.user_id,new.goal_id,new.profile_id) is distinct from
    (old.user_id,old.goal_id,old.profile_id) or (new.profile_revision<>old.profile_revision and old.state<>'PROFILE_REVIEW')) then raise exception 'Journey bindings are immutable'; end if;
 return new;
end $$;
create trigger journey_guard before insert or update on journeys for each row execute function guard_journey();

create table job_snapshots (
 id uuid primary key default gen_random_uuid(), provider text not null, provider_job_id text not null,
 data_origin text not null check (data_origin in ('live','cached','synthetic')),
 url text not null check (url like 'https://%'), retrieved_at timestamptz not null,
 title text not null, company text, location text, description text not null,
 description_sha256 text generated always as (encode(digest(description,'sha256'),'hex')) stored,
 completeness text not null check (completeness in ('full','partial')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (provider,provider_job_id,retrieved_at,description_sha256),
 check (provider not in ('cached','synthetic') or data_origin='synthetic')
);
create table job_searches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
 journey_id uuid not null, normalized_filters_json jsonb not null,
 status text not null check (status in ('available','empty','unavailable')),
 warnings_json jsonb not null default '[]', fallback_used boolean not null default false,
 sealed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,journey_id,user_id), foreign key (journey_id,user_id) references journeys(id,user_id) on delete cascade
);
create table job_search_snapshots (
 job_search_id uuid not null references job_searches(id) on delete cascade,
 job_snapshot_id uuid not null references job_snapshots(id),
 data_origin text not null check (data_origin in ('live','cached','synthetic')),
 primary key (job_search_id,job_snapshot_id)
);
alter table job_skill_requirements alter column job_id drop not null;
alter table job_skill_requirements add column job_snapshot_id uuid references job_snapshots(id);
alter table job_skill_requirements add constraint requirement_source check (num_nonnulls(job_id,job_snapshot_id)=1);
alter table job_skill_requirements drop constraint job_skill_requirements_importance_check;
alter table job_skill_requirements add check (importance in ('required','preferred','unspecified'));
alter table job_skill_requirements add unique (job_snapshot_id,skill_id);
create function guard_job_requirement() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and old.job_snapshot_id is not null then raise exception 'Snapshot requirements are immutable'; end if;
 if tg_op='INSERT' and new.job_snapshot_id is not null and exists (select 1 from job_search_snapshots where job_snapshot_id=new.job_snapshot_id) then
   raise exception 'Cannot add requirements to a referenced snapshot';
 end if;
 if new.job_snapshot_id is not null and not exists (select 1 from job_snapshots
    where id=new.job_snapshot_id and length(new.excerpt)>0 and position(new.excerpt in description)>0) then
   raise exception 'Requirement excerpt must occur in the snapshot description';
 end if;
 return new;
end $$;
create trigger job_requirement_guard before insert or update on job_skill_requirements for each row execute function guard_job_requirement();

alter table gap_analyses add column contract_version integer not null default 0 check (contract_version in (0,1));
alter table gap_analyses add column user_id uuid references users(id) on delete cascade;
alter table gap_analyses add column journey_id uuid;
alter table gap_analyses add column job_search_id uuid;
alter table gap_analyses add column profile_revision integer;
alter table gap_analyses add column eligible_job_count integer check (eligible_job_count>=0);
alter table gap_analyses add column warnings_json jsonb not null default '[]';
alter table gap_analyses add foreign key (journey_id,user_id,profile_id,profile_revision) references journeys(id,user_id,profile_id,profile_revision) on delete cascade;
alter table gap_analyses add foreign key (job_search_id,journey_id,user_id) references job_searches(id,journey_id,user_id) on delete cascade;
alter table gap_analyses add check (contract_version=0 or
 (user_id is not null and journey_id is not null and job_search_id is not null and profile_revision is not null and eligible_job_count is not null));
create function guard_gap_snapshot() returns trigger language plpgsql as $$
declare item jsonb; src jsonb;
begin
 if tg_op='UPDATE' and old.contract_version=1 then raise exception 'Gap analysis is immutable'; end if;
 if tg_op='UPDATE' and new.contract_version<>old.contract_version then raise exception 'Legacy gaps require fresh analysis'; end if;
 if new.contract_version=1 then
   if not exists (select 1 from job_searches where id=new.job_search_id and sealed) then raise exception 'Search must be sealed before gap analysis'; end if;
   if not exists (select 1 from journeys where id=new.journey_id and goal_id=new.goal_id) then raise exception 'Gap goal must match journey'; end if;
   for item in select value from jsonb_array_elements(new.ranked_gaps_json || new.market_skills_json) loop
     if jsonb_typeof(item->'sources') is distinct from 'array' or jsonb_array_length(item->'sources')=0 then
       raise exception 'Every market skill and gap requires sources'; end if;
     for src in select value from jsonb_array_elements(item->'sources') loop
       if not exists (select 1 from job_search_snapshots ss join job_skill_requirements r on r.job_snapshot_id=ss.job_snapshot_id
          join job_snapshots j on j.id=ss.job_snapshot_id join skills sk on sk.id=r.skill_id
          where ss.job_search_id=new.job_search_id and r.id=(src->>'requirement_id')::uuid
          and r.job_snapshot_id=(src->>'job_snapshot_id')::uuid and r.skill_id=(item->'skill'->>'id')::uuid
          and sk.canonical_name=item->'skill'->>'canonical_name' and sk.category=item->'skill'->>'category'
          and r.excerpt=src->>'excerpt' and r.importance=src->>'importance' and j.data_origin<>'synthetic') then
         raise exception 'Gap source must match the selected search, skill and requirement';
       end if;
     end loop;
   end loop;
 end if;
 return new;
end $$;
create trigger gap_snapshot_guard before insert or update on gap_analyses for each row execute function guard_gap_snapshot();

-- Snapshot contents are never updated. Deletes remain available for account erasure.
create function reject_snapshot_update() returns trigger language plpgsql as $$
begin
 if tg_table_name='job_searches' then
   if not old.sealed and new.sealed and (to_jsonb(new)-'sealed'-'updated_at')=(to_jsonb(old)-'sealed'-'updated_at') then return new; end if;
 end if;
 raise exception 'Snapshot is immutable';
end $$;
do $$ declare t text; begin
 foreach t in array array['assets','job_snapshots','job_searches','job_search_snapshots'] loop
  execute format('create trigger immutable_snapshot before update on %I for each row execute function reject_snapshot_update()',t);
 end loop;
 foreach t in array array['assets','skill_names','journeys','job_snapshots','job_searches','job_search_snapshots'] loop
  execute format('alter table %I enable row level security',t);
  execute format('grant all on %I to service_role',t);
 end loop;
end $$;
create index assets_owner_idx on assets(owner_user_id);
create index skill_names_skill_idx on skill_names(skill_id);
create index journeys_user_idx on journeys(user_id);
create index journeys_goal_idx on journeys(goal_id);
create index journeys_profile_idx on journeys(profile_id);
create index searches_journey_idx on job_searches(journey_id);
create index search_snapshot_idx on job_search_snapshots(job_snapshot_id);
create index requirement_snapshot_idx on job_skill_requirements(job_snapshot_id);
create index gap_journey_idx on gap_analyses(journey_id);
create index gap_search_idx on gap_analyses(job_search_id);
-- Legacy model-reviewed evidence remains untouched and is not exposed by v1 intake.

-- Prevent later taxonomy/requirement edits from changing established provenance.
create function guard_skill_name() returns trigger language plpgsql as $$
begin
 if (new.normalized_name,new.skill_id) is distinct from (old.normalized_name,old.skill_id) then
   raise exception 'A skill name cannot be reassigned';
 end if;
 return new;
end $$;
create trigger skill_name_guard before update on skill_names for each row execute function guard_skill_name();
create function guard_snapshot_requirement_delete() returns trigger language plpgsql as $$
begin
 if old.job_snapshot_id is not null then raise exception 'Snapshot requirements cannot be deleted'; end if;
 return old;
end $$;
create trigger requirement_delete_guard before delete on job_skill_requirements for each row execute function guard_snapshot_requirement_delete();

create function advance_confirmed_journey() returns trigger language plpgsql as $$
begin
 if new.contract_version=1 and new.status='confirmed' and old.status='draft' then
   update journeys set state='JOB_SEARCH',next_action='search_jobs',revision=revision+1 where profile_id=new.id and state='PROFILE_REVIEW';
 end if;
 return new;
end $$;
create trigger profile_journey_confirmed after update on candidate_profiles for each row execute function advance_confirmed_journey();
create function require_confirmed_search() returns trigger language plpgsql as $$
begin
 if not exists (select 1 from journeys j join candidate_profiles p on p.id=j.profile_id
    join users u on u.id=j.user_id where j.id=new.journey_id and j.user_id=new.user_id
    and p.status='confirmed' and u.consent_at is not null) then
   raise exception 'Search requires profile confirmation and consent';
 end if;
 return new;
end $$;
create trigger search_confirmation before insert on job_searches for each row execute function require_confirmed_search();

create function guard_search_membership() returns trigger language plpgsql as $$
declare origin text;
begin
 perform 1 from job_searches where id=new.job_search_id and not sealed for update;
 if not found then raise exception 'Search membership is sealed'; end if;
 select data_origin into origin from job_snapshots where id=new.job_snapshot_id;
 if new.data_origin<>origin and not (new.data_origin='cached' and origin<>'synthetic') then
   raise exception 'Search cannot relabel snapshot provenance';
 end if;
 return new;
end $$;
create trigger search_membership_guard before insert on job_search_snapshots for each row execute function guard_search_membership();
create function guard_search_membership_delete() returns trigger language plpgsql as $$
begin
 if exists (select 1 from job_searches where id=old.job_search_id and sealed) then
   raise exception 'Search membership is sealed; delete the owning search for erasure';
 end if;
 return old;
end $$;
create trigger search_membership_delete_guard before delete on job_search_snapshots for each row execute function guard_search_membership_delete();
