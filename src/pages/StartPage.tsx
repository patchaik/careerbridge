import { LoaderCircle, Lock, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { TagInput } from "../components/ui/TagInput";
import { useJourney } from "../context/JourneyContext";
import { useParseManualSkills, useParseResume } from "../hooks/useOnboarding";
import { useWorkflowPolling } from "../hooks/useWorkflow";
import type { CandidateProfile } from "../lib/types";

const DEFAULT_MANUAL_SKILLS = ["Java", "Spring Boot", "REST APIs", "Oracle", "Docker"];

type Mode = "upload" | "manual";

export function StartPage() {
  const navigate = useNavigate();
  const { lostJobToAI, setLostJobToAI, setProfile } = useJourney();

  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [skills, setSkills] = useState<string[]>(DEFAULT_MANUAL_SKILLS);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [parsingLabel, setParsingLabel] = useState("Reading your experience…");
  const settledRef = useRef(false);

  const parseResume = useParseResume();
  const parseManualSkills = useParseManualSkills();
  const workflow = useWorkflowPolling<{ profile: CandidateProfile }>(workflowId);

  useEffect(() => {
    if (!workflow || settledRef.current) return;
    if (workflow.status === "complete" && workflow.result) {
      settledRef.current = true;
      setProfile(workflow.result.profile);
      navigate("/interests");
    }
    if (workflow.status === "failed") {
      settledRef.current = true;
    }
  }, [workflow, navigate, setProfile]);

  async function handleUpload(simulateFailure: boolean) {
    const toParse = file ?? new File(["demo"], "resume.pdf", { type: "application/pdf" });
    settledRef.current = false;
    setParsingLabel("Reading your experience…");
    const result = await parseResume.run(toParse, simulateFailure);
    if (result) setWorkflowId(result.workflowId);
  }

  async function handleManualSubmit() {
    settledRef.current = false;
    setParsingLabel("Reading your skills…");
    const result = await parseManualSkills.run(skills);
    if (result) setWorkflowId(result.workflowId);
  }

  const isParsing = workflow !== null && (workflow.status === "pending" || workflow.status === "running");
  const hasFailed = workflow?.status === "failed";

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
        Let's see what you've already got
      </h1>
      <p className="mt-2 text-neutral-600">
        Share your résumé, or enter your skills manually — either way, we'll build your profile
        from there.
      </p>

      {isParsing ? (
        <div className="mt-8 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-6">
          <LoaderCircle className="h-5 w-5 animate-spin text-primary-600" aria-hidden="true" />
          <p className="text-sm text-neutral-700">{parsingLabel}</p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {hasFailed && (
            <Alert variant="warning" title="We couldn't parse that file">
              {workflow?.error ?? "Something went wrong reading that file."} Try a different
              file, or enter your skills manually below.
            </Alert>
          )}

          {mode === "upload" ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6">
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
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-3 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
              />
              <p className="mt-3 text-xs text-neutral-400">
                Having trouble? You can{" "}
                <button
                  type="button"
                  onClick={() => handleUpload(true)}
                  className="underline hover:text-neutral-600"
                >
                  preview what happens if parsing fails
                </button>{" "}
                (demo).
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-white p-6">
              <p className="text-sm font-medium text-neutral-700">Your skills</p>
              <TagInput
                value={skills}
                onChange={setSkills}
                ariaLabel="Your skills"
                placeholder="Type a skill and press Enter"
                className="mt-2"
              />
            </div>
          )}

          <Checkbox
            label="I recently lost my job or role to automation/AI"
            checked={lostJobToAI}
            onChange={(e) => setLostJobToAI(e.target.checked)}
          />

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={() => (mode === "upload" ? handleUpload(false) : handleManualSubmit())}
              disabled={mode === "upload" ? !file : skills.length === 0}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Analyze my experience
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "upload" ? "manual" : "upload")}
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              {mode === "upload" ? "Enter skills manually instead" : "Upload a résumé instead"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
