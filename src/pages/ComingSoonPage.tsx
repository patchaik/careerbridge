import { Link } from "react-router-dom";

export function ComingSoonPage({ phase }: { phase: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">This screen isn't built yet</h1>
      <p className="mt-2 text-sm text-neutral-600">
        It's planned for {phase} of the build. Come back after that phase ships.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm font-medium text-primary-700 hover:underline"
      >
        Back to landing
      </Link>
    </div>
  );
}
