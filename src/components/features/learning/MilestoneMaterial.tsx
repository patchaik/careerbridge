import { useState } from "react";
import { generateMaterial, type MilestoneMaterial as Material } from "../../../lib/api/materials";
import { priceLabels } from "../../../lib/api/resources";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";

export function MilestoneMaterial({ pathId, milestoneId, saved }: {
  pathId: string;
  milestoneId: string;
  saved?: Material;
}) {
  const [material, setMaterial] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try { setMaterial(await generateMaterial(pathId, milestoneId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Couldn't generate learning material."); }
    finally { setBusy(false); }
  }
  const content = material?.content;
  return <section className="mt-6 border-t border-neutral-200 pt-4" aria-label="Milestone learning material">
    <h3 className="font-semibold">Learning material</h3>
    {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
    {!content ? <>
      <p className="mt-2 text-sm text-neutral-600">Create a lesson for this milestone using its saved resources. It will be saved for your next visit.</p>
      <Button className="mt-3" onClick={generate} disabled={busy}>
        {busy ? "Generating material…" : error ? "Retry learning material" : "Generate learning material"}
      </Button>
      {busy && <p role="status" className="mt-2 text-sm">Preparing your lesson…</p>}
    </> : <div className="mt-3 space-y-4">
      <p className="text-sm text-success-700">Material saved · {content.mode === "text" ? "Text" : "Hands-on"}</p>
      <h4 className="text-lg font-semibold">{content.title}</h4>
      <p>{content.learning_objective}</p>
      <p className="text-xs text-neutral-600">AI-generated teaching guided by saved resource descriptions, not the full course content. External resources may require enrollment or payment; practice here is self-directed.</p>
      {content.sections.map((section, index) => <section key={index}>
        <h4 className="font-medium">{section.heading}</h4>
        <p className="mt-1 whitespace-pre-wrap break-words">{section.body}</p>
      </section>)}
      <section><h4 className="font-medium">Worked example</h4>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-sm">{content.example}</pre>
      </section>
      {content.practice && <section className="space-y-2">
        <h4 className="font-medium">Your practice task</h4>
        <p className="whitespace-pre-wrap">{content.practice.setup}</p>
        <ol className="list-decimal space-y-2 pl-5">{content.practice.steps.map((step, index) => <li key={index} className="whitespace-pre-wrap">{step}</li>)}</ol>
        <p><strong>What to produce: </strong>{content.practice.deliverable}</p>
      </section>}
      <section><h4 className="font-medium">Self-check</h4>
        <p className="text-xs text-neutral-600">Try each question before revealing the answer. These checks do not verify mastery.</p>
        {content.self_checks.map((check, index) => <div key={index} className="mt-3">
          <p>{check.question}</p>
          <details className="mt-1"><summary className="cursor-pointer text-primary-700">Show suggested answer</summary>
            <p className="mt-2 whitespace-pre-wrap">{check.answer}</p></details>
        </div>)}
      </section>
      <section><h4 className="font-medium">Continue with these saved resources</h4>
        <ul className="mt-1 space-y-1">{material.resources.map(resource => <li key={resource.id}>
          <a href={resource.url} target="_blank" rel="noreferrer" className="text-primary-700 underline">{resource.title}</a>
          <span className="ml-2 text-xs text-neutral-600">{priceLabels[resource.price_type]}</span>
        </li>)}</ul>
      </section>
    </div>}
  </section>;
}
