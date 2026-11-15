import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { approvePath, getPath, type LearningPlan } from "../lib/api/paths";
import { priceLabels } from "../lib/api/resources";

export function LearnPage() {
  const [params] = useSearchParams();
  const id = params.get("path");
  const [plan, setPlan] = useState<LearningPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setPlan(null);
      setError("");
      if (!id) return;
      try {
        const saved = await getPath(id);
        if (active) setPlan(saved);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Couldn't load the plan.",
          );
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
      setPlan(await approvePath(plan.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't accept the plan.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Your learning plan</h1>
      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {id && !plan && !error && (
        <p role="status" className="mt-4">
          Loading your saved plan…
        </p>
      )}
      {!id && (
        <p className="mt-4">
          Choose a skill and resources to create your plan.{" "}
          <Link to="/courses" className="text-primary-700 underline">
            Choose resources
          </Link>
        </p>
      )}
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
          </Card>
          <ol className="space-y-4">
            {plan.milestones.map((m, index) => (
              <li key={m.id}>
                <Card>
                  <p className="text-xs text-neutral-500">
                    Step {index + 1} · {m.mode === "text" ? "Text" : "Hands-on"}
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
              Plan accepted and saved. You can return to this page to follow
              your milestones.
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
