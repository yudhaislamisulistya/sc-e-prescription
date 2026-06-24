import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleSpine } from "@/components/ui/LifecycleSpine";
import { cn } from "@/components/ui/cn";

const ROLES: { href: string; title: string; line: string; enabled: boolean }[] = [
  { href: "/doctor", title: "Doctor", line: "Issue & sign prescriptions", enabled: true },
  { href: "/pharmacist", title: "Pharmacist", line: "Verify & dispense units", enabled: true },
  { href: "/patient", title: "Patient", line: "View & grant pharmacy access", enabled: true },
  { href: "/admin", title: "Administrator", line: "Manage the on-chain registry", enabled: true },
];

const STATS: [string, string][] = [
  ["7", "weaknesses mitigated"],
  ["3", "on-chain registries"],
  ["0", "PII on the ledger"],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="mx-auto w-full max-w-6xl px-5 h-14 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white font-mono text-sm font-bold">
          ℞
        </span>
        <span className="font-semibold tracking-tight">e‑Prescription</span>
        <span className="eyebrow ml-1 hidden sm:inline">Smart-contract redesign</span>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 flex-1">
        {/* hero */}
        <section className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center py-12 lg:py-20">
          <div>
            <p className="eyebrow mb-4">Permissioned ledger · Besu IBFT 2.0</p>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
              Prescriptions you can <span className="text-teal">prove</span>.
            </h1>
            <p className="mt-5 text-muted text-lg max-w-md leading-relaxed">
              Every prescription is signed by its doctor, encrypted end‑to‑end, and tracked through a
              tamper‑evident lifecycle — from issued to dispensed — on a consortium blockchain.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#roles"
                className="inline-flex h-11 items-center rounded-lg bg-teal px-5 text-white font-medium hover:bg-teal-deep transition-colors"
              >
                Choose a role
              </a>
              <a
                href="#how"
                className="inline-flex h-11 items-center rounded-lg border border-line-strong px-5 font-medium hover:border-teal hover:text-teal transition-colors"
              >
                How it works
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {STATS.map(([n, l]) => (
                <div key={l}>
                  <dd className="font-mono text-2xl text-ink">{n}</dd>
                  <dt className="text-xs text-muted mt-0.5 leading-snug">{l}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* signature: live lifecycle card */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="eyebrow">Prescription</p>
                <p className="font-mono text-sm text-ink mt-1">0x9f2a…41c7</p>
              </div>
              <StatusPill state={2} />
            </div>
            <LifecycleSpine
              state={2}
              totalUnits={30}
              dispensedUnits={10}
              cid="bafybeigdyr…fbzdi"
              payloadHash="0xaa31…9c0e"
            />
            <p className="mt-5 text-xs text-muted">
              Live example — the same lifecycle view every role sees, read straight from the chain.
            </p>
          </Card>
        </section>

        {/* roles */}
        <section id="roles" className="py-12 border-t border-line">
          <p className="eyebrow mb-2">Enter the console</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">Choose your role</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map((r) => (
              <RoleCard key={r.title} {...r} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Consoles are being rebuilt on the redesigned backend — enabled one role at a time.
          </p>
        </section>

        {/* how it works */}
        <section id="how" className="py-12 border-t border-line">
          <p className="eyebrow mb-2">From signature to dispense</p>
          <h2 className="text-2xl font-semibold tracking-tight mb-6">How a prescription moves</h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["Issue", "The doctor signs the prescription (EIP‑712). It is encrypted and pinned; only its hash and lifecycle live on-chain."],
              ["Grant", "Keys are wrapped per recipient. The patient's custodian re‑wraps the key for the chosen pharmacy — no plaintext leaves the boundary."],
              ["Dispense", "The pharmacist dispenses units. On-chain accounting makes double‑dispensing impossible across the consortium."],
              ["Audit", "Every transition is an event, projected into a read model — a complete, tamper‑evident trail."],
            ].map(([title, body], i) => (
              <li key={title}>
                <Card className="p-5 h-full">
                  <span className="font-mono text-xs text-teal">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-semibold mt-2">{title}</h3>
                  <p className="text-sm text-muted mt-1.5 leading-relaxed">{body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center">
        <p className="eyebrow">Universitas Gadjah Mada · thesis prototype · YIS</p>
      </footer>
    </div>
  );
}

function RoleCard({ href, title, line, enabled }: { href: string; title: string; line: string; enabled: boolean }) {
  const inner = (
    <Card className={cn("p-5 h-full transition-all", enabled ? "hover:border-teal hover:shadow-md" : "opacity-60")}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className={cn("text-sm font-mono", enabled ? "text-teal" : "text-faint")}>{enabled ? "→" : "soon"}</span>
      </div>
      <p className="text-sm text-muted mt-1">{line}</p>
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
