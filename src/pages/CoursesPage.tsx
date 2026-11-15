import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SourceLink } from "../components/features/search/SourceLink";
import { sourceUrl } from "../lib/sourceUrl";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  discoverResources,
  getResourceSearch,
  priceLabels,
  priceTypes,
  uniqueResources,
  type ResourceSearch,
  type SavedResource,
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
  const [loading, setLoading] = useState(Boolean(searchId));
  useEffect(() => {
    let active = true;
    async function load() {
      setResult(null);
      setError("");
      setSelected([]);
      if (!searchId) { setLoading(false); return; }
      setLoading(true);
      try {
        const saved = uniqueResources(await getResourceSearch(searchId));
        if (active) {
          setResult(saved);
          setSelected(saved.free.slice(0, 10).map((r) => r.id));
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
    if (!analysisId || !skillName || busy) return;
    setBusy("Finding and saving learning resources…");
    setError("");
    try {
      const saved = await discoverResources(analysisId, skillName);
      setParams({ analysis: saved.analysis_id, skill: saved.skill, search: saved.workflow_id });
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
  const analysisId = result?.analysis_id ?? analysis;
  const skillName = result?.skill ?? skill;
  const resourceCount = result ? priceTypes.reduce((count, kind) => count + result[kind].length, 0) : 0;
  const linkClass = "inline-block text-sm text-primary-700 underline";

  function resourceRow(resource: SavedResource) {
    const checked = selected.includes(resource.id);
    const host = sourceUrl(resource.url)?.hostname.replace(/^www\./, "");
    const evidence = resource.learning_evidence.trim().replace(/\s+/g, " ");
    const preview = evidence.length > 140 ? evidence.slice(0, 140).replace(/\s+\S*$/, "") + "…" : evidence;
    return <Card key={resource.id} className="p-3">
      <label className="flex items-start gap-3 font-medium">
        <input type="checkbox" className="mt-1" checked={checked} disabled={!!busy || (!checked && selected.length >= 10)}
          onChange={event => setSelected(items => event.target.checked ? [...items, resource.id] : items.filter(id => id !== resource.id))} />
        {resource.title}
      </label>
      <div className="mt-1 space-y-1 pl-6 text-sm">
        <p className="text-neutral-600">{[host, resource.format, priceLabels[resource.price_type]].filter(Boolean).join(" · ")}</p>
        {preview && <p>{preview}</p>}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          <SourceLink url={resource.url} label={`Open ${resource.title}`}>Open resource</SourceLink>
          <details>
            <summary className="cursor-pointer text-primary-700">Content and price details</summary>
            {evidence && <p className="mt-1">{resource.learning_evidence}</p>}
            <p className="mt-1 text-neutral-600">{resource.price_evidence || "Price could not be confirmed."}</p>
          </details>
        </div>
      </div>
    </Card>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">{skillName ? `Learn ${skillName}` : "Find learning resources"}</h1>
      <div className="mt-3 flex flex-wrap gap-4">
        {analysisId && <Link className={linkClass} to={`/skills?analysis=${encodeURIComponent(analysisId)}`}>Back to skill comparison</Link>}
        <Link className={linkClass} to="/learn">My learning</Link>
      </div>
      {error && <Alert variant="danger" className="mt-4">{error}</Alert>}
      {(busy || loading) && <p role="status" className="mt-4">{busy || "Loading saved resources…"}</p>}
      {!loading && (!result || !resourceCount) && <div className="mt-6 space-y-3">
        {result && !resourceCount && <p>No matching resources were found.</p>}
        {analysisId && skillName ? <>
          {!searchId && <p>Find free and paid resources for this skill, then build a learning plan.</p>}
          <Button onClick={discover} disabled={!!busy}>{searchId ? "Search for resources again" : "Find learning resources"}</Button>
        </> : <>
          <p>Choose a skill from a job comparison to find relevant resources.</p>
          <Link className={linkClass} to="/target">Search for a target role</Link>
        </>}
        {searchId && !result && <Button variant="ghost" onClick={() => window.location.reload()}>Reload saved results</Button>}
      </div>}
      {result && resourceCount > 0 && <form onSubmit={generate} className="mt-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold">1. Choose resources</h2>
          <p className="mt-1 text-sm text-neutral-600">{resourceCount} found · {selected.length} selected (up to 10). Free resources are selected by default.</p>
          {result.free.length > 0 && <div className="mt-3 space-y-2">
            <h3 className="font-medium">Free ({result.free.length})</h3>
            {result.free.map(resourceRow)}
          </div>}
          {priceTypes.filter(kind => kind !== "free" && result[kind].length).map(kind => <details key={kind} open={result.free.length === 0 || undefined} className="mt-3 rounded-lg border border-neutral-200 p-3">
            <summary className="cursor-pointer font-medium">{priceLabels[kind]} ({result[kind].length})</summary>
            <div className="mt-2 space-y-2">{result[kind].map(resourceRow)}</div>
          </details>)}
          <p className="mt-3 text-xs text-neutral-600">Checked {new Date(result.retrieved_at).toLocaleDateString()}. Prices can change; confirm access on the provider’s site.</p>
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
      </form>}
    </div>
  );
}
