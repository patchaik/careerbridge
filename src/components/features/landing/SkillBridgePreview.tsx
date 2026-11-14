// A realistic mini mockup of the Skill Bridge screen, built from the same UI
// primitives the real app uses — not a decorative illustration.

import { Check, TriangleAlert } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Card } from "../../ui/Card";

const yourSkills = ["Java", "REST APIs", "Docker"];
const gaps = ["RAG", "Tool calling"];

export function SkillBridgePreview() {
  return (
    <Card className="shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-neutral-500">Target role</p>
          <p className="text-sm font-semibold text-neutral-900">Software Engineer — AI Applications</p>
        </div>
        <Badge variant="demo" />
      </div>

      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-800">
        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
        Moderate AI exposure
      </div>

      <div className="mt-4 grid grid-cols-2 gap-5 text-sm">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Your skills</p>
          <ul className="space-y-1.5">
            {yourSkills.map((skill) => (
              <li key={skill} className="flex items-center gap-1.5 text-neutral-800">
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-success-600" aria-hidden="true" />
                {skill}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Gaps to verify</p>
          <ul className="space-y-1.5">
            {gaps.map((gap) => (
              <li key={gap} className="flex flex-wrap items-center justify-between gap-1.5 text-neutral-800">
                {gap}
                <Badge variant="not_established" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
