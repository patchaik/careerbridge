import { Logo } from "../../brand/Logo";

const links = ["About", "Privacy", "Contact"];

export function LandingFooter() {
  return (
    <footer className="bg-neutral-900 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 text-center">
        <Logo variant="inverse" className="h-24 w-auto" />
        <p className="text-sm text-neutral-400">Built for the AI for Good Buildathon</p>
        <nav aria-label="Footer">
          <ul className="flex items-center gap-5">
            {links.map((link) => (
              <li key={link}>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-sm text-neutral-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
