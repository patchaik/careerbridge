import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CARD_ACCENT, GRADIENT_HEADING } from "../components/ui/techTheme";
import { getProgress, type Progress } from "../lib/api/progress";

export function ProgressPage() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    getProgress().then(saved => { if (active) setData(saved); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load progress."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const summary = data?.summary;
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className={`text-2xl font-semibold sm:text-3xl ${GRADIENT_HEADING}`}>Your learning progress</h1>
      <Button variant="secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setReload(n => n + 1); }}>Refresh progress</Button>
    </div>
    {loading && <p role="status">Loading saved progress…</p>}
    {error && <Alert variant="danger">{error} Refresh to try again.</Alert>}
    {!loading && !error && data && summary && <>
      <p className="text-neutral-600">{data.goal ? `Current target: ${data.goal.target_role}. ` : "Choose a target role to guide your next steps. "}
        Progress covers your latest {data.plan_limit} saved resource-based plans across goals.</p>
      <Card className={CARD_ACCENT}>
        <h2 className="text-lg font-semibold">Overall progress</h2>
        <p className="mt-3">{summary.milestones_completed} of {summary.milestones_total} milestones complete</p>
        {summary.milestones_total > 0 && <progress aria-label="Overall milestone completion" className="mt-2 h-3 w-full accent-primary-600" value={summary.milestones_completed} max={summary.milestones_total} />}
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-neutral-600">Plans complete</dt><dd className="text-xl font-semibold">{summary.plans_completed} / {summary.plans_accepted}</dd></div>
          <div><dt className="text-sm text-neutral-600">Checks saved</dt><dd className="text-xl font-semibold">{summary.checks_completed}</dd></div>
          <div><dt className="text-sm text-neutral-600">Plans to revisit</dt><dd className="text-xl font-semibold">{summary.plans_to_revisit}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-neutral-600">Milestones measure completion of accepted plans. Quiz scores and AI practice feedback are learning guidance; they do not independently verify mastery or close a skill gap.</p>
      </Card>
      <section aria-label="Recommended next steps" className="space-y-3">
        <h2 className="text-lg font-semibold">What to do next</h2>
        <p className="text-sm text-neutral-600">Revisit flagged concepts first, then finish saved work and consider unaddressed gaps from your current goal.</p>
        <ol className="space-y-3">{data.recommendations.map((item, i) => <li key={`${item.kind}-${item.path_id}-${item.skill}`}>
          <Card><h3 className="font-medium">{i + 1}. <Link className="text-primary-700 underline" to={item.href}>{item.title}</Link></h3>
            <p className="mt-2 text-sm text-neutral-600">{item.reason}</p></Card>
        </li>)}</ol>
      </section>
      <section aria-label="Saved plan progress" className="space-y-3">
        <h2 className="text-lg font-semibold">Your saved plans</h2>
        {!data.plans.length && <Card><p>No saved learning plans yet.</p><p className="mt-2">Choose a skill gap and save a learning plan to start tracking progress.</p></Card>}
        {data.plans.map(plan => <Card key={plan.path_id} className={CARD_ACCENT}>
          <h3 className="font-semibold"><Link className="text-primary-700 underline" to={`/learn?path=${encodeURIComponent(plan.path_id)}`}>{plan.skill}: {plan.objective}</Link></h3>
          <p className="mt-2 text-sm">{plan.status === "proposed" ? "Awaiting acceptance · excluded from completion totals" : `${plan.progress.completed} / ${plan.progress.total} milestones complete`}</p>
          {plan.check_result ? <>
            <p className="mt-2">Quiz: {plan.check_result.quiz_score} / {plan.check_result.quiz_total} · Practice criteria shown: {plan.check_result.criteria_met} / {plan.check_result.criteria_total} (AI feedback)</p>
            <Link className="text-sm text-primary-700 underline" to={`/learn?path=${encodeURIComponent(plan.path_id)}#learning-check`}>View saved learning check</Link>
            {plan.revisit.length ? <div className="mt-3">
              <p className="font-medium">Revisit from your saved check</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">{plan.revisit.map(item => <li key={item.milestone_id}>
                <Link className="text-primary-700 underline" to={`/learn?path=${encodeURIComponent(plan.path_id)}#milestone-${encodeURIComponent(item.milestone_id)}`}>{item.title}</Link>
                {item.reasons.map(reason => <p key={reason} className="text-sm text-neutral-600">{reason}</p>)}
              </li>)}</ul>
              <p className="mt-2 text-xs text-neutral-500">These suggestions reflect the saved check. Revisiting material does not change that result.</p>
            </div> : <p className="mt-2 text-sm">No additional practice flagged in this check.</p>}
          </> : <p className="mt-2 text-sm text-neutral-600">{plan.check_status === "feedback_pending" || plan.check_status === "grading" ? "Answers saved; feedback pending. Open the plan to reload or retry." : plan.check_status === "ready" ? "Learning check ready to answer." : plan.check_status === "generating" ? "Learning check being prepared. Open the plan to resume." : "No completed learning check yet."}</p>}
        </Card>)}
      </section>
    </>}
  </div>;
}
