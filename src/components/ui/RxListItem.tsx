import type { ReactNode } from "react";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";
import type { StateCode } from "./lifecycle";

export interface RxSummary {
  prescriptionId: string;
  patientRef: string;
  doctorAddr?: string;
  totalUnits: number;
  dispensedUnits: number;
  state: number;
  expiresAt: number;
}

function shorten(v: string): string {
  return v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

export function RxListItem({
  rx,
  action,
  onClick,
  selected,
}: {
  rx: RxSummary;
  action?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const pct = rx.totalUnits > 0 ? Math.min(100, Math.round((rx.dispensedUnits / rx.totalUnits) * 100)) : 0;
  return (
    <Card
      onClick={onClick}
      className={
        "p-4 transition-colors " +
        (onClick ? "cursor-pointer hover:border-teal " : "") +
        (selected ? "border-teal ring-1 ring-teal/20 " : "")
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-ink">{shorten(rx.prescriptionId)}</code>
            <StatusPill state={rx.state as StateCode} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="font-mono">patient {shorten(rx.patientRef)}</span>
            <span className="font-mono">
              {rx.dispensedUnits}/{rx.totalUnits} units
            </span>
            <span>exp {new Date(rx.expiresAt * 1000).toLocaleDateString()}</span>
          </div>
          <div className="mt-2 h-1.5 w-40 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </Card>
  );
}
