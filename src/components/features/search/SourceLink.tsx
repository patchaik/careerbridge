import type { ReactNode } from "react";

import { sourceUrl } from "../../../lib/sourceUrl";

export function SourceLink({ url, children, label, demo = false }: { url: string; children: ReactNode; label?: string; demo?: boolean }) {
  const source = demo ? null : sourceUrl(url);
  if (!source) return <span>{children} <small className="text-neutral-500">· {demo ? "Demo posting" : "Link unavailable"}</small></span>;
  return <a aria-label={label} href={source.href} target="_blank" rel="noreferrer" className="text-primary-700 underline">{children}</a>;
}
