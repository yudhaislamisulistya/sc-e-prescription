import Link from "next/link";
import Head from "next/head";
import { Card } from "@/components/ui/Card";
import { useT } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/i18n/LanguageToggle";

const LIFECYCLE: [string, string][] = [
  ["flow.lifecycle.steps.issue.title", "flow.lifecycle.steps.issue.body"],
  ["flow.lifecycle.steps.grant.title", "flow.lifecycle.steps.grant.body"],
  ["flow.lifecycle.steps.dispense.title", "flow.lifecycle.steps.dispense.body"],
  ["flow.lifecycle.steps.audit.title", "flow.lifecycle.steps.audit.body"],
];

const REGISTRIES: [string, string][] = [
  ["flow.architecture.cards.identity.title", "flow.architecture.cards.identity.body"],
  ["flow.architecture.cards.prescription.title", "flow.architecture.cards.prescription.body"],
  ["flow.architecture.cards.keyAccess.title", "flow.architecture.cards.keyAccess.body"],
];

const ARCH_NOTES: string[] = [
  "flow.architecture.notes.consortium",
  "flow.architecture.notes.pii",
  "flow.architecture.notes.encryption",
  "flow.architecture.notes.storage",
];

const ROLES: { href: string; titleKey: string; lineKey: string }[] = [
  { href: "/doctor", titleKey: "common.roles.doctor", lineKey: "flow.roles.items.doctor.line" },
  { href: "/pharmacist", titleKey: "common.roles.pharmacist", lineKey: "flow.roles.items.pharmacist.line" },
  { href: "/patient", titleKey: "common.roles.patient", lineKey: "flow.roles.items.patient.line" },
  { href: "/admin", titleKey: "common.roles.admin", lineKey: "flow.roles.items.admin.line" },
];

export default function Flow() {
  const t = useT();
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <Head>
        <title>{t("flow.meta.title")}</title>
        <meta name="description" content={t("flow.meta.description")} />
      </Head>

      <header className="mx-auto w-full max-w-6xl px-5 h-14 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white font-mono text-sm font-bold">
            ℞
          </span>
          <span className="font-semibold tracking-tight">{t("flow.header.brand")}</span>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:border-teal hover:text-teal transition-colors"
          >
            {t("common.exit")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 flex-1">
        {/* hero */}
        <section className="py-12 lg:py-20 max-w-3xl">
          <p className="eyebrow mb-4">{t("flow.hero.eyebrow")}</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
            {t("flow.hero.title")}
          </h1>
          <p className="mt-5 text-muted text-lg leading-relaxed">{t("flow.hero.intro")}</p>
        </section>

        {/* lifecycle */}
        <section className="py-12 border-t border-line">
          <p className="eyebrow mb-2">{t("flow.lifecycle.eyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">{t("flow.lifecycle.heading")}</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LIFECYCLE.map(([titleKey, bodyKey], i) => (
              <li key={titleKey}>
                <Card className="p-5 h-full">
                  <span className="font-mono text-xs text-teal">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-semibold mt-2">{t(titleKey)}</h3>
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">{t(bodyKey)}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* architecture */}
        <section className="py-12 border-t border-line">
          <p className="eyebrow mb-2">{t("flow.architecture.eyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">{t("flow.architecture.heading")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {REGISTRIES.map(([titleKey, bodyKey]) => (
              <Card key={titleKey} className="p-5 h-full">
                <h3 className="font-mono text-sm font-semibold text-teal">{t(titleKey)}</h3>
                <p className="text-sm text-muted mt-2 leading-relaxed">{t(bodyKey)}</p>
              </Card>
            ))}
          </div>
          <ul className="mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {ARCH_NOTES.map((noteKey) => (
              <li key={noteKey} className="flex gap-2 text-sm text-muted leading-relaxed">
                <span className="text-teal" aria-hidden="true">
                  ·
                </span>
                <span>{t(noteKey)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* roles */}
        <section className="py-12 border-t border-line">
          <p className="eyebrow mb-2">{t("flow.roles.eyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">{t("flow.roles.heading")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map((r) => (
              <Link key={r.href} href={r.href} className="block">
                <Card className="p-5 h-full transition-all hover:border-teal hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{t(r.titleKey)}</h3>
                    <span className="text-sm font-mono text-teal">→</span>
                  </div>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{t(r.lineKey)}</p>
                  <span className="mt-3 inline-block eyebrow">{t("flow.roles.open")}</span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center">
        <p className="eyebrow">{t("common.shellFooter")}</p>
      </footer>
    </div>
  );
}
