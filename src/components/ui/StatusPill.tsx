import { cn } from "./cn";
import { STATE, TONE_CLASS, type StateCode } from "./lifecycle";

export function StatusPill({ state, className }: { state: StateCode; className?: string }) {
  const meta = STATE[state];
  const t = TONE_CLASS[meta.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium font-mono ring-1 ring-inset whitespace-nowrap",
        t.pill,
        className
      )}
      title={meta.blurb}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
      {meta.label}
    </span>
  );
}
