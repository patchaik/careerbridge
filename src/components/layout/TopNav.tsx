import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Logo } from "../brand/Logo";
import { useAuth } from "../../context/AuthContext";
import { MAIN_PATH, useJourney } from "../../context/JourneyContext";
import { cn } from "../../lib/cn";

interface GroupDef {
  label: string;
  to: string;
  matches: string[];
  firstIndex: number;
}

const groups: GroupDef[] = [
  { label: "About Us", to: "/", matches: ["/"] },
  { label: "Profile", to: "/start", matches: ["/start", "/interests", "/critique"] },
  { label: "Direction", to: "/target", matches: ["/target", "/recommendations"] },
  { label: "Skills", to: "/skills", matches: ["/skills"] },
  { label: "Learn", to: "/courses", matches: ["/courses", "/learn", "/arena"] },
  { label: "Prove", to: "/assessment", matches: ["/assessment", "/resume", "/jobs"] },
  { label: "Progress", to: "/progress", matches: ["/progress"] },
].map((g) => ({ ...g, firstIndex: MAIN_PATH.indexOf(g.to as (typeof MAIN_PATH)[number]) }));

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!user) return null;
  const initial = user.fullName.trim().charAt(0).toUpperCase() || "?";
  const firstName = user.fullName.split(" ")[0];

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
          {initial}
        </span>
        <span className="hidden text-sm font-medium text-neutral-700 sm:inline">{firstName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const { isSignedIn } = useAuth();
  const { furthestStepIndex } = useJourney();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-16 border-b bg-white transition-shadow",
        scrolled ? "border-neutral-200 shadow-sm" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          to="/"
          className="flex-shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <Logo variant="stacked" tagline={false} className="h-12 w-auto" />
        </Link>
        <nav aria-label="Journey groups" className="overflow-x-auto">
          <ol className="flex items-center gap-1 sm:gap-2">
            {groups.map((group, i) => {
              const unlocked = furthestStepIndex >= group.firstIndex;
              const isCurrent = group.matches.some(
                (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
              );
              return (
                <li key={group.label} className="flex items-center gap-1 sm:gap-2">
                  {unlocked ? (
                    <Link
                      to={group.to}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
                        isCurrent
                          ? "bg-primary-50 text-primary-700"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                      )}
                    >
                      {group.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      tabIndex={0}
                      title="Complete the previous steps first"
                      className="cursor-not-allowed whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium text-neutral-400"
                    >
                      {group.label}
                      <span className="sr-only"> (locked — complete the previous steps first)</span>
                    </span>
                  )}
                  {i < groups.length - 1 && (
                    <span className="hidden h-px w-3 bg-neutral-300 sm:block" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        {isSignedIn ? (
          <AccountMenu />
        ) : (
          <Link
            to="/signin"
            className="flex-shrink-0 whitespace-nowrap rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
