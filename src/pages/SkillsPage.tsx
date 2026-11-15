import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Card } from "../components/ui/Card";
import { getGapAnalysis, type GapAnalysis } from "../lib/api/skills";
import { getJob, type JobPosting } from "../lib/api/jobs";

export function SkillsPage() {
  const [params] = useSearchParams();
  const id = params.get("analysis");
  const [data, setData] = useState<{
    analysis: GapAnalysis;
    jobs: JobPosting[];
  } | null>(null);
  const [error, setError] = useState("");
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
            cause instanceof Error ? cause.message : "Couldn't load results.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Your skill comparison</h1>
      <p className="mt-2 text-neutral-600">
        Based on the retrieved postings and your confirmed profile. A gap means
        missing profile evidence, not demonstrated inability.
      </p>
      <Link
        to="/target"
        className="mt-4 inline-block text-primary-700 underline"
      >
        Search another target role
      </Link>
      {!id && <p className="mt-6">Run a job search to create a comparison.</p>}
      {id && !data && !error && (
        <p role="status" className="mt-6">
          Loading saved evidence…
        </p>
      )}
      {error && (
        <Alert variant="danger" className="mt-6">
          {error}
        </Alert>
      )}
      {data && (
        <div className="mt-8 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Profile matches</h2>
            <p className="mt-2">
              {data.analysis.existing_skills.join(", ") ||
                "No exact skill matches found."}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Includes confirmed and self-reported skills; this is not an
              independent assessment.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Skills to review</h2>
            {!data.analysis.gaps.length && (
              <p className="mt-2">
                No gaps found among the extracted requirements. This is not a
                complete qualification assessment.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {data.analysis.gaps.map((gap) => (
                <Card key={gap.skill}>
                  <h3 className="font-semibold">{gap.skill}</h3>
                  <p className="text-sm text-neutral-600">
                    {gap.importance} · {gap.frequency} posting(s)
                  </p>
                  <p className="mt-1 text-sm">{gap.reason}</p>
                  {gap.sources.map((source) => (
                    <blockquote
                      key={source.job_id}
                      className="mt-3 border-l-2 border-neutral-200 pl-3 text-sm"
                    >
                      <p>“{source.excerpt}”</p>
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
                </Card>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Job evidence</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Retrieved excerpts may be incomplete. Live availability is not
              verified. Only explicit required/preferred skills are compared.
            </p>
            <div className="mt-3 space-y-3">
              {data.jobs.map((job) => (
                <Card key={job.id}>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary-700 underline"
                  >
                    {job.title}
                  </a>
                  <p className="text-sm">{job.company}</p>
                  <p className="text-xs text-neutral-500">
                    Via {job.source} · Retrieved{" "}
                    {new Date(job.retrieved_at).toLocaleString()}
                  </p>
                  {job.requirements.map((req) => (
                    <p key={req.skill} className="mt-2 text-sm">
                      <strong>{req.skill}</strong> ({req.importance}): “
                      {req.excerpt}”
                    </p>
                  ))}
                </Card>
              ))}
            </div>
          </section>
          <Alert variant="info">
            Learning and assessment will be available for reviewed competency
            templates. No learning activity is generated by this search.
          </Alert>
        </div>
      )}
    </div>
  );
}
