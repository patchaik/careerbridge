import { LoaderCircle, Lock, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TagInput } from "../components/ui/TagInput";
import {
  isProfileBasicsValid,
  ProfileBasics,
  yearsOfExperienceError,
} from "../components/features/onboarding/ProfileBasics";
import { useJourney } from "../context/JourneyContext";
import { useCreateProfile, useParseResume } from "../hooks/useOnboarding";
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
    setUserInterests,
    setProfile,
  } = useJourney();

  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [resumeWorkflowId, setResumeWorkflowId] = useState<string | null>(null);

  const [skills, setSkills] = useState<string[]>([]);
  const [fromResume, setFromResume] = useState<Set<string>>(new Set());
  const [interests, setInterests] = useState<string[]>([]);

  const [buildWorkflowId, setBuildWorkflowId] = useState<string | null>(null);
  const settledRef = useRef(false);

  const parseResume = useParseResume();
  const createProfile = useCreateProfile();

  const resumeWorkflow = useWorkflowPolling<{ skills: CandidateSkillEvidence[] }>(resumeWorkflowId);
  const buildWorkflow = useWorkflowPolling<{ profile: CandidateProfile }>(buildWorkflowId);

  // Merge résumé-extracted skills into the shared skills list once parsing completes.
  useEffect(() => {
    if (!resumeWorkflow) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (resumeWorkflow.status === "complete" && resumeWorkflow.result) {
        const found = resumeWorkflow.result.skills.map((s) => s.skill);
        setSkills((prev) => {
          const merged = [...prev];
          for (const name of found) {
            if (!merged.some((m) => m.toLowerCase() === name.toLowerCase())) merged.push(name);
          }
          return merged;
        });
        setFromResume((prev) => new Set([...prev, ...found]));
        setParseError(null);
      }
      if (resumeWorkflow.status === "failed") {
        setParseError(resumeWorkflow.error ?? "We couldn't read that file.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeWorkflow]);

  useEffect(() => {
    if (!buildWorkflow || settledRef.current) return;
    if (buildWorkflow.status === "complete" && buildWorkflow.result) {
      settledRef.current = true;
      setProfile(buildWorkflow.result.profile);
      setUserInterests(interests);
      navigate("/interests");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interests captured at submit time, not reactive here
  }, [buildWorkflow, navigate, setProfile, setUserInterests]);

  async function handleFileChange(next: File | null) {
    setFile(next);
    setParseError(null);
    if (!next) {
      setResumeWorkflowId(null);
      return;
    }
    const result = await parseResume.run(next, false);
    if (result) setResumeWorkflowId(result.workflowId);
  }

  async function handlePreviewFailure() {
    const toParse = file ?? new File(["demo"], "resume.pdf", { type: "application/pdf" });
    setParseError(null);
    const result = await parseResume.run(toParse, true);
    if (result) setResumeWorkflowId(result.workflowId);
  }

  function handleSkillsChange(next: string[]) {
    setSkills(next);
    setFromResume((prev) => {
      const nextSet = new Set(prev);
      for (const name of prev) if (!next.includes(name)) nextSet.delete(name);
      return nextSet;
    });
  }

  function addSuggestedSkill(skill: string) {
    if (!skills.some((s) => s.toLowerCase() === skill.toLowerCase())) setSkills([...skills, skill]);
  }

  function addSuggestedInterest(interest: string) {
    if (!interests.some((i) => i.toLowerCase() === interest.toLowerCase())) {
      setInterests([...interests, interest]);
    }
  }

  async function handleAnalyze() {
    if (!situation || !experienceLevel || yearsOfExperience === null) return;
    if (!file && skills.length === 0) return;
    settledRef.current = false;
    const result = await createProfile.run({
      skills: skills.map((skill) => ({
        skill,
        source: fromResume.has(skill) ? "resume" : "user",
      })),
      situation,
      experienceLevel,
      yearsOfExperience,
    });
    if (result) setBuildWorkflowId(result.workflowId);
  }

  const isParsingResume = resumeWorkflow !== null && (resumeWorkflow.status === "pending" || resumeWorkflow.status === "running");
  const isBuilding = buildWorkflow !== null && (buildWorkflow.status === "pending" || buildWorkflow.status === "running");
  const hasSkillsOrResume = Boolean(file) || skills.length > 0;
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
            <label htmlFor="resume-file" className="sr-only">
              Upload résumé (PDF or DOCX)
            </label>
            <input
              id="resume-file"
              type="file"
              accept=".pdf,.docx"
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
                Added {fromResume.size} skill{fromResume.size === 1 ? "" : "s"} from your résumé below.
              </p>
            )}

            <p className="mt-3 text-xs text-neutral-400">
              Having trouble? You can{" "}
              <button
                type="button"
                onClick={handlePreviewFailure}
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
            value={skills}
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
            {SUGGESTED_SKILLS.filter((s) => !skills.some((v) => v.toLowerCase() === s.toLowerCase())).map(
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
            value={interests}
            onChange={setInterests}
            ariaLabel="Your interests"
            placeholder="e.g. Building backend systems"
            className="mt-2"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_INTERESTS.filter(
              (i) => !interests.some((v) => v.toLowerCase() === i.toLowerCase()),
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
          <Button onClick={handleAnalyze} disabled={!canSubmit || isBuilding}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {isBuilding ? "Analyzing…" : "Analyze my experience"}
          </Button>
          {disabledHint && <p className="mt-2 text-xs text-neutral-500">{disabledHint}</p>}
        </div>
      </div>
    </div>
  );
}
