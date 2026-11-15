import { AlertTriangle, CheckCircle2, Copy, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { CARD_ACCENT, GRADIENT_HEADING, ResumeIconsBackground } from "../components/ui/techTheme";
import { useJourney } from "../context/JourneyContext";
import { useResumeCritique } from "../hooks/useResumes";
import type { CritiqueItem, CritiqueSeverity, ResumeSection } from "../lib/types";

const SECTION_ORDER: ResumeSection[] = ["Summary", "Experience", "Skills", "Projects", "Formatting"];

const SEVERITY_CONFIG: Record<
  CritiqueSeverity,
  { label: string; icon: typeof CheckCircle2; classes: string }
> = {
  strength: { label: "Strength", icon: CheckCircle2, classes: "bg-success-50 text-success-700 border-success-200" },
  suggestion: { label: "Suggestion", icon: Lightbulb, classes: "bg-primary-50 text-primary-700 border-primary-200" },
  important: { label: "Important", icon: AlertTriangle, classes: "bg-warning-50 text-warning-800 border-warning-200" },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing we can do without user interaction we don't have
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
    >
      <Copy className="h-3 w-3" aria-hidden="true" />
      {copied ? "Copied!" : "Copy rewrite"}
    </button>
  );
}

function CritiqueCard({ item }: { item: CritiqueItem }) {
  const config = SEVERITY_CONFIG[item.severity];
  const Icon = config.icon;
  return (
    <Card className={CARD_ACCENT}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {config.label}
      </span>
      <p className="mt-2.5 text-sm font-medium text-neutral-900">{item.finding}</p>
      <p className="mt-1 text-sm text-neutral-600">{item.rationale}</p>
      {item.suggestedRewrite && (
        <div className="mt-3 rounded-md bg-neutral-50 p-3">
          <p className="text-sm text-neutral-800">{item.suggestedRewrite}</p>
          <div className="mt-2">
            <CopyButton text={item.suggestedRewrite} />
          </div>
        </div>
      )}
    </Card>
  );
}

export function CritiquePage() {
  const navigate = useNavigate();
  const { profile } = useJourney();
  const critique = useResumeCritique();

  useEffect(() => {
    if (profile) void critique.run(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount for this profile
  }, [profile]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-neutral-700">Let's start by building your profile first.</p>
        <Link to="/start" className="mt-4 inline-block text-sm font-medium text-primary-700 hover:underline">
          Go to Upload résumé
        </Link>
      </div>
    );
  }

  const bySection = (critique.data?.items ?? []).reduce<Record<string, CritiqueItem[]>>(
    (acc, item) => {
      acc[item.section] = [...(acc[item.section] ?? []), item];
      return acc;
    },
    {},
  );

  return (
    <div className="relative mx-auto max-w-3xl px-4 py-16">
      <ResumeIconsBackground />
      <h1 className={`text-2xl font-semibold sm:text-3xl ${GRADIENT_HEADING}`}>Résumé critique</h1>
      <p className="mt-2 max-w-xl text-neutral-600">
        Feedback by section — no overall score, just what was found and why it matters.
      </p>

      {critique.isLoading && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {critique.error && (
        <Alert variant="danger" className="mt-8" title="Couldn't load your critique">
          {critique.error.message}
        </Alert>
      )}

      {critique.data && (
        <div className="mt-8 space-y-8">
          {SECTION_ORDER.filter((section) => bySection[section]?.length).map((section) => (
            <section key={section}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {section}
              </h2>
              <div className="mt-3 space-y-3">
                {bySection[section].map((item) => (
                  <CritiqueCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}

          <div className="flex justify-end border-t border-neutral-200 pt-6">
            <Button size="lg" className="animate-pulse-glow" onClick={() => navigate("/target")}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
