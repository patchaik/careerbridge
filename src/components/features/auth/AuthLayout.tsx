import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../brand/Logo";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <Link to="/" className="flex justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
          <Logo variant="stacked" tagline={false} className="h-16 w-auto" />
        </Link>
        <h1 className="mt-6 text-center text-xl font-semibold text-neutral-900">{title}</h1>
        <p className="mt-1 text-center text-sm text-neutral-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
