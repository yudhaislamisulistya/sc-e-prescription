// src/pages/dashboard/index.tsx
//
// Ledger dashboard - the read model projected from on-chain events (mitigates
// V6: a queryable, tamper-evident view of every prescription's current state).
import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { RxListItem, type RxSummary } from "@/components/ui/RxListItem";
import { cn } from "@/components/ui/cn";
import { STATE, TONE_CLASS, type StateCode } from "@/components/ui/lifecycle";
import { useT } from "@/i18n/I18nProvider";

const FILTERS: { labelKey: string; state?: StateCode }[] = [
  { labelKey: "dashboard.filters.all" },
  { labelKey: "dashboard.filters.issued", state: 1 },
  { labelKey: "dashboard.filters.partially", state: 2 },
  { labelKey: "dashboard.filters.fully", state: 3 },
  { labelKey: "dashboard.filters.expired", state: 4 },
  { labelKey: "dashboard.filters.revoked", state: 5 },
];

export default function Dashboard() {
  const t = useT();
  const [rows, setRows] = useState<RxSummary[] | null>(null);
  const [filter, setFilter] = useState<StateCode | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (state?: StateCode) => {
    setLoading(true);
    try {
      const q = state !== undefined ? `?state=${state}&limit=200` : "?limit=200";
      const res = await fetch(`/api/prescriptions${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      setRows(data as RxSummary[]);
    } catch (err) {
      toast.error((err as Error).message || t("dashboard.toast.loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  return (
    <AppShell role="admin" active="ledger" title={t("dashboard.shellTitle")}>
      <div className="mb-6">
        <p className="eyebrow mb-1">{t("dashboard.eyebrow")}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
      </div>

      {/* status counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[1, 2, 3, 4, 5].map((s) => {
          const meta = STATE[s as StateCode];
          const count = rows?.filter((r) => r.state === s).length ?? 0;
          return (
            <Card key={s} className="p-4">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", TONE_CLASS[meta.tone].dot)} />
                <span className="eyebrow">{t(`common.status.${meta.tone}.label`)}</span>
              </div>
              <p className="font-mono text-2xl text-ink mt-2">{count}</p>
            </Card>
          );
        })}
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => {
          const isActive = filter === f.state;
          return (
            <button
              key={f.labelKey}
              onClick={() => setFilter(f.state)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-teal text-white" : "bg-card border border-line text-muted hover:text-ink hover:border-teal"
              )}
            >
              {t(f.labelKey)}
            </button>
          );
        })}
      </div>

      {/* list */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted">{t("dashboard.loading")}</Card>
      ) : rows && rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((rx) => (
            <RxListItem key={rx.prescriptionId} rx={rx} />
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <p className="text-sm text-ink font-medium">No prescriptions indexed yet</p>
          <p className="text-sm text-muted mt-1">
            Issue one from the doctor console, then the indexer will project it here.
          </p>
        </Card>
      )}
    </AppShell>
  );
}
