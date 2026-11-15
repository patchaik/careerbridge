import { Link } from "react-router-dom";
import { BridgeJourneyAnimation } from "../components/landing/BridgeJourneyAnimation";
import { JourneyStepper } from "../components/features/landing/JourneyStepper";
import { LandingFooter } from "../components/features/landing/LandingFooter";
import { ValueProps } from "../components/features/landing/ValueProps";
import { useAuth } from "../context/AuthContext";
import { MAIN_PATH, useJourney } from "../context/JourneyContext";

export function LandingPage() {
  const { isSignedIn } = useAuth();
  const { furthestStepIndex } = useJourney();
  const getStartedTo = !isSignedIn
    ? "/signin"
    : furthestStepIndex === 0
      ? "/start"
      : MAIN_PATH[furthestStepIndex];

  return (
    <>
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
              Find your next career move in a job market shaped by AI.
            </h1>
            <p className="mt-4 max-w-md text-base text-neutral-600 sm:text-lg">
              Upload your résumé, see which roles are growing, close your skill gaps, and prove
              what you've learned.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to={getStartedTo}
                className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                Get started
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-lg border border-primary-300 bg-white px-5 py-3 text-base font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                See how it works
              </a>
            </div>
            <p className="mt-3 text-sm text-neutral-500">Free to try · Your résumé stays private</p>
          </div>

          <div className="mx-auto w-full max-w-md lg:mx-0">
            <BridgeJourneyAnimation />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-16">
        <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl">
          How it works
        </h2>
        <div className="mt-12">
          <JourneyStepper />
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-semibold text-neutral-900 sm:text-3xl">
            Why CareerBridge
          </h2>
          <div className="mt-12">
            <ValueProps />
          </div>
        </div>
      </section>

      <section className="bg-primary-50 py-14">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <p className="text-xl font-semibold text-neutral-900">
            Ready to see where your skills can take you?
          </p>
          <Link
            to="/start"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            Get started
          </Link>
        </div>
      </section>

      <LandingFooter />
    </>
  );
}
