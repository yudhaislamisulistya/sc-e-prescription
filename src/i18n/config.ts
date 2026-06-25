// src/i18n/config.ts
//
// Locale configuration for the bilingual UI. English is the default; Bahasa
// Indonesia is the alternative. The choice is persisted in localStorage and
// applied client-side, so statically prerendered pages render in English first
// (no hydration mismatch) and switch on the client if a preference is stored.
export const LOCALES = ["en", "id"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  id: "Bahasa Indonesia",
};

// Short label shown inside the compact language toggle.
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  id: "ID",
};

export const STORAGE_KEY = "eprx.locale";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
