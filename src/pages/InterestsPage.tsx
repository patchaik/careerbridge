import { Check, CheckCircle2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { TagInput } from "../components/ui/TagInput";
import { useJourney } from "../context/JourneyContext";
import { useInterestAnalysis } from "../hooks/useInterests";
import { useConfirmProfile } from "../hooks/useOnboarding";
import type { CandidateSkillEvidence } from "../lib/types";

export function InterestsPage() {
  const navigate = useNavigate();
  const { profile, setProfile, userInterests, selectedInterests, setSelectedInterests } = useJourney();
  const analysis = useInterestAnalysis();
  const confirmAction = useConfirmProfile();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedInterests));
  const [extraInterests, setExtraInterests] = useState<string[]>([]);

  // The skills the user is reviewing before confirming — seeded from the
  // profile /start built (résumé-parsed + manually typed, none confirmed
  // yet). Edits here (remove/add) only take effect once "Confirm my
  // skills" is clicked — see handleConfirmSkills.
  const [skillList, setSkillList] = useState<CandidateSkillEvidence[]>(profile?.skills ?? []);
  const [extraSkillNames, setExtraSkillNames] = useState<string[]>([]);
  // Backend skill-evidence ids (non-null CandidateSkillEvidence.id) removed
  // before confirming — sent as remove_skill_ids so the backend deletes them.
  const [removedSkillIds, setRemovedSkillIds] = useState<Set<string>>(new Set());
  const [skillsConfirmed, setSkillsConfirmed] = useState(Boolean(profile?.confirmedAt));

  useEffect(() => {
    if (profile) void analysis.run(profile.id, userInterests);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount for this profile
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

  function removeSkill(entry: CandidateSkillEvidence) {
    setSkillList((prev) => prev.filter((s) => s !== entry));
    if (entry.id) setRemovedSkillIds((prev) => new Set(prev).add(entry.id!));
    setExtraSkillNames((prev) => prev.filter((name) => name.toLowerCase() !== entry.skill.toLowerCase()));
    setSkillsConfirmed(false);
  }

  function handleExtraSkillsChange(next: string[]) {
    const added = next.find((name) => !extraSkillNames.includes(name));
    setExtraSkillNames(next);
    if (added) {
      setSkillList((prev) => [
        ...prev,
        { id: null, skill: added, category: "technical", status: "self_reported", source: "user", sourceExcerpt: null },
      ]);
      setSkillsConfirmed(false);
    }
  }

  async function handleConfirmSkills() {
    if (!profile) return;
    const payload = skillList.map((s) => ({
      skill: s.skill,
      status: (s.source === "resume" ? "user_confirmed" : "self_reported") as
        | "user_confirmed"
        | "self_reported",
      excerpt: s.sourceExcerpt ?? undefined,
    }));
    const updated = await confirmAction.run(profile.id, payload, Array.from(removedSkillIds));
    if (updated) {
      // confirmProfile's response only carries what the backend actually
      // knows (skills, confirmedAt) — situation/experienceLevel/
      // yearsOfExperience are journey-state only and aren't in that
      // response, so merge onto the existing profile instead of replacing
      // it wholesale (which would null them out).
      setProfile({ ...profile, skills: updated.skills, confirmedAt: updated.confirmedAt });
      setSkillList(updated.skills);
      setRemovedSkillIds(new Set());
      setSkillsConfirmed(true);
    }
  }

  function handleContinue() {
    setSelectedInterests(Array.from(selected));
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

  const interests = [
    ...(analysis.data?.interests ?? []),
    ...extraInterests.map((label) => ({
      id: `interest:extra:${label}`,
      label,
      source: "user" as const,
      sourceExcerpt: null,
    })),
  ].filter((i) => !dismissed.has(i.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-neutral-900 sm:text-3xl">Your interests</h1>
      <p className="mt-2 max-w-xl text-neutral-600">
        Here's what you told us, combined with what we noticed in your résumé. Pick the ones you
        want to build on — nothing here is graded.
      </p>

      <Alert variant="info" className="mt-6">
        Not on your résumé doesn't mean you don't have it — add anything we missed below.
      </Alert>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Your skills
          </h2>
          {skillsConfirmed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Confirmed
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500">
          Review what we found, remove anything that's not right, and add what we missed. Nothing
          moves forward until you confirm.
        </p>

        {skillList.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {skillList.map((skill) => (
              <Card key={skill.id ?? skill.skill} className="relative">
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  aria-label={`Remove ${skill.skill}`}
                  className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="flex items-center justify-between gap-2 pr-6">
                  <p className="text-sm font-semibold text-neutral-900">{skill.skill}</p>
                  <Badge variant={skill.status} />
                </div>
                {skill.sourceExcerpt && (
                  <p className="mt-2 border-l-2 border-neutral-200 pl-2 text-xs italic text-neutral-500">
                    "{skill.sourceExcerpt}"
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}

        <div className="mt-3 max-w-sm">
          <TagInput
            value={extraSkillNames}
            onChange={handleExtraSkillsChange}
            ariaLabel="Add a missing skill"
            placeholder="Add a skill we missed…"
          />
        </div>

        {confirmAction.error && (
          <Alert variant="danger" className="mt-3" title="Couldn't confirm your skills">
            {confirmAction.error.message}
          </Alert>
        )}

        <div className="mt-4">
          <Button
            onClick={handleConfirmSkills}
            disabled={skillList.length === 0 || confirmAction.isLoading || skillsConfirmed}
            variant={skillsConfirmed ? "secondary" : "primary"}
          >
            {confirmAction.isLoading
              ? "Confirming…"
              : skillsConfirmed
                ? "Skills confirmed"
                : "Confirm my skills"}
          </Button>
          {!skillsConfirmed && (
            <p className="mt-2 text-xs text-neutral-500">
              You'll need to confirm your skills before continuing to your résumé critique.
            </p>
          )}
        </div>
      </section>

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
        <div className="mt-8 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
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
                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <Check className="h-4 w-4 flex-shrink-0 text-primary-600" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4 flex-shrink-0 text-neutral-400" aria-hidden="true" />
                      )}
                      <p className="text-sm font-semibold text-neutral-900">{interest.label}</p>
                    </div>
                    <span
                      className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        interest.source === "user"
                          ? "border-primary-200 bg-primary-50 text-primary-700"
                          : "border-neutral-200 bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {interest.source === "user" ? "You added" : "Found in your résumé"}
                    </span>
                    {interest.sourceExcerpt && (
                      <p className="mt-2 border-l-2 border-neutral-200 pl-2 text-xs italic text-neutral-500">
                        "{interest.sourceExcerpt}"
                      </p>
                    )}
                  </button>
                </Card>
              );
            })}
          </div>

          <div className="max-w-sm">
            <TagInput
              value={extraInterests}
              onChange={(next) => {
                setExtraInterests(next);
                const added = next.find((s) => !extraInterests.includes(s));
                if (added) setSelected((prev) => new Set(prev).add(`interest:extra:${added}`));
              }}
              ariaLabel="Add a missing interest"
              placeholder="Add an interest we missed…"
            />
          </div>

          <div className="flex items-center justify-between border-t border-neutral-200 pt-6">
            <p className="text-sm text-neutral-500">{selected.size} selected</p>
            <Button onClick={handleContinue} disabled={selected.size === 0 || !skillsConfirmed}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
