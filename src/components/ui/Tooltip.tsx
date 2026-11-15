import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom";
  className?: string;
}

// Pure CSS hover/focus tooltip — no positioning library. `content` renders
// in a dark glass panel with the same glow accent used elsewhere in the
// "high-tech" theme.
export function Tooltip({ content, children, placement = "top", className }: TooltipProps) {
  return (
    <span className={cn("group relative inline-block", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-20 w-72 -translate-x-1/2 rounded-lg border border-accent-400/40 bg-neutral-900 px-3.5 py-3 text-xs leading-relaxed text-neutral-200 shadow-[0_0_24px_-4px_rgba(20,184,166,0.6)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100",
          placement === "top" ? "bottom-full mb-3" : "top-full mt-3",
        )}
      >
        {content}
        <span
          className={cn(
            "absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-accent-400/40 bg-neutral-900",
            placement === "top" ? "top-full -mt-1.5 border-b border-r" : "bottom-full -mb-1.5 border-t border-l",
          )}
        />
      </span>
    </span>
  );
}
