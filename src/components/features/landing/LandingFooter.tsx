import { Logo } from "../../brand/Logo";

export function LandingFooter() {
  return (
    <footer className="bg-neutral-900 py-10">
      <div className="mx-auto flex max-w-5xl justify-center px-4">
        <Logo variant="inverse" className="h-24 w-auto" />
      </div>
    </footer>
  );
}
