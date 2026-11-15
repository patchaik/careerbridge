import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SourceLink } from "../components/features/search/SourceLink";
import { Alert } from "../components/ui/Alert";
import { Card } from "../components/ui/Card";
import { CARD_ACCENT, GRADIENT_HEADING, SkillsIconsBackground } from "../components/ui/techTheme";
import { useJourney } from "../context/JourneyContext";
import { getGapAnalysis, type GapAnalysis } from "../lib/api/skills";
import { getJob, type JobPosting } from "../lib/api/jobs";

export function SkillsPage() {
  const [params] = useSearchParams();
  const id = params.get("analysis");
  if (!id) return <div className="mx-auto max-w-3xl px-4 py-12">
    <h1 className="text-2xl font-semibold">Your skill comparison</h1>
    <p className="mt-3">Search for a target role to see which skills to work on.</p>
    <Link to="/target" className="mt-3 inline-block text-primary-700 underline">Search for a target role</Link>
  </div>;
  return <Comparison key={id} id={id} />;
}

function Comparison({ id }: { id: string }) {
  const { selfReportedSkills, setSelfReportedSkills, setChosenSkill } = useJourney();
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const saved = await getGapAnalysis(id);
        if (!active) return;
        setAnalysis(saved);
        const postings = await Promise.allSettled(saved.job_ids.map(getJob));
        if (active) setJobs(postings.flatMap(job => job.status === "fulfilled" ? [job.value] : []));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Try searching again.");
      }
    }
    void load();
    return () => { active = false; };
  }, [id]);

  const confirmed = new Set(selfReportedSkills.map(skill => skill.toLowerCase()));
  const gaps = analysis?.gaps.filter(gap => !confirmed.has(gap.skill.toLowerCase())) ?? [];
  const selfReported = analysis?.gaps.filter(gap => confirmed.has(gap.skill.toLowerCase())) ?? [];
  const count = analysis?.job_ids.length ?? 0;
  const demoIds = new Set([
    ...(jobs ?? []).filter(job => job.source === "synthetic").map(job => job.id),
    ...(analysis?.gaps.flatMap(gap => gap.sources.filter(s => s.provider === "synthetic").map(s => s.job_id)) ?? []),
  ]);

  function gapRow(gap: GapAnalysis["gaps"][number]) {
    const postingCount = gap.job_ids.length;
    const query = new URLSearchParams({ analysis: id, skill: gap.skill });
    return <Card key={gap.skill} className={CARD_ACCENT}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{gap.skill}</h3>
          <p className="mt-1 text-sm text-neutral-600">{gap.importance === "required" ? "Required" : gap.importance === "preferred" ? "Preferred" : "Listed skill"} · {postingCount} of {count} postings</p>
        </div>
        <Link to={`/courses?${query}`} onClick={() => setChosenSkill(gap.skill)} className="rounded-lg border border-primary-200 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50" aria-label={`Find resources for ${gap.skill}`}>Find resources</Link>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-primary-700">Why this skill?</summary>
        {gap.reason && <p className="mt-2">{gap.reason}</p>}
        {gap.sources.map(source => <blockquote key={source.job_id} className="mt-2 border-l-2 border-neutral-200 pl-3">
          {source.excerpt && <p className="mb-1">“{source.excerpt}”</p>}
          <SourceLink url={source.url} demo={demoIds.has(source.job_id)}>{source.title}</SourceLink>
        </blockquote>)}
        <button type="button" onClick={() => setSelfReportedSkills([...selfReportedSkills, gap.skill])} className="mt-3 text-primary-700 underline">I already have this skill</button>
      </details>
    </Card>;
  }

  return <div className="relative mx-auto max-w-3xl px-4 py-12">
    <SkillsIconsBackground />
    <h1 className={`text-2xl font-semibold sm:text-3xl ${GRADIENT_HEADING}`}>Your skill comparison</h1>
    <Link to="/target" className="mt-2 inline-block text-sm text-primary-700 underline">Search another role</Link>
    {!analysis && !error && <p role="status" className="mt-6">Loading your comparison…</p>}
    {error && <Alert variant="danger" className="mt-6" title="Couldn't load this comparison">{error}</Alert>}
    {analysis && <div className="mt-6 space-y-6">
      <p className="text-neutral-600">{gaps.length} {gaps.length === 1 ? "skill" : "skills"} to review · {analysis.existing_skills.length} {analysis.existing_skills.length === 1 ? "profile match" : "profile matches"} · {count} postings</p>
      {demoIds.size > 0 && <Alert variant="info">
        {demoIds.size === count ? "This comparison uses demo postings." : `${demoIds.size} of ${count} postings are demo data.`}
      </Alert>}
      <section aria-labelledby="skills-to-review">
        <h2 id="skills-to-review" className="text-lg font-semibold">Skills to review</h2>
        <p className="mt-1 text-sm text-neutral-600">These skills weren't found in your confirmed profile.</p>
        {!gaps.length && <p className="mt-3">{selfReported.length ? "No remaining skills to review." : "No gaps found in these postings."}</p>}
        <div className="mt-3 space-y-2">{gaps.slice(0, 3).map(gapRow)}</div>
        {gaps.length > 3 && <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary-700">More skills ({gaps.length - 3})</summary>
          <div className="mt-2 space-y-2">{gaps.slice(3).map(gapRow)}</div>
        </details>}
      </section>
      <details className="rounded-xl border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">Skills you already have ({analysis.existing_skills.length + selfReported.length})</summary>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {analysis.existing_skills.map(skill => <li key={skill} className="rounded-full bg-success-50 px-3 py-1">{skill}</li>)}
          {selfReported.map(gap => <li key={gap.skill} className="rounded-full bg-neutral-100 px-3 py-1">{gap.skill} · Self-reported</li>)}
        </ul>
      </details>
      <details className="rounded-xl border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer font-medium">Job postings reviewed ({count})</summary>
        <p className="mt-2 text-xs text-neutral-600">Links may expire. The comparison uses the saved excerpts.</p>
        {jobs === null ? <p role="status" className="mt-2 text-sm">Loading posting details…</p> : <>
          {jobs.length < count && <p className="mt-2 text-sm text-neutral-600">Some posting details couldn’t load. The saved comparison is still available.</p>}
          <ul className="mt-3 divide-y divide-neutral-100">{jobs.map(job => <li key={job.id} className="py-3 text-sm">
            <p className="font-medium"><SourceLink url={job.url} demo={job.source === "synthetic"}>{job.title}</SourceLink></p>
            {(job.company || job.location) && <p className="text-neutral-600">{[job.company, job.location].filter(Boolean).join(" · ")}</p>}
            {job.requirements.length > 0 && <details className="mt-1">
              <summary className="cursor-pointer text-primary-700">Requirements ({job.requirements.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{job.requirements.map(req => <li key={req.skill}>
                <strong>{req.skill}</strong> ({req.importance}): “{req.excerpt}”
              </li>)}</ul>
            </details>}
          </li>)}</ul>
        </>}
      </details>
    </div>}
  </div>;
}
