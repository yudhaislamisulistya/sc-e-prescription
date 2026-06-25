// src/i18n/messages/common.ts
//
// Shared strings used by cross-cutting components (AppShell, WalletButton,
// StatusPill, LifecycleSpine, RxListItem). Page-specific strings live in their
// own namespace files (home.ts, doctor.ts, ...). Every namespace exports the
// same shape: { en: {...}, id: {...} }.
export const common = {
  en: {
    roles: {
      doctor: "Doctor",
      pharmacist: "Pharmacist",
      patient: "Patient",
      admin: "Administrator",
    },
    nav: {
      issue: "Issue",
      dispense: "Dispense",
      mine: "My prescriptions",
      actors: "Registry",
      ledger: "Ledger",
      flow: "How it works",
    },
    exit: "Exit",
    shellFooter: "Hyperledger Besu IBFT 2.0 · permissioned consortium ledger",
    language: "Language",
    wallet: {
      connect: "Connect wallet",
      connecting: "Connecting...",
      none: "No wallet detected",
    },
    status: {
      none: { label: "Not found", blurb: "No prescription exists for this id." },
      issued: { label: "Issued", blurb: "Signed by the doctor and recorded on-chain. Ready to dispense." },
      partial: { label: "Partially dispensed", blurb: "Some units dispensed; more remain." },
      full: { label: "Fully dispensed", blurb: "All units dispensed. Refill if allowed." },
      expired: { label: "Expired", blurb: "Past its validity window. No longer dispensable." },
      revoked: { label: "Revoked", blurb: "Voided by the doctor or an admin." },
    },
    spine: {
      issued: "Issued",
      partially: "Partially",
      fullyDispensed: "Fully dispensed",
      lifecycleEnded: "{label} · lifecycle ended",
      dispensed: "Dispensed",
      units: "units",
      integrityAnchored: "Integrity anchored",
    },
    rx: {
      patient: "patient",
      units: "units",
      exp: "exp",
    },
  },
  id: {
    roles: {
      doctor: "Dokter",
      pharmacist: "Apoteker",
      patient: "Pasien",
      admin: "Administrator",
    },
    nav: {
      issue: "Terbitkan",
      dispense: "Serahkan",
      mine: "Resep Saya",
      actors: "Registri",
      ledger: "Buku Besar",
      flow: "Cara Kerja",
    },
    exit: "Keluar",
    shellFooter: "Hyperledger Besu IBFT 2.0 · ledger konsorsium berizin",
    language: "Bahasa",
    wallet: {
      connect: "Hubungkan dompet",
      connecting: "Menghubungkan...",
      none: "Dompet tidak terdeteksi",
    },
    status: {
      none: { label: "Tidak ditemukan", blurb: "Tidak ada resep untuk id ini." },
      issued: { label: "Diterbitkan", blurb: "Ditandatangani dokter dan tercatat on-chain. Siap diserahkan." },
      partial: { label: "Sebagian diserahkan", blurb: "Sebagian unit telah diserahkan; sisanya masih ada." },
      full: { label: "Selesai diserahkan", blurb: "Seluruh unit telah diserahkan. Isi ulang jika diizinkan." },
      expired: { label: "Kedaluwarsa", blurb: "Melewati masa berlaku. Tidak dapat diserahkan lagi." },
      revoked: { label: "Dicabut", blurb: "Dibatalkan oleh dokter atau admin." },
    },
    spine: {
      issued: "Diterbitkan",
      partially: "Sebagian",
      fullyDispensed: "Selesai diserahkan",
      lifecycleEnded: "{label} · siklus berakhir",
      dispensed: "Diserahkan",
      units: "unit",
      integrityAnchored: "Integritas terjangkar",
    },
    rx: {
      patient: "pasien",
      units: "unit",
      exp: "berlaku s/d",
    },
  },
} as const;
