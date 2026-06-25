// src/i18n/messages/index.ts
//
// Composes every namespace into one tree per locale. A translation key is a dot
// path "namespace.section.key" (e.g. "doctor.title", "common.wallet.connect").
import type { Locale } from "../config";
import { common } from "./common";
import { home } from "./home";
import { doctor } from "./doctor";
import { pharmacist } from "./pharmacist";
import { patient } from "./patient";
import { admin } from "./admin";
import { dashboard } from "./dashboard";
import { notFound } from "./notFound";
import { flow } from "./flow";

const NAMESPACES = {
  common,
  home,
  doctor,
  pharmacist,
  patient,
  admin,
  dashboard,
  notFound,
  flow,
} as const;

export type MessageTree = Record<string, unknown>;

// Build the message tree for a locale: { common: {...}, doctor: {...}, ... }.
export function buildMessages(locale: Locale): MessageTree {
  const out: MessageTree = {};
  for (const [ns, dict] of Object.entries(NAMESPACES)) {
    out[ns] = (dict as Record<Locale, unknown>)[locale] ?? {};
  }
  return out;
}
