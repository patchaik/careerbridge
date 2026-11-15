import { FileSearch, ShieldCheck, TrendingUp, type LucideIcon } from "lucide-react";

interface ValueProp {
  icon: LucideIcon;
  title: string;
  description: string;
}

const values: ValueProp[] = [
  {
    icon: TrendingUp,
    title: "AI-aware direction",
    description: "See how AI is changing your target role, and which roles are growing.",
  },
  {
    icon: FileSearch,
    title: "Evidence, not guesswork",
    description: "Every recommendation shows the job postings behind it.",
  },
  {
    icon: ShieldCheck,
    title: "Proof you can show",
    description: "Pass an independent assessment and add verified skills to your résumé.",
  },
];

export function ValueProps() {
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {values.map((value) => (
        <div key={value.title}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <value.icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-base font-semibold text-neutral-900">{value.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">{value.description}</p>
        </div>
      ))}
    </div>
  );
}
