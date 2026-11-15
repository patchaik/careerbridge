import { X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  /** Optional extra content rendered inside a tag's chip, e.g. a "from résumé" indicator. */
  renderTagBadge?: (tag: string) => ReactNode;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  renderTagBadge,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && !value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-neutral-300 bg-white p-2 transition-shadow focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-600 focus-within:shadow-[0_0_14px_-3px_rgba(20,184,166,0.5)]",
        className,
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-sm font-medium text-primary-800"
        >
          {tag}
          {renderTagBadge?.(tag)}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            aria-label={`Remove ${tag}`}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : "Add another…"}
        className="min-w-[8rem] flex-1 border-none p-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
      />
    </div>
  );
}
