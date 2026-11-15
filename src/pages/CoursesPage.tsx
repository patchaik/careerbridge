import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  discoverResources,
  getResourceSearch,
  priceLabels,
  priceTypes,
  type ResourceSearch,
} from "../lib/api/resources";
import { generatePath, type Modality } from "../lib/api/paths";

export function CoursesPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const searchId = params.get("search");
  const analysis = params.get("analysis");
  const skill = params.get("skill");
  const [result, setResult] = useState<ResourceSearch | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [modality, setModality] = useState<Modality>("both");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      setResult(null);
      setError("");
      setSelected([]);
      if (!searchId) return;
      setLoading(true);
      try {
        const saved = await getResourceSearch(searchId);
        if (active) {
          setResult(saved);
          setSelected(saved.free.map((r) => r.id));
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Couldn't load resources.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [searchId]);
  async function discover() {
    if (!analysis || !skill) return;
    setBusy("Finding and saving learning resources…");
    setError("");
    try {
      const saved = await discoverResources(analysis, skill);
      setParams({ analysis, skill, search: saved.workflow_id });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't find resources.",
      );
    } finally {
      setBusy("");
    }
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!result) return;
    setBusy("Creating your learning plan…");
    setError("");
    try {
      const plan = await generatePath({
        resource_search_id: result.workflow_id,
        learning_goal: goal.trim(),
        modality,
        resource_ids: selected,
      });
      navigate(`/learn?path=${encodeURIComponent(plan.id)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't generate a plan.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">
        Learn {result?.skill || skill || "a skill"}
      </h1>
      <p className="mt-2 text-neutral-600">
        Choose resources, set your learning goal, then review a plan.
      </p>
      <Link
        className="mt-3 inline-block text-primary-700 underline"
        to={
          analysis || result
            ? `/skills?analysis=${encodeURIComponent(analysis || result!.analysis_id)}`
            : "/target"
        }
      >
        Back to skill comparison
      </Link>
      {error && (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {(busy || loading) && (
        <p role="status" className="mt-4">
          {busy || "Loading saved resources…"}
        </p>
      )}
      {!searchId && analysis && skill && (
        <div className="mt-6">
          <p className="mb-3">
            Search for free and paid options. We save the results so you can
            return to them.
          </p>
          <Button onClick={discover} disabled={!!busy}>
            Find learning resources
          </Button>
        </div>
      )}
      {!searchId && (!analysis || !skill) && (
        <p className="mt-6">Select a gap from your skill comparison first.</p>
      )}
      {result && (
        <form onSubmit={generate} className="mt-8 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">1. Choose resources</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Free resources are selected by default. Paid options are optional;
              enrollment and payment happen on the provider's site.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Via {result.source} · Checked{" "}
              {new Date(result.retrieved_at).toLocaleString()}. Prices and
              access may change.
            </p>
            {priceTypes.map((kind) => (
              <section key={kind} className="mt-5">
                <h3 className="font-semibold">{priceLabels[kind]}</h3>
                {!result[kind].length && (
                  <p className="mt-1 text-sm text-neutral-500">
                    No matching resources found in this group.
                  </p>
                )}
                <div className="mt-2 space-y-3">
                  {result[kind].map((r) => (
                    <Card key={r.id}>
                      <label className="flex items-start gap-3 font-medium">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.includes(r.id)}
                          disabled={!!busy}
                          onChange={(e) =>
                            setSelected((s) =>
                              e.target.checked
                                ? [...s, r.id]
                                : s.filter((id) => id !== r.id),
                            )
                          }
                        />
                        {r.title}
                      </label>
                      <p className="mt-2 text-sm">“{r.learning_evidence}”</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {r.format} ·{" "}
                        {r.price_evidence ||
                          "Access price could not be confirmed."}
                      </p>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm text-primary-700 underline"
                      >
                        View resource
                      </a>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
            <p className="mt-3 text-sm">
              {selected.length} selected (up to 10).
            </p>
          </section>
          <section>
            <label
              htmlFor="learning-goal"
              className="block text-lg font-semibold"
            >
              2. What do you want to be able to do?
            </label>
            <p className="mt-1 text-sm text-neutral-600">
              Set a goal for this skill, such as “Use SQL joins to combine
              customer and order data and explain unmatched rows.”
            </p>
            <textarea
              id="learning-goal"
              className="mt-3 w-full rounded-lg border border-neutral-300 p-3"
              rows={3}
              required
              minLength={10}
              maxLength={600}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={!!busy}
              placeholder="By the end, I want to be able to…"
            />
          </section>
          <fieldset disabled={!!busy}>
            <legend className="text-lg font-semibold">
              3. How would you like to learn?
            </legend>
            <div className="mt-3 flex flex-wrap gap-5">
              {(
                [
                  ["text", "Text"],
                  ["hands_on", "Hands-on"],
                  ["both", "Both"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="modality"
                    value={value}
                    checked={modality === value}
                    onChange={() => setModality(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Text uses reading and reflection. Hands-on uses practical tasks
              with a concrete result.
            </p>
          </fieldset>
          <Button
            type="submit"
            disabled={
              !!busy ||
              goal.trim().length < 10 ||
              !selected.length ||
              selected.length > 10
            }
          >
            Create learning plan
          </Button>
        </form>
      )}
    </div>
  );
}
