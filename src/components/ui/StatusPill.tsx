import { cn } from "./cn";
import { STATE, TONE_CLASS, type StateCode } from "./lifecycle";
import { useT } from "@/i18n/I18nProvider";

export function StatusPill({ state, className }: { state: StateCode; className?: string }) {
  const t = useT();
  const meta = STATE[state];
  const tone = TONE_CLASS[meta.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium font-mono ring-1 ring-inset whitespace-nowrap",
        tone.pill,
        className
      )}
      title={t(`common.status.${meta.tone}.blurb`)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {t(`common.status.${meta.tone}.label`)}
    </span>
  );
}
