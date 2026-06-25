import Link from "next/link";
import Head from "next/head";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleSpine } from "@/components/ui/LifecycleSpine";
import { cn } from "@/components/ui/cn";
import { useT } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/i18n/LanguageToggle";

const ROLES: { href: string; titleKey: string; lineKey: string; enabled: boolean }[] = [
  { href: "/doctor", titleKey: "common.roles.doctor", lineKey: "home.roles.doctor", enabled: true },
  { href: "/pharmacist", titleKey: "common.roles.pharmacist", lineKey: "home.roles.pharmacist", enabled: true },
  { href: "/patient", titleKey: "common.roles.patient", lineKey: "home.roles.patient", enabled: true },
  { href: "/admin", titleKey: "common.roles.admin", lineKey: "home.roles.admin", enabled: true },
];

const STATS: [string, string][] = [
  ["7", "home.stats.weaknesses"],
  ["3", "home.stats.registries"],
  ["0", "home.stats.pii"],
];

const STEPS: [string, string][] = [
  ["home.how.steps.issue.title", "home.how.steps.issue.body"],
  ["home.how.steps.grant.title", "home.how.steps.grant.body"],
  ["home.how.steps.dispense.title", "home.how.steps.dispense.body"],
  ["home.how.steps.audit.title", "home.how.steps.audit.body"],
];

export default function Home() {
  const t = useT();
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <Head>
        <title>e-Prescription · Prescriptions you can prove</title>
        <meta name="description" content={t("home.meta.description")} />
      </Head>
      <header className="mx-auto w-full max-w-6xl px-5 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white font-mono text-sm font-bold">
            ℞
          </span>
          <span className="font-semibold tracking-tight">{t("home.brand.name")}</span>
          <span className="eyebrow ml-1 hidden sm:inline">{t("home.brand.tagline")}</span>
        </div>
        <LanguageToggle />
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 flex-1">
        {/* hero */}
        <section className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center py-12 lg:py-20">
          <div>
            <p className="eyebrow mb-4">{t("home.hero.eyebrow")}</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
              {t("home.hero.headlineLead")}
              <span className="text-teal">{t("home.hero.headlineEmphasis")}</span>
              {t("home.hero.headlineTail")}
            </h1>
            <p className="mt-5 text-muted text-lg max-w-md leading-relaxed">
              {t("home.hero.subtext")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#roles"
                className="inline-flex h-11 items-center rounded-lg bg-teal px-5 text-white font-medium hover:bg-teal-deep transition-colors"
              >
                {t("home.hero.chooseRole")}
              </a>
              <Link
                href="/flow"
                className="inline-flex h-11 items-center rounded-lg border border-line-strong px-5 font-medium hover:border-teal hover:text-teal transition-colors"
              >
                {t("home.hero.howItWorks")}
              </Link>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {STATS.map(([n, l]) => (
                <div key={l}>
                  <dd className="font-mono text-2xl text-ink">{n}</dd>
                  <dt className="text-xs text-muted mt-0.5 leading-snug">{t(l)}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* signature: live lifecycle card */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="eyebrow">{t("home.live.eyebrow")}</p>
                <p className="font-mono text-sm text-ink mt-1">0x9f2a...41c7</p>
              </div>
              <StatusPill state={2} />
            </div>
            <LifecycleSpine
              state={2}
              totalUnits={30}
              dispensedUnits={10}
              cid="bafybeigdyr...fbzdi"
              payloadHash="0xaa31...9c0e"
            />
            <p className="mt-5 text-xs text-muted">
              {t("home.live.caption")}
            </p>
          </Card>
        </section>

        {/* roles */}
        <section id="roles" className="py-12 border-t border-line">
          <p className="eyebrow mb-2">{t("home.roles.sectionEyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">{t("home.roles.sectionHeading")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map((r) => (
              <RoleCard key={r.titleKey} {...r} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            {t("home.roles.note")}
          </p>
        </section>

        {/* how it works */}
        <section id="how" className="py-12 border-t border-line">
          <p className="eyebrow mb-2">{t("home.how.eyebrow")}</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">{t("home.how.heading")}</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(([titleKey, bodyKey], i) => (
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
      </main>

      <footer className="border-t border-line py-6 text-center">
        <p className="eyebrow">{t("home.footer")}</p>
      </footer>
    </div>
  );
}

function RoleCard({ href, titleKey, lineKey, enabled }: { href: string; titleKey: string; lineKey: string; enabled: boolean }) {
  const t = useT();
  const inner = (
    <Card className={cn("p-5 h-full transition-all", enabled ? "hover:border-teal hover:shadow-md" : "opacity-60")}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t(titleKey)}</h3>
        <span className={cn("text-sm font-mono", enabled ? "text-teal" : "text-faint")}>{enabled ? "→" : t("home.card.soon")}</span>
      </div>
      <p className="text-sm text-muted mt-1">{t(lineKey)}</p>
    </Card>
  );
  return enabled ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    <div aria-disabled="true">{inner}</div>
  );
}
