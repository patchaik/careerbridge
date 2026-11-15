import { useState } from "react";
import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Tooltip } from "../components/ui/Tooltip";
import { CARD_ACCENT, GRADIENT_HEADING, JobIconsBackground } from "../components/ui/techTheme";
import { ExposureBadge, SeverityBadge, TrendBadge } from "../components/features/target/OutlookBadges";
import { useSavedSearchProfile } from "../hooks/useSavedSearchProfile";
import { useJourney } from "../context/JourneyContext";
import { mockDelay } from "../lib/config";
import { createGoal } from "../lib/api/goals";
import { searchJobs } from "../lib/api/jobs";
import { analyzeSkills } from "../lib/api/skills";
import { generateRoleOutlook } from "../lib/mock/roleOutlook";
import type { RoleOutlook } from "../lib/types";

function RecommendationsLink() {
  return (
    <Tooltip
      placement="bottom"
      content={
        <>
          <p className="font-semibold text-white">How this works</p>
          <p className="mt-1 text-neutral-300">
            Our AI cross-references current labor-market statistics and demand trends with the
            skills on your résumé, then surfaces the roles where your background is the strongest
            fit.
          </p>
        </>
      }
    >
      <Link
        to="/recommendations"
        className="btn-sheen inline-flex items-center gap-2 rounded-lg border border-accent-400/50 bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_14px_-2px_rgba(55,48,163,0.5)] transition-all duration-200 hover:shadow-[0_0_22px_-1px_rgba(20,184,166,0.6)] hover:brightness-110 active:scale-[0.97]"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Get role recommendations
      </Link>
    </Tooltip>
  );
}

