// src/i18n/LanguageToggle.tsx
//
// Compact EN | ID segmented control. English is the default; selecting a locale
// persists it (see I18nProvider). Used in the landing header and the AppShell.
import { LOCALES, LOCALE_LABEL, LOCALE_SHORT } from "./config";
import { useI18n } from "./I18nProvider";
import { cn } from "@/components/ui/cn";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-line bg-card p-0.5",
        className
      )}
      role="group"
      aria-label={t("common.language")}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          title={LOCALE_LABEL[l]}
          className={cn(
            "px-2 py-1 rounded-md text-xs font-medium font-mono transition-colors",
            locale === l ? "bg-teal text-white" : "text-muted hover:text-ink"
          )}
        >
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
