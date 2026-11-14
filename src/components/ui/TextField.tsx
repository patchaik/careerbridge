import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface TextFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  labelRightSlot?: ReactNode;
  inputRightSlot?: ReactNode;
}

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  error,
  required,
  autoComplete,
  placeholder,
  labelRightSlot,
  inputRightSlot,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-neutral-700">
          {label}
        </label>
        {labelRightSlot}
      </div>
      <div className="relative mt-1">
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
            inputRightSlot ? "pr-10" : false,
            error ? "border-danger-400" : "border-neutral-300",
          )}
        />
        {inputRightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">{inputRightSlot}</div>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
