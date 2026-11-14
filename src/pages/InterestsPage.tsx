import { Check, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { TagInput } from "../components/ui/TagInput";
import { useJourney } from "../context/JourneyContext";
import { useInterestAnalysis } from "../hooks/useInterests";
import type { InterestCategory, SkillCluster } from "../lib/types";

const CATEGORY_LABEL: Record<InterestCategory, string> = {
  technical: "Technical",
  interpersonal: "Interpersonal",
  domain: "Domain",
};

interface SelectableChip {
  id: string;
  label: string;
  excerpt: string | null;
}

export function InterestsPage() {
  const navigate = useNavigate();
  const { profile, selectedSkills, setSelectedSkills } = useJourney();
  const analysis = useInterestAnalysis();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedSkills));
  const [extraSkills, setExtraSkills] = useState<string[]>([]);

  useEffect(() => {
    if (profile) void analysis.run(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount, not on every analysis identity change
  }, [profile]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function handleContinue() {
    setSelectedSkills(Array.from(selected));
    navigate("/critique");
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-neutral-700">Let's start by building your profile first.</p>
        <Link to="/start" className="mt-4 inline-block text-sm font-medium text-primary-700 hover:underline">
          Go to Upload résumé
        </Link>
      </div>
    );
  }

  const clusters = (analysis.data?.clusters ?? []).filter((c) => !dismissed.has(c.id));
  const interests = (analysis.data?.interests ?? []).filter((i) => !dismissed.has(i.id));

  const clustersByCategory = clusters.reduce<Record<InterestCategory, SkillCluster[]>>(
    (acc, cluster) => {
      acc[cluster.category] = [...(acc[cluster.category] ?? []), cluster];
      return acc;
    },
    { technical: [], interpersonal: [], domain: [] },
  );

  const allChips: SelectableChip[] = [
    ...clusters.flatMap((c) => c.skills.map((skill) => ({ id: `skill:${skill}`, label: skill, excerpt: c.sourceExcerpt }))),
    ...extraSkills.map((skill) => ({ id: `skill:${skill}`, label: skill, excerpt: null })),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">
        Here's what we found
      </h1>
      <p className="mt-2 max-w-xl text-neutral-600">
        Pick the skills and interests you want to build on. Nothing here is graded — it just
        shapes what comes next.
      </p>

      <Alert variant="info" className="mt-6">
        Not on your résumé doesn't mean you don't have it — add anything we missed below.
      </Alert>

      {analysis.isLoading && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {analysis.error && (
        <Alert variant="danger" className="mt-8" title="Couldn't load your analysis">
          {analysis.error.message}
        </Alert>
      )}

      {analysis.data && (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Skills to build on
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {allChips.map((chip) => {
                const isSelected = selected.has(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => toggle(chip.id)}
                    aria-pressed={isSelected}
                    title={chip.excerpt ?? undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
                      isSelected
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-neutral-300 bg-white text-neutral-700 hover:border-primary-300 hover:bg-primary-50"
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 max-w-sm">
              <TagInput
                value={extraSkills}
                onChange={(next) => {
                  setExtraSkills(next);
                  const added = next.find((s) => !extraSkills.includes(s));
                  if (added) setSelected((prev) => new Set(prev).add(`skill:${added}`));
                }}
                ariaLabel="Add a missing skill"
                placeholder="Add a skill we missed…"
              />
            </div>
          </section>

          {(Object.keys(clustersByCategory) as InterestCategory[]).map((category) =>
            clustersByCategory[category].length === 0 ? null : (
              <section key={category}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {CATEGORY_LABEL[category]} clusters
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {clustersByCategory[category].map((cluster) => (
                    <Card key={cluster.id} className="relative">
                      <button
                        type="button"
                        onClick={() => dismiss(cluster.id)}
                        aria-label={`This isn't right: ${cluster.label}`}
                        className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <p className="pr-6 text-sm font-semibold text-neutral-900">{cluster.label}</p>
                      <p className="mt-1 text-sm text-neutral-600">{cluster.skills.join(", ")}</p>
                      <p className="mt-2 border-l-2 border-neutral-200 pl-2 text-xs italic text-neutral-500">
                        "{cluster.sourceExcerpt}"
                      </p>
                    </Card>
                  ))}
                </div>
              </section>
            ),
          )}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Interests the AI inferred
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {interests.map((interest) => {
                const isSelected = selected.has(interest.id);
                return (
                  <Card
                    key={interest.id}
                    className={`relative cursor-pointer ${isSelected ? "border-primary-400 ring-1 ring-primary-200" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => dismiss(interest.id)}
                      aria-label={`This isn't right: ${interest.label}`}
                      className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(interest.id)}
                      aria-pressed={isSelected}
                      className="block w-full pr-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                        {isSelected ? (
                          <Check className="h-4 w-4 text-primary-600" aria-hidden="true" />
                        ) : (
                          <Plus className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                        )}
                        {interest.label}
                      </p>
                      <p className="mt-2 border-l-2 border-neutral-200 pl-2 text-xs italic text-neutral-500">
                        "{interest.sourceExcerpt}"
                      </p>
                    </button>
                  </Card>
                );
              })}
            </div>
          </section>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-6">
            <p className="text-sm text-neutral-500">{selected.size} selected</p>
            <Button onClick={handleContinue} disabled={selected.size === 0}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
