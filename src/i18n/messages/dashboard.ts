// src/i18n/messages/dashboard.ts
export const dashboard = {
  en: {
    eyebrow: "Read model",
    title: "Prescription ledger",
    shellTitle: "Ledger",
    filters: {
      all: "All",
      issued: "Issued",
      partially: "Partially",
      fully: "Fully",
      expired: "Expired",
      revoked: "Revoked",
    },
    loading: "Loading...",
    toast: {
      loadError: "Could not load (is the read model running?).",
    },
    empty: {
      title: "No prescriptions indexed yet",
      hint: "Issue one from the doctor console, then the indexer will project it here.",
    },
  },
  id: {
    eyebrow: "Model baca",
    title: "Buku besar resep",
    shellTitle: "Buku Besar",
    filters: {
      all: "Semua",
      issued: "Diterbitkan",
      partially: "Sebagian",
      fully: "Selesai",
      expired: "Kedaluwarsa",
      revoked: "Dicabut",
    },
    loading: "Memuat...",
    toast: {
      loadError: "Tidak dapat memuat (apakah model baca sedang berjalan?).",
    },
    empty: {
      title: "Belum ada resep yang terindeks",
      hint: "Terbitkan satu dari konsol dokter, lalu pengindeks akan memproyeksikannya di sini.",
    },
  },
} as const;
