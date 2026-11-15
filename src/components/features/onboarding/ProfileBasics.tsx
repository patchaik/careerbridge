import { useState, type ChangeEvent } from "react";
import { cn } from "../../../lib/cn";
import type { ExperienceLevel, Situation } from "../../../lib/types";

export const SITUATION_OPTIONS: { value: Situation; label: string }[] = [
  { value: "upskill", label: "I'm looking to upskill in my current career" },
  { value: "no_job", label: "I don't currently have a job" },
  { value: "new_career", label: "I want a new career path" },
];

export const EXPERIENCE_LEVEL_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "expert", label: "Expert" },
];

export const MIN_YEARS_OF_EXPERIENCE = 0;
export const MAX_YEARS_OF_EXPERIENCE = 50;

// Shared with StartPage so the submit button's disabled state and hint text
// stay in sync with the rules enforced here.
export function yearsOfExperienceError(years: number | null): string | null {
  if (years === null) return "Enter your years of experience.";
  if (!Number.isInteger(years)) return "Enter a whole number — no decimals.";
  if (years < MIN_YEARS_OF_EXPERIENCE) return "Enter a number of 0 or more.";
  if (years > MAX_YEARS_OF_EXPERIENCE) {
    return `Enter a number of ${MAX_YEARS_OF_EXPERIENCE} or less.`;
  }
  return null;
}

export function isProfileBasicsValid(
  situation: Situation | null,
  experienceLevel: ExperienceLevel | null,
  yearsOfExperience: number | null,
): boolean {
  return Boolean(situation) && Boolean(experienceLevel) && yearsOfExperienceError(yearsOfExperience) === null;
}

interface ProfileBasicsProps {
  situation: Situation | null;
  onSituationChange: (situation: Situation | null) => void;
  experienceLevel: ExperienceLevel | null;
  onExperienceLevelChange: (level: ExperienceLevel | null) => void;
  yearsOfExperience: number | null;
  onYearsOfExperienceChange: (years: number | null) => void;
}

export function ProfileBasics({
  situation,
  onSituationChange,
  experienceLevel,
  onExperienceLevelChange,
  yearsOfExperience,
  onYearsOfExperienceChange,
}: ProfileBasicsProps) {
  const [yearsTouched, setYearsTouched] = useState(false);

  function handleYearsChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.trim() === "") {
      onYearsOfExperienceChange(null);
      return;
    }
    const parsed = Number(raw);
    onYearsOfExperienceChange(Number.isNaN(parsed) ? null : parsed);
  }

  const yearsError = yearsTouched ? yearsOfExperienceError(yearsOfExperience) : null;

  return (
    <div className="space-y-6">
      <section>
        <label htmlFor="situation" className="block text-sm font-semibold text-neutral-800">
          What best describes your situation?
        </label>
        <select
          id="situation"
          value={situation ?? ""}
          onChange={(e) => onSituationChange((e.target.value || null) as Situation | null)}
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <option value="" disabled>
            Select one…
          </option>
          {SITUATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      <section>
        <label htmlFor="experience-level" className="block text-sm font-semibold text-neutral-800">
          What's your experience level?
        </label>
        <select
          id="experience-level"
          value={experienceLevel ?? ""}
          onChange={(e) => onExperienceLevelChange((e.target.value || null) as ExperienceLevel | null)}
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <option value="" disabled>
            Select one…
          </option>
          {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </section>

      <section>
        <label htmlFor="years-of-experience" className="block text-sm font-semibold text-neutral-800">
          How many years of experience do you have?
        </label>
        <p className="mt-1 text-xs text-neutral-500">Enter 0 if you're just starting out.</p>
        <input
          id="years-of-experience"
          type="number"
          inputMode="numeric"
          min={MIN_YEARS_OF_EXPERIENCE}
          max={MAX_YEARS_OF_EXPERIENCE}
          step={1}
          value={yearsOfExperience ?? ""}
          onChange={handleYearsChange}
          onBlur={() => setYearsTouched(true)}
          required
          aria-invalid={yearsError ? true : undefined}
          aria-describedby={yearsError ? "years-of-experience-error" : undefined}
          className={cn(
            "mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
            yearsError ? "border-danger-400" : "border-neutral-300",
          )}
        />
        {yearsError && (
          <p id="years-of-experience-error" className="mt-1 text-xs text-danger-600">
            {yearsError}
          </p>
        )}
      </section>
    </div>
  );
}
