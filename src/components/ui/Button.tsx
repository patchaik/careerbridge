import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "btn-sheen bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500 text-white " +
    "shadow-[0_2px_10px_-2px_rgba(55,48,163,0.5)] " +
    "hover:shadow-[0_0_20px_-1px_rgba(20,184,166,0.55)] hover:brightness-110 active:scale-[0.97] " +
    "disabled:from-primary-300 disabled:via-primary-300 disabled:to-primary-300 disabled:shadow-none disabled:brightness-100 disabled:active:scale-100",
  secondary:
    "border border-primary-200 bg-white text-primary-700 " +
    "hover:border-accent-400 hover:bg-primary-50 hover:shadow-[0_0_12px_-3px_rgba(20,184,166,0.5)] active:scale-[0.97] " +
    "disabled:text-neutral-400 disabled:border-neutral-200 disabled:shadow-none disabled:active:scale-100",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 active:scale-[0.97] disabled:text-neutral-300 disabled:active:scale-100",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:scale-[0.97] disabled:bg-danger-300 disabled:active:scale-100",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        "disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
