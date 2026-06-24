// Lifecycle metadata - mirrors the on-chain IPrescriptionRegistry.State enum.
// The tone drives the status colour system (each State has ONE learnable colour).
export type StateCode = 0 | 1 | 2 | 3 | 4 | 5;
export type Tone = "none" | "issued" | "partial" | "full" | "expired" | "revoked";

export interface StateMeta {
  code: StateCode;
  key: string; // contract enum key
  label: string; // human label
  tone: Tone;
  blurb: string; // one-line description
}

export const STATE: Record<StateCode, StateMeta> = {
  0: { code: 0, key: "None", label: "Not found", tone: "none", blurb: "No prescription exists for this id." },
  1: { code: 1, key: "ISSUED", label: "Issued", tone: "issued", blurb: "Signed by the doctor and recorded on-chain. Ready to dispense." },
  2: { code: 2, key: "PARTIALLY_DISPENSED", label: "Partially dispensed", tone: "partial", blurb: "Some units dispensed; more remain." },
  3: { code: 3, key: "FULLY_DISPENSED", label: "Fully dispensed", tone: "full", blurb: "All units dispensed. Refill if allowed." },
  4: { code: 4, key: "EXPIRED", label: "Expired", tone: "expired", blurb: "Past its validity window. No longer dispensable." },
  5: { code: 5, key: "REVOKED", label: "Revoked", tone: "revoked", blurb: "Voided by the doctor or an admin." },
};

// Literal class strings (kept whole so Tailwind's scanner sees them).
export const TONE_CLASS: Record<Tone, { pill: string; dot: string; bar: string; text: string }> = {
  none: { pill: "bg-faint/10 text-faint ring-faint/30", dot: "bg-faint", bar: "bg-faint", text: "text-faint" },
  issued: { pill: "bg-st-issued/10 text-st-issued ring-st-issued/25", dot: "bg-st-issued", bar: "bg-st-issued", text: "text-st-issued" },
  partial: { pill: "bg-st-partial/10 text-st-partial ring-st-partial/25", dot: "bg-st-partial", bar: "bg-st-partial", text: "text-st-partial" },
  full: { pill: "bg-st-full/10 text-st-full ring-st-full/25", dot: "bg-st-full", bar: "bg-st-full", text: "text-st-full" },
  expired: { pill: "bg-st-expired/10 text-st-expired ring-st-expired/25", dot: "bg-st-expired", bar: "bg-st-expired", text: "text-st-expired" },
  revoked: { pill: "bg-st-revoked/10 text-st-revoked ring-st-revoked/25", dot: "bg-st-revoked", bar: "bg-st-revoked", text: "text-st-revoked" },
};
