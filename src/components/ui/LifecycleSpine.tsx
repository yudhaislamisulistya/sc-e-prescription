import { cn } from "./cn";
import { STATE, TONE_CLASS, type StateCode } from "./lifecycle";
import { MonoChip } from "./MonoChip";

// The signature element: the on-chain prescription lifecycle made legible —
// a step track (Issued -> Partially -> Fully), a dispensing meter (N/M units),
// terminal off-ramps (Expired / Revoked), and the cryptographic integrity chips.
const FLOW: { code: StateCode; label: string }[] = [
  { code: 1, label: "Issued" },
  { code: 2, label: "Partially" },
  { code: 3, label: "Fully dispensed" },
];

export function LifecycleSpine({
  state,
  totalUnits,
  dispensedUnits,
  cid,
  payloadHash,
}: {
  state: StateCode;
  totalUnits: number;
  dispensedUnits: number;
  cid?: string;
  payloadHash?: string;
}) {
  const meta = STATE[state];
  const terminal = state === 4 || state === 5; // EXPIRED / REVOKED
  const activeIndex = state === 1 ? 0 : state === 2 ? 1 : state === 3 ? 2 : -1;
  const pct = totalUnits > 0 ? Math.min(100, Math.round((dispensedUnits / totalUnits) * 100)) : 0;
  const t = TONE_CLASS[meta.tone];

  return (
    <div className="space-y-5">
      {/* step track */}
      <div className="flex items-center">
        {FLOW.map((step, i) => {
          const reached = !terminal && activeIndex >= i;
          const isActive = !terminal && activeIndex === i;
          return (
            <div key={step.code} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "h-3 w-3 rounded-full ring-4 transition-transform",
                    reached ? `${TONE_CLASS[STATE[step.code].tone].dot} ring-teal-tint` : "bg-line ring-paper",
                    isActive && "scale-125"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-[0.625rem] uppercase tracking-wider",
                    reached ? "text-ink" : "text-faint"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < FLOW.length - 1 && (
                <div className={cn("h-px flex-1 mx-2 -mt-4", !terminal && activeIndex > i ? "bg-teal" : "bg-line")} />
              )}
            </div>
          );
        })}
      </div>

      {terminal && (
        <div className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono ring-1 ring-inset", t.pill)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
          {meta.label} — lifecycle ended
        </div>
      )}

      {/* dispensing meter */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Dispensed</span>
          <span className="font-mono text-xs text-ink">
            {dispensedUnits}
            <span className="text-faint"> / {totalUnits} units</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-line overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", t.bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* integrity anchor */}
      {(cid || payloadHash) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1 text-xs text-teal font-medium">
            <span aria-hidden>◆</span> Integrity anchored
          </span>
          {payloadHash && <MonoChip label="hash" value={payloadHash} />}
          {cid && <MonoChip label="cid" value={cid} />}
        </div>
      )}
    </div>
  );
}
