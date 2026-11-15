import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { approvePath, completeMilestone, getPath, listPaths, type LearningPlan } from "../lib/api/paths";
import { MilestoneMaterial } from "../components/features/learning/MilestoneMaterial";
import { getMaterials, type MilestoneMaterial as Material } from "../lib/api/materials";
import { priceLabels } from "../lib/api/resources";

export function LearnPage() {
  const [params] = useSearchParams();
  const id = params.get("path");
  const currentPath = useRef(id);
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    currentPath.current = id;
    let active = true;
    async function load() {
      setPlan(null);
      setMaterials([]);
      setError("");
      setBusy(false);
      setLoading(true);
      try {
        if (id) {
          const [saved, lessons] = await Promise.all([getPath(id), getMaterials(id)]);
          if (active) { setPlan(saved); setMaterials(lessons.materials); }
        } else {
          const result = await listPaths();
          if (active) setPlans(result.plans);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Couldn't load the plan.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);
  async function accept() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const updated = await approvePath(plan.id);
      if (currentPath.current === plan.id) setPlan(updated);
    } catch (cause) {
      if (currentPath.current === plan.id) setError(
        cause instanceof Error ? cause.message : "Couldn't accept the plan.",
      );
    } finally {
      if (currentPath.current === plan.id) setBusy(false);
    }
  }
  async function complete(milestoneId: string, done: boolean) {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await completeMilestone(plan.id, milestoneId, done);
      if (currentPath.current === plan.id) setPlan(updated);
    }
    catch (cause) {
      if (currentPath.current === plan.id) setError(cause instanceof Error ? cause.message : "Couldn't save progress. Please retry.");
    }
    finally { if (currentPath.current === plan.id) setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{id ? "Your learning plan" : "My learning"}</h1>
      {id && <Link to="/learn" className="mt-2 inline-block text-primary-700 underline">All saved plans</Link>}
      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {loading && !error && (
        <p role="status" className="mt-4">
          Loading your saved learning…
        </p>
      )}
      {!id && !loading && !error && <div className="mt-6 space-y-4">
        {plans.map(saved => <Card key={saved.id}>
          <p className="text-sm text-neutral-600">{saved.skill} · {saved.status === "proposed" ? "Awaiting acceptance" : saved.status === "completed" ? "Completed" : "Ready to continue"}</p>
          <h2 className="mt-2 font-semibold">{saved.objective}</h2>
          <p className="mt-2">{saved.progress.completed} of {saved.progress.total} milestones complete</p>
          <Link to={`/learn?path=${encodeURIComponent(saved.id)}`} className="mt-3 inline-block text-primary-700 underline">
            {saved.status === "proposed" ? "Review plan" : saved.status === "completed" ? "Review completed plan" : "Continue learning"}
          </Link>
        </Card>)}
        <p className="mt-4">
          {plans.length ? "Your 50 most recent plans appear here. " : "No saved plans yet. "}
          <Link to="/courses" className="text-primary-700 underline">
            Choose a skill and resources
          </Link>
        </p>
      </div>}
      {plan && (
        <div className="mt-6 space-y-6">
          <Card>
            <p className="text-sm text-neutral-600">
              {plan.skill} ·{" "}
              {plan.modality === "hands_on"
                ? "Hands-on"
                : plan.modality === "both"
                  ? "Text and hands-on"
                  : "Text"}
            </p>
            <h2 className="mt-3 font-semibold">Your goal</h2>
            <p>{plan.objective}</p>
            <h2 className="mt-4 font-semibold">Expected learning outcome</h2>
            <p>{plan.learning_outcome}</p>
            {plan.status !== "proposed" && <div className="mt-5" role="status">
              <p className="font-medium">{plan.progress.completed} of {plan.progress.total} milestones complete</p>
              <progress className="mt-2 w-full accent-primary-600" aria-label="Learning progress"
                value={plan.progress.completed} max={plan.progress.total} />
              {plan.progress.next_milestone_id ? <a className="mt-2 inline-block text-primary-700 underline"
                href={`#milestone-${plan.progress.next_milestone_id}`}>Continue with your next milestone</a>
                : <p className="mt-2 text-success-700">Learning plan complete. You can revisit any material below.</p>}
            </div>}
          </Card>
          <ol className="space-y-4">
            {plan.milestones.map((m, index) => (
              <li key={m.id} id={`milestone-${m.id}`} className="scroll-mt-20">
                <Card>
                  <p className="text-xs text-neutral-500">
                    Step {index + 1} · {m.mode === "text" ? "Text" : "Hands-on"}{m.done ? " · Completed" : ""}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{m.title}</h2>
                  <p className="mt-2 whitespace-pre-line">{m.instruction}</p>
                  <h3 className="mt-4 font-medium">Check your progress</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {m.success_criteria.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                  <h3 className="mt-4 font-medium">Resources</h3>
                  <ul className="mt-1 space-y-1">
                    {m.resource_ids.map((rid) => {
                      const r = plan.resources.find((item) => item.id === rid);
                      return r ? (
                        <li key={rid}>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-700 underline"
                          >
                            {r.title}
                          </a>
                          <span className="ml-2 text-xs text-neutral-600">
                            {priceLabels[r.price_type]}
                          </span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                  {plan.status !== "proposed" && <MilestoneMaterial
                    key={`${plan.id}:${m.id}`} pathId={plan.id} milestoneId={m.id}
                    saved={materials.find(item => item.milestone_id === m.id)}
                    onSaved={material => {
                      if (currentPath.current === plan.id)
                        setMaterials(current => [...current.filter(item => item.milestone_id !== m.id), material]);
                    }}
                  />}
                  {plan.status !== "proposed" && <div className="mt-5">
                    <Button disabled={busy || (!m.done && !materials.some(item => item.milestone_id === m.id))}
                      onClick={() => complete(m.id, !m.done)}>
                      {busy ? "Saving progress…" : m.done ? "Mark incomplete" : "Mark milestone complete"}
                    </Button>
                    <p className="mt-2 text-xs text-neutral-600">Mark complete after working through the saved material and success criteria. You can undo this anytime.</p>
                  </div>}
                </Card>
              </li>
            ))}
          </ol>
          <p className="text-sm text-neutral-600">
            This is an AI-generated learning plan. Progress checks are for your
            own practice, not certification or independent skill assessment.
            Hands-on tasks are completed outside this app.
          </p>
          {plan.status === "proposed" ? (
            <Button onClick={accept} disabled={busy}>
              {busy ? "Saving…" : "Accept learning plan"}
            </Button>
          ) : (
            <Alert variant="success">
              Your plan, material and completion marks are saved to your account.
              Use Learn in the navigation to return anytime.
            </Alert>
          )}
          <Link
            className="block text-primary-700 underline"
            to={`/courses?search=${encodeURIComponent(plan.resource_search_id)}`}
          >
            Create another plan from these saved resources
          </Link>
        </div>
      )}
    </div>
  );
}
