// src/i18n/I18nProvider.tsx
//
// Lightweight client-side i18n. No routing/locale-subpath changes: the active
// locale lives in React state (default English), is restored from localStorage
// on mount, and persists on change. t("a.b.c", { name }) resolves a dot-path key
// in the active locale, falls back to English, and interpolates {placeholders}.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, STORAGE_KEY, isLocale, type Locale } from "./config";
import { buildMessages, type MessageTree } from "./messages";

type TVars = Record<string, string | number>;
type TFn = (key: string, vars?: TVars) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue | null>(null);

function lookup(tree: MessageTree, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree);
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Restore a stored preference after mount (keeps SSR/first render English).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) setLocaleState(saved);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.lang = locale;
    } catch {
      /* no document (SSR) */
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const messages = useMemo(() => buildMessages(locale), [locale]);
  const fallback = useMemo(() => buildMessages(DEFAULT_LOCALE), []);

  const t = useCallback<TFn>(
    (key, vars) => {
      let val = lookup(messages, key);
      if (typeof val !== "string") val = lookup(fallback, key);
      if (typeof val !== "string") return key;
      return interpolate(val, vars);
    },
    [messages, fallback]
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

// Convenience hook for components that only need the translate function.
export function useT(): TFn {
  return useI18n().t;
}
