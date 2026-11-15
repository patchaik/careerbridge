import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { useJourney } from "../context/JourneyContext";
import { createGoal } from "../lib/api/goals";
import { searchJobs } from "../lib/api/jobs";
import { analyzeSkills } from "../lib/api/skills";

export function TargetPage() {
  const { profile, targetRole, setTargetRole } = useJourney();
  const navigate = useNavigate();
  const [role, setRole] = useState(targetRole ?? "");
  const [location, setLocation] = useState("");
  const [level, setLevel] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.confirmedAt || !role.trim() || stage) return;
    setError("");
    setEmpty(false);
    setStage("Saving your target role…");
    try {
      const { goalId } = await createGoal({
        targetRole: role.trim(),
        location: location.trim() || null,
        level: level.trim() || null,
      });
      setStage("Finding postings and checking their requirements…");
      const result = await searchJobs(goalId);
      if (!result.jobs.length) {
        setEmpty(true);
        return;
      }
      setStage("Comparing requirements with your confirmed profile…");
      const analysis = await analyzeSkills(
        goalId,
        profile.id,
        result.jobs.map((job) => job.id),
      );
      setTargetRole(role.trim());
      navigate(`/skills?analysis=${encodeURIComponent(analysis.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Search failed. Please retry.",
      );
    } finally {
      setStage("");
    }
  }

  if (!profile?.confirmedAt)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <p>Confirm your skills before searching.</p>
        <Link to="/interests" className="text-primary-700 underline">
          Review your profile
        </Link>
      </div>
    );
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Choose your target role</h1>
      <p className="mt-2 text-neutral-600">
        Find relevant postings and compare their requirements with your
        confirmed profile.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <fieldset disabled={Boolean(stage)} className="space-y-5">
          {[
            {
              label: "Target role",
              value: role,
              change: setRole,
              required: true,
            },
            {
              label: "Location or remote",
              value: location,
              change: setLocation,
              required: false,
            },
            {
              label: "Seniority (optional)",
              value: level,
              change: setLevel,
              required: false,
            },
          ].map((field) => (
            <label key={field.label} className="block text-sm font-medium">
              {field.label}
              <input
                required={field.required}
                maxLength={120}
                value={field.value}
                onChange={(e) => field.change(e.target.value)}
                className="mt-2 block w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
          ))}
          <Button type="submit" disabled={!role.trim() || Boolean(stage)}>
            Search jobs and compare skills
          </Button>
        </fieldset>
        {stage && (
          <p role="status" className="text-sm text-primary-700">
            {stage} Slow source pages can take a few minutes.
          </p>
        )}
        {error && (
          <Alert variant="danger" title="Couldn't complete the search">
            {error}
          </Alert>
        )}
        {empty && (
          <Alert variant="info">
            No matching postings with explicit requirements could be verified.
            Try a broader role or location. No skill conclusions were generated.
          </Alert>
        )}
      </form>
      <p className="mt-6 text-xs text-neutral-500">
        Search uses your role, location and seniority. Your résumé is not sent
        to the search provider. Listings may be stale; check the original
        source. This comparison uses explicitly required or preferred skills in
        the retrieved excerpts.
      </p>
    </div>
  );
}
