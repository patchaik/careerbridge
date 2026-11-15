import { CheckCircle2, LoaderCircle, Lock, Pencil, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TagInput } from "../components/ui/TagInput";
import {
  EXPERIENCE_LEVEL_OPTIONS,
  isProfileBasicsValid,
  ProfileBasics,
  SITUATION_OPTIONS,
  yearsOfExperienceError,
} from "../components/features/onboarding/ProfileBasics";
import { useJourney } from "../context/JourneyContext";
import { isReal } from "../lib/api/endpoints";
import { getSavedProfile } from "../lib/api/onboarding";
import { useBuildProfile, useParseResume } from "../hooks/useOnboarding";
import { useWorkflowPolling } from "../hooks/useWorkflow";
import type { CandidateProfile, CandidateSkillEvidence } from "../lib/types";

const SUGGESTED_SKILLS = ["Java", "Spring Boot", "REST APIs", "Docker", "SQL", "Python", "Communication"];
const SUGGESTED_INTERESTS = ["Building backend systems", "Mentoring", "Data and analytics", "Design"];

export function StartPage() {
  const navigate = useNavigate();
  const {
    situation,
    setSituation,
    experienceLevel,
    setExperienceLevel,
    yearsOfExperience,
    setYearsOfExperience,
    draftSkills,
    setDraftSkills,
    draftFromResume,
    setDraftFromResume,
    draftResumeSkillEvidence,
    setDraftResumeSkillEvidence,
    resumeMeta,
    setResumeMeta,
    userInterests,
    setUserInterests,
    profile,
    setProfile,
  } = useJourney();

  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [resumeWorkflowId, setResumeWorkflowId] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const [restoring, setRestoring] = useState(isReal("getProfile"));

  const [buildWorkflowId, setBuildWorkflowId] = useState<string | null>(null);
  const settledRef = useRef(false);

  // Once a profile is confirmed, /start shows a read-only summary with an
  // "Edit" button rather than the editable form — there's nothing to review
  // mid-flow anymore.
  const [isEditing, setIsEditing] = useState(() => !profile?.confirmedAt);

  const parseResume = useParseResume();
  const buildProfile = useBuildProfile();

  const resumeWorkflow = useWorkflowPolling<{ skills: CandidateSkillEvidence[]; profileId?: string }>(resumeWorkflowId);
  const buildWorkflow = useWorkflowPolling<{ profile: CandidateProfile }>(buildWorkflowId);

  const fromResume = new Set(draftFromResume);

  // Restore from Supabase, including a draft uploaded before a refresh. Local
  // storage is only a convenience, never proof that a profile/file exists.
  useEffect(() => {
    if (!isReal("getProfile")) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await getSavedProfile(profile?.id);
        if (cancelled) return;
        if (saved) {
          const changed = saved.id !== profile?.id;
          setProfile({ ...saved, situation, experienceLevel, yearsOfExperience });
          setIsEditing(!saved.confirmedAt);
          if (changed || !draftSkills.length) {
            setDraftSkills(saved.skills.map(s => s.skill));
            setDraftResumeSkillEvidence(saved.skills.filter(s => s.source === "resume"));
            setDraftFromResume(saved.skills.filter(s => s.source === "resume").map(s => s.skill));
          }
          if (changed) setResumeMeta(null);
        } else if (profile) {
          setProfile(null);
          setResumeMeta(null);
          setIsEditing(true);
          setBuildError("The previous profile is no longer saved. Upload your résumé again, or continue with self-reported skills.");
          setDraftFromResume([]);
          setDraftResumeSkillEvidence([]);
        }
      } catch (error) {
        if (!cancelled) setBuildError(error instanceof Error ? error.message : "Couldn't load your saved profile.");
      } finally { if (!cancelled) setRestoring(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once; later local edits belong to the learner
  }, []);

  // Merge résumé-extracted skills into the shared skills list once parsing completes.
  useEffect(() => {
    if (!resumeWorkflow) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (resumeWorkflow.status === "complete" && resumeWorkflow.result) {
        const evidence = resumeWorkflow.result.skills;
        const found = evidence.map((s) => s.skill);
        setDraftResumeSkillEvidence(evidence);
        const merged = [...draftSkills];
        for (const name of found) {
          if (!merged.some((m) => m.toLowerCase() === name.toLowerCase())) merged.push(name);
        }
        setDraftSkills(merged);
        setDraftFromResume([...new Set([...draftFromResume, ...found])]);
        setParseError(null);
        if (file) {
          setResumeMeta({ fileName: file.name, uploadedAt: new Date().toISOString(), status: "parsed" });
        }
      }
      if (resumeWorkflow.status === "failed") {
        setParseError(resumeWorkflow.error ?? "We couldn't read that file.");
        if (file) {
          setResumeMeta({ fileName: file.name, uploadedAt: new Date().toISOString(), status: "failed" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draftSkills/draftFromResume read at completion time, not reactive here
  }, [resumeWorkflow]);

  useEffect(() => {
    if (!buildWorkflow || settledRef.current) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (buildWorkflow.status === "complete" && buildWorkflow.result) {
        settledRef.current = true;
        setProfile(buildWorkflow.result.profile);
        navigate("/interests");
      }
      if (buildWorkflow.status === "failed") {
        settledRef.current = true;
        setBuildError(buildWorkflow.error ?? "We couldn't build your profile. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when buildWorkflow itself changes, not on every unrelated journey-state update that recreates setProfile
  }, [buildWorkflow, navigate]);

  async function handleFileChange(next: File | null) {
    setFile(next);
    setParseError(null);
    setResumeWorkflowId(null);
    if (!next) {
      setResumeWorkflowId(null);
      return;
    }
    const result = await parseResume.run(next, false);
    if (result) {
      // Persist the real profile identity immediately, before the next screen or
      // a reload; the old session-only ID was lost while the filename survived.
      if (result.profile) setProfile({ ...result.profile, situation, experienceLevel, yearsOfExperience });
      setResumeWorkflowId(result.workflowId);
    }
  }

  async function handlePreviewFailure() {
    const toParse = file ?? new File(["demo"], "resume.pdf", { type: "application/pdf" });
    setParseError(null);
    const result = await parseResume.run(toParse, true);
    if (result) setResumeWorkflowId(result.workflowId);
  }

  function handleSkillsChange(next: string[]) {
    setDraftSkills(next);
    setDraftFromResume(draftFromResume.filter((name) => next.includes(name)));
  }

  function addSuggestedSkill(skill: string) {
    if (!draftSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      setDraftSkills([...draftSkills, skill]);
    }
  }

  function addSuggestedInterest(interest: string) {
    if (!userInterests.some((i) => i.toLowerCase() === interest.toLowerCase())) {
      setUserInterests([...userInterests, interest]);
    }
  }

  // Combines full résumé evidence (excerpt, category, backend id) with
  // whatever's currently in the flat skills tag list — preserving edits
  // (removals, manual additions) the user made after the résumé was parsed.
  function compileSkills(): CandidateSkillEvidence[] {
    const byName = new Map(draftResumeSkillEvidence.map((e) => [e.skill.toLowerCase(), e]));
    return draftSkills.map((name) => {
      const existing = byName.get(name.toLowerCase());
      if (existing) return existing;
      return {
        id: null,
        skill: name,
        category: "technical",
        status: "self_reported",
        source: "user",
        sourceExcerpt: null,
      };
    });
  }

  async function handleAnalyze() {
    if (!situation || !experienceLevel || yearsOfExperience === null) return;
    if (!file && draftSkills.length === 0) return;
    settledRef.current = false;
    setBuildError(null);
    const profileId = profile?.id;
    const result = await buildProfile.run({
      skills: compileSkills(),
      situation,
      experienceLevel,
      yearsOfExperience,
      ...(profileId ? { profileId } : {}),
    });
    if (result) setBuildWorkflowId(result.workflowId);
  }

  const isParsingResume = parseResume.isLoading || (resumeWorkflow !== null && (resumeWorkflow.status === "pending" || resumeWorkflow.status === "running"));
  const isBuilding = buildProfile.isLoading || (buildWorkflow !== null && (buildWorkflow.status === "pending" || buildWorkflow.status === "running"));
  const hasSkillsOrResume = Boolean(file) || draftSkills.length > 0;
  const canSubmit = isProfileBasicsValid(situation, experienceLevel, yearsOfExperience) && hasSkillsOrResume;

  let disabledHint: string | null = null;
  if (!canSubmit) {
    const missing: string[] = [];
    if (!situation) missing.push("your situation");
    if (!experienceLevel) missing.push("your experience level");
    if (yearsOfExperienceError(yearsOfExperience)) missing.push("your years of experience");
    if (!hasSkillsOrResume) missing.push("a skill or résumé");

    const joined =
      missing.length <= 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    disabledHint = `Add ${joined} to continue.`;
  }

  const isAlreadyConfirmed = Boolean(profile?.confirmedAt);

  if (restoring) return <p role="status" className="mx-auto max-w-xl px-4 py-16">Loading your saved profile…</p>;

  // Read-only summary once confirmed, unless the user explicitly chose to edit.
  if (isAlreadyConfirmed && !isEditing && profile) {
    const situationLabel = SITUATION_OPTIONS.find((o) => o.value === profile.situation)?.label;
    const experienceLabel = EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === profile.experienceLevel)?.label;

    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">Your profile</h1>
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-success-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Confirmed
        </p>

        <div className="mt-6 space-y-6">
          {profile.hasFile && (
            <section>
              <h2 className="text-sm font-semibold text-neutral-800">Résumé</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {resumeMeta ? `${resumeMeta.fileName} — saved` : "Your résumé is saved with this profile."}
              </p>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-neutral-800">Your skills</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {profile.skills.map((skill) => (
                <span
                  key={skill.id ?? skill.skill}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700"
                >
                  {skill.skill}
                </span>
              ))}
            </div>
          </section>

          {userInterests.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-neutral-800">Your interests</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {userInterests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Situation</h2>
              <p className="mt-1 text-sm text-neutral-800">{situationLabel ?? "—"}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Experience</h2>
              <p className="mt-1 text-sm text-neutral-800">{experienceLabel ?? "—"}</p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Years</h2>
              <p className="mt-1 text-sm text-neutral-800">{profile.yearsOfExperience ?? "—"}</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
        Let's see what you've already got
      </h1>
      <p className="mt-2 text-neutral-600">
        Upload your résumé, tell us your skills and interests, and we'll build your profile from
        there.
      </p>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-neutral-800">Résumé (optional)</h2>
          <div className="mt-2 rounded-lg border border-dashed border-neutral-300 bg-white p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <Lock className="h-4 w-4 text-neutral-400" aria-hidden="true" />
              Private — used only to build your profile
            </div>

            {profile?.hasFile && !file && (
              <p className="mt-3 text-sm text-neutral-600">
                {resumeMeta ? `Saved résumé: ${resumeMeta.fileName}` : "Your résumé is saved with this profile."}
              </p>
            )}

            {isAlreadyConfirmed && (
              <Alert variant="warning" className="mt-3">
                Uploading a new résumé creates a new profile that will need to be confirmed again
                on the next step.
              </Alert>
            )}

            <label htmlFor="resume-file" className="sr-only">
              Upload résumé (PDF or DOCX)
            </label>
            <input
              id="resume-file"
              type="file"
              accept=".pdf,.docx"
              disabled={restoring || isParsingResume || isBuilding}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="mt-3 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
            />

            {isParsingResume && (
              <p className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
                <LoaderCircle className="h-4 w-4 animate-spin text-primary-600" aria-hidden="true" />
                Reading your résumé…
              </p>
            )}

            {parseError && (
              <Alert variant="warning" className="mt-3">
                {parseError} Your skills and interests below still work either way.
              </Alert>
            )}

            {!isParsingResume && !parseError && fromResume.size > 0 && (
              <p className="mt-3 text-sm text-success-700">
                {profile?.hasFile ? "Résumé saved. " : ""}Added {fromResume.size} skill{fromResume.size === 1 ? "" : "s"} from your résumé below.
              </p>
            )}

            <p className="mt-3 text-xs text-neutral-400">
              Having trouble? You can{" "}
              <button
                type="button"
                onClick={handlePreviewFailure}
                disabled={restoring || isParsingResume || isBuilding}
                className="underline hover:text-neutral-600"
              >
                preview what happens if parsing fails
              </button>{" "}
              (demo).
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-neutral-800">Your skills</h2>
          <TagInput
            value={draftSkills}
            onChange={handleSkillsChange}
            ariaLabel="Your skills"
            placeholder="Type a skill and press Enter"
            className="mt-2"
            renderTagBadge={(tag) =>
              fromResume.has(tag) ? (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                  from résumé
                </span>
              ) : null
            }
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_SKILLS.filter((s) => !draftSkills.some((v) => v.toLowerCase() === s.toLowerCase())).map(
              (skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => addSuggestedSkill(skill)}
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  + {skill}
                </button>
              ),
            )}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-neutral-800">Your interests</h2>
          <p className="text-xs text-neutral-500">
            Optional, but adding at least one helps us tailor what comes next.
          </p>
          <TagInput
            value={userInterests}
            onChange={setUserInterests}
            ariaLabel="Your interests"
            placeholder="e.g. Building backend systems"
            className="mt-2"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_INTERESTS.filter(
              (i) => !userInterests.some((v) => v.toLowerCase() === i.toLowerCase()),
            ).map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => addSuggestedInterest(interest)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {interest}
              </button>
            ))}
          </div>
        </section>

        <ProfileBasics
          situation={situation}
          onSituationChange={setSituation}
          experienceLevel={experienceLevel}
          onExperienceLevelChange={setExperienceLevel}
          yearsOfExperience={yearsOfExperience}
          onYearsOfExperienceChange={setYearsOfExperience}
        />

        <div>
          {buildError && (
            <Alert variant="danger" className="mb-3" title="Couldn't build your profile">
              {buildError}
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={handleAnalyze} disabled={restoring || !canSubmit || isBuilding || isParsingResume}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {isBuilding ? "Analyzing…" : "Analyze my experience"}
            </Button>
            {isAlreadyConfirmed && (
              <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={isBuilding}>
                Cancel
              </Button>
            )}
          </div>
          {disabledHint && <p className="mt-2 text-xs text-neutral-500">{disabledHint}</p>}
        </div>
      </div>
    </div>
  );
}
