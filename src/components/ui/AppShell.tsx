import type { ReactNode } from "react";
import Link from "next/link";
import Head from "next/head";
import { cn } from "./cn";
import { useT } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/i18n/LanguageToggle";

export type Role = "doctor" | "pharmacist" | "patient" | "admin";

// Nav entries reference common.nav.* translation keys (resolved at render).
const NAV: Record<Role, { key: string; navKey: string; href: string }[]> = {
  doctor: [{ key: "issue", navKey: "common.nav.issue", href: "/doctor" }],
  pharmacist: [{ key: "dispense", navKey: "common.nav.dispense", href: "/pharmacist" }],
  patient: [{ key: "mine", navKey: "common.nav.mine", href: "/patient" }],
  admin: [
    { key: "actors", navKey: "common.nav.actors", href: "/admin" },
    { key: "ledger", navKey: "common.nav.ledger", href: "/dashboard" },
  ],
};

function Brand({ role }: { role: Role }) {
  const t = useT();
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white font-mono text-sm font-bold">
        ℞
      </span>
      <span className="font-semibold tracking-tight">e-Prescription</span>
      <span className="hidden sm:inline eyebrow ml-1">{t(`common.roles.${role}`)}</span>
    </Link>
  );
}

export function AppShell({
  role,
  active,
  identity,
  title,
  children,
}: {
  role: Role;
  active?: string;
  identity?: string;
  title?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Head>
        <title>{title ? `${title} · e-Prescription` : "e-Prescription"}</title>
      </Head>
      <header className="sticky top-0 z-40 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between gap-4">
          <Brand role={role} />
          <nav className="hidden md:flex items-center gap-1">
            {NAV[role].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  active === n.key
                    ? "bg-teal-tint text-teal font-medium"
                    : "text-muted hover:text-ink hover:bg-line/60"
                )}
              >
                {t(n.navKey)}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {identity && <span className="hidden sm:inline font-mono text-xs text-muted">{identity}</span>}
            <LanguageToggle />
            <Link href="/" className="text-sm text-muted hover:text-st-revoked transition-colors">
              {t("common.exit")}
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
      <footer className="border-t border-line py-5 text-center">
        <p className="eyebrow">{t("common.shellFooter")}</p>
      </footer>
    </div>
  );
}
