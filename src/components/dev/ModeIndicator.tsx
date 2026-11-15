// Dev-only (import.meta.env.DEV) visual indicator of whether the API layer
// is calling the mock layer or the real backend, plus which endpoints are
// still forced mock even in real mode. Renders nothing in a production build.

import { useState } from "react";
import { API_BASE_URL, USE_MOCKS } from "../../lib/config";

export function ModeIndicator() {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-2 right-2 z-50 font-mono text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border px-2.5 py-1 font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
          USE_MOCKS
            ? "border-warning-300 bg-warning-50 text-warning-800"
            : "border-success-300 bg-success-50 text-success-800"
        }`}
        aria-expanded={open}
      >
        API: {USE_MOCKS ? "MOCK" : "REAL"}
      </button>
      {open && (
        <div className="mt-1 max-w-xs rounded-lg border border-neutral-200 bg-white p-2 text-neutral-700 shadow-lg">
          <p>VITE_USE_MOCKS → {USE_MOCKS ? "mock" : "real"}</p>
          <p>VITE_API_BASE_URL → {API_BASE_URL}</p>
          <p className="mt-1 text-neutral-400">
            Per-endpoint overrides in src/lib/api/endpoints.ts always apply —
            some endpoints stay mock even here.
          </p>
        </div>
      )}
    </div>
  );
}
