import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, className, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <label htmlFor={inputId} className={cn("flex items-start gap-2 text-sm text-neutral-800", className)}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          {...props}
        />
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";
