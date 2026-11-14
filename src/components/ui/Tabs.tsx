import { useId, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  defaultTabId?: string;
  className?: string;
}

export function Tabs({ tabs, defaultTabId, className }: TabsProps) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);
  const baseId = useId();

  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 border-b border-neutral-200">
        {tabs.map((tab) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                selected
                  ? "border-b-2 border-primary-600 text-primary-700"
                  : "border-b-2 border-transparent text-neutral-500 hover:text-neutral-800",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== activeId}
          className="pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
