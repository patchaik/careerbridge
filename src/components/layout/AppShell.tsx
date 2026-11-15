import type { ReactNode } from "react";
import { ModeIndicator } from "../dev/ModeIndicator";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-neutral-50 pt-16">
      <TopNav />
      <main className="flex-1">{children}</main>
      <ModeIndicator />
    </div>
  );
}
