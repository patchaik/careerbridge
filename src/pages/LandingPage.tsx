import { Link } from "react-router-dom";
import { BridgePathway } from "../components/features/landing/BridgePathway";
import { Logo } from "../components/brand/Logo";

export function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <div className="text-center">
        <Logo variant="full" className="mx-auto h-36 w-auto sm:h-40" />
        <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
          See where your skills can take you in a job market shaped by AI.
        </p>
        <Link
          to="/start"
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          Get started
        </Link>
      </div>

      <div className="mt-16">
        <BridgePathway />
      </div>
    </div>
  );
}
