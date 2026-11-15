import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CARD_ACCENT, GRADIENT_HEADING, SkillsIconsBackground } from "../components/ui/techTheme";
import { useJourney } from "../context/JourneyContext";
import { getGapAnalysis, type GapAnalysis } from "../lib/api/skills";
import { getJob, type JobPosting } from "../lib/api/jobs";

export function SkillsPage() {
  const navigate = useNavigate();
  const { selfReportedSkills, setSelfReportedSkills, setChosenSkill } = useJourney();
  const [params] = useSearchParams();
  const id = params.get("analysis");
  const [data, setData] = useState<{
    analysis: GapAnalysis;
    jobs: JobPosting[];
  } | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function load() {
      setData(null);
      setError("");
      if (!id) return;
      try {
        const analysis = await getGapAnalysis(id);
        const jobs = await Promise.all(analysis.job_ids.map(getJob));
        if (active) setData({ analysis, jobs });
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Couldn't load results. Please try the search again.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  function toggleExpanded(skill: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  }

  function markSelfReported(skill: string) {
    if (!selfReportedSkills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      setSelfReportedSkills([...selfReportedSkills, skill]);
    }
  }

  function handleLearnThis(skill: string) {
    setChosenSkill(skill);
    navigate(`/courses?analysis=${encodeURIComponent(id || "")}&skill=${encodeURIComponent(skill)}`);
  }

  const isSelfReported = (skill: string) =>
    selfReportedSkills.some((s) => s.toLowerCase() === skill.toLowerCase());

  const syntheticJobCount = data?.jobs.filter((j) => j.source === "synthetic").length ?? 0;
  const allSynthetic = Boolean(data?.jobs.length) && syntheticJobCount === data!.jobs.length;
  const someSynthetic = syntheticJobCount > 0 && !allSynthetic;

  const reviewGaps = data?.analysis.gaps.filter((g) => !isSelfReported(g.skill)) ?? [];
  const selfReportedGaps = data?.analysis.gaps.filter((g) => isSelfReported(g.skill)) ?? [];

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-16">
      <SkillsIconsBackground />
      <h1 className={`text-2xl font-semibold sm:text-3xl ${GRADIENT_HEADING}`}>Your skill comparison</h1>
      <p className="mt-2 text-neutral-600">
        Based on the retrieved postings and your confirmed profile. A gap means
        missing profile evidence, not demonstrated inability.
      </p>
      {allSynthetic && (
        <Alert variant="info" className="mt-4">
          This comparison uses synthetic demo postings, not live job listings.
        </Alert>
      )}
      {someSynthetic && (
        <Alert variant="info" className="mt-4">
          {syntheticJobCount} of {data?.jobs.length} postings below are synthetic demo data; the
          rest are live.
        </Alert>
      )}
      <Link
        to="/target"
        className="mt-4 inline-block text-primary-700 underline"
      >
        Search another target role
      </Link>

      {!id && (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
          <p className="text-neutral-700">No comparison yet.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Run a job search on Direction to see how your skills compare.
          </p>
          <Link to="/target" className="mt-3 inline-block text-sm font-medium text-primary-700 underline">
            Go to Direction
          </Link>
        </div>
      )}

      {id && !data && !error && (
        <p role="status" className="mt-6">
          Loading saved evidence…
        </p>
      )}

      {error && (
        <Alert variant="danger" className="mt-6" title="Couldn't load this comparison">
          {error}
        </Alert>
      )}

      {data && (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Profile matches</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.analysis.existing_skills.length === 0 && (
                <p className="text-sm text-neutral-600">No exact skill matches found.</p>
              )}
              {data.analysis.existing_skills.map((skill) => (
                <span key={skill} className="inline-flex items-center gap-1">
                  <Badge variant="present" />
                  <span className="text-sm text-neutral-800">{skill}</span>
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Includes confirmed and self-reported skills; this is not an
              independent assessment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Skills to review</h2>
            {!reviewGaps.length && !selfReportedGaps.length && (
              <p className="mt-2 text-sm text-neutral-600">
                No gaps found among the extracted requirements. This is not a
                complete qualification assessment.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {reviewGaps.map((gap) => {
                const isOpen = expanded.has(gap.skill);
                return (
                  <Card key={gap.skill} className={CARD_ACCENT}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={gap.importance === "required" ? "mandatory_requirement_unmet" : "not_established"}
                          />
                          <h3 className="font-semibold">{gap.skill}</h3>
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">
                          {gap.importance} · mentioned in {gap.frequency} of {data.jobs.length} posting
                          {data.jobs.length === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-sm">{gap.reason}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(gap.skill)}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                      >
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        Why?
                      </button>
                      <button
                        type="button"
                        onClick={() => markSelfReported(gap.skill)}
                        className="text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
                      >
                        I already have this skill
                      </button>
                      <Button size="sm" variant="secondary" onClick={() => handleLearnThis(gap.skill)}>
                        Learn this skill
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
                        {gap.sources.map((source) => (
                          <blockquote
                            key={source.job_id}
                            className="border-l-2 border-neutral-200 pl-3 text-sm"
                          >
                            <p>"{source.excerpt}"</p>
                            <a
                              className="text-primary-700 underline"
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title}
                            </a>
                          </blockquote>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {selfReportedGaps.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  You said you already have these
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selfReportedGaps.map((gap) => (
                    <span
                      key={gap.skill}
                      className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-sm text-success-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {gap.skill}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Self-reported — not verified by an assessment yet.
                </p>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Job evidence</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Retrieved excerpts may be incomplete. Live availability is not
              verified. Only explicit required/preferred skills are compared.
            </p>
            <div className="mt-3 space-y-3">
              {data.jobs.map((job) => (
                <Card key={job.id} className={CARD_ACCENT}>
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary-700 underline"
                    >
                      {job.title}
                    </a>
                  </div>
                  <p className="text-sm">{job.company}</p>
                  <p className="text-xs text-neutral-500">
                    Via {job.source} · Retrieved{" "}
                    {new Date(job.retrieved_at).toLocaleString()}
                  </p>
                  {job.requirements.map((req) => (
                    <p key={req.skill} className="mt-2 text-sm">
                      <strong>{req.skill}</strong> ({req.importance}): "
                      {req.excerpt}"
                    </p>
                  ))}
                </Card>
              ))}
            </div>
          </section>
          <Alert variant="info">
            Choose a skill to find resources and build a learning plan around your goal.
            Learning progress is separate from independent competency assessment.
          </Alert>
        </div>
      )}
    </div>
  );
}