export function TargetPage() {
  const { profile, loading: profileLoading, error: profileError } = useSavedSearchProfile();
  const { situation, experienceLevel, yearsOfExperience, targetRole, setTargetRole } = useJourney();
  const navigate = useNavigate();
  const [role, setRole] = useState(targetRole ?? "");
  const [location, setLocation] = useState("");
  const [level, setLevel] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [outlook, setOutlook] = useState<RoleOutlook | null>(null);

  async function handleAnalyzeOutlook(event: FormEvent) {
    event.preventDefault();
    if (!profile?.confirmedAt || !role.trim() || stage) return;
    setError("");
    setEmpty(false);
    setStage("Analyzing your role…");
    await mockDelay(500, 1000);
    setOutlook(generateRoleOutlook(role.trim(), profile.skills, situation, experienceLevel, yearsOfExperience));
    setStage("");
  }

  async function runSearch(roleToSearch: string) {
    if (!profile?.confirmedAt || !roleToSearch.trim() || stage) return;
    setError("");
    setEmpty(false);
    setStage("Saving your target role…");
    try {
      const { goalId } = await createGoal({
        targetRole: roleToSearch.trim(),
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
        profile!.id,
        result.jobs.map((job) => job.id),
      );
      setTargetRole(roleToSearch.trim());
      navigate(`/skills?analysis=${encodeURIComponent(analysis.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Search failed. Please retry.",
      );
    } finally {
      setStage("");
    }
  }

  function handleChooseRecommended(roleName: string) {
    setRole(roleName);
    setOutlook(null);
    void runSearch(roleName);
  }

  function handleEditSearch() {
    setOutlook(null);
    setError("");
    setEmpty(false);
  }

  if (profileLoading) return <p role="status" className="mx-auto max-w-xl px-4 py-16">Loading your saved profile…</p>;
  if (profileError) return <p role="alert" className="mx-auto max-w-xl px-4 py-16">{profileError}</p>;
  if (!profile?.confirmedAt)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <p>Confirm your skills before searching.</p>
        <Link to="/start" className="text-primary-700 underline">
          Review your profile
        </Link>
      </div>
    );

  if (outlook) {
    return (
      <div className="relative mx-auto max-w-3xl px-4 py-16">
        <JobIconsBackground />
        <h1 className={`text-2xl font-semibold ${GRADIENT_HEADING}`}>AI outlook for {outlook.targetRole}</h1>
        <p className="mt-1 text-xs text-neutral-500">
          These are signals based on general labor-market patterns, never a prediction about your
          career specifically.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <ExposureBadge exposure={outlook.exposure} />
          <TrendBadge trend={outlook.demandTrend} />
        </div>
        <p className="mt-3 text-neutral-700">{outlook.summary}</p>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Risks</h2>
          <div className="mt-3 space-y-3">
            {outlook.risks.map((risk) => (
              <Card key={risk.id} className={CARD_ACCENT}>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={risk.severity} />
                  <p className="text-sm font-semibold text-neutral-900">{risk.label}</p>
                </div>
                <p className="mt-2 text-sm text-neutral-600">{risk.detail}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            What stays human
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {outlook.whatStaysHuman.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {outlook.recommendedRoles.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Recommended roles
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {outlook.recommendedRoles.map((rec) => (
                <Card key={rec.role} className={CARD_ACCENT}>
                  <p className="text-sm font-semibold text-neutral-900">{rec.role}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {rec.skillOverlap.matched} of {rec.skillOverlap.total} skills transfer
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">{rec.why}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ExposureBadge exposure={rec.outlook} />
                    <TrendBadge trend={rec.demandTrend} />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => handleChooseRecommended(rec.role)}
                    disabled={Boolean(stage)}
                  >
                    Choose this role
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Suggestions
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {outlook.suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <p className="mt-6 text-xs text-neutral-400">Sources: {outlook.sources.join(" · ")}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-6">
          <Button onClick={() => void runSearch(outlook.targetRole)} disabled={Boolean(stage)}>
            Keep my target role
          </Button>
          <button
            type="button"
            onClick={handleEditSearch}
            disabled={Boolean(stage)}
            className="text-sm font-medium text-primary-700 underline disabled:text-neutral-400"
          >
            Edit search
          </button>
        </div>

        {stage && (
          <p role="status" className="mt-4 text-sm text-primary-700">
            {stage} Slow source pages can take a few minutes.
          </p>
        )}
        {error && (
          <Alert variant="danger" title="Couldn't complete the search" className="mt-4">
            {error}
          </Alert>
        )}
        {empty && (
          <Alert variant="info" className="mt-4">
            No matching postings with explicit requirements could be verified. Try a broader role
            or location. No skill conclusions were generated.
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-xl px-4 py-16">
      <JobIconsBackground />
      <h1 className={`text-2xl font-semibold ${GRADIENT_HEADING}`}>Choose your target role</h1>
      <p className="mt-2 text-neutral-600">
        Find relevant postings and compare their requirements with your
        confirmed profile.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-neutral-500">Not sure where to start?</span>
        <RecommendationsLink />
      </div>
      <Card className={`${CARD_ACCENT} mt-8`}>
        <form onSubmit={handleAnalyzeOutlook} className="space-y-5">
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
                  className="mt-2 block w-full rounded-md border border-neutral-300 px-3 py-2 transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 focus:shadow-[0_0_14px_-3px_rgba(20,184,166,0.5)]"
                />
              </label>
            ))}
            <Button
              type="submit"
              size="lg"
              disabled={!role.trim() || Boolean(stage)}
              className={role.trim() && !stage ? "w-full animate-pulse-glow" : "w-full"}
            >
              Search jobs and compare skills
            </Button>
          </fieldset>
          {stage && (
            <p role="status" className="text-sm text-primary-700">
              {stage}
            </p>
          )}
          {error && (
            <Alert variant="danger" title="Couldn't complete the search">
              {error}
            </Alert>
          )}
        </form>
      </Card>
      <p className="mt-6 text-xs text-neutral-500">
        Search uses your role, location and seniority. Your résumé is not sent
        to the search provider. Listings may be stale; check the original
        source. This comparison uses explicitly required or preferred skills in
        the retrieved excerpts.
      </p>
    </div>
  );
}
