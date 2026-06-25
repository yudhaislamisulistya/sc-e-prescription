// src/i18n/messages/home.ts
// Filled in per-page. Shape: { en: {...}, id: {...} }.
export const home = {
  en: {
    meta: {
      description:
        "A redesigned smart-contract e-prescription system: doctor-signed, end-to-end encrypted, lifecycle-tracked prescriptions on a permissioned consortium blockchain.",
    },
    brand: {
      name: "e-Prescription",
      tagline: "Smart-contract redesign",
    },
    hero: {
      eyebrow: "Permissioned ledger · Besu IBFT 2.0",
      headlineLead: "Prescriptions you can ",
      headlineEmphasis: "prove",
      headlineTail: ".",
      subtext:
        "Every prescription is signed by its doctor, encrypted end-to-end, and tracked through a tamper-evident lifecycle, from issued to dispensed, on a consortium blockchain.",
      chooseRole: "Choose a role",
      howItWorks: "How it works",
    },
    stats: {
      weaknesses: "weaknesses mitigated",
      registries: "on-chain registries",
      pii: "PII on the ledger",
    },
    live: {
      eyebrow: "Prescription",
      caption:
        "Live example: the same lifecycle view every role sees, read straight from the chain.",
    },
    roles: {
      sectionEyebrow: "Enter the console",
      sectionHeading: "Choose your role",
      note: "Consoles are being rebuilt on the redesigned backend, enabled one role at a time.",
      doctor: "Issue & sign prescriptions",
      pharmacist: "Verify & dispense units",
      patient: "View & grant pharmacy access",
      admin: "Manage the on-chain registry",
    },
    how: {
      eyebrow: "From signature to dispense",
      heading: "How a prescription moves",
      steps: {
        issue: {
          title: "Issue",
          body: "The doctor signs the prescription (EIP-712). It is encrypted and pinned; only its hash and lifecycle live on-chain.",
        },
        grant: {
          title: "Grant",
          body: "Keys are wrapped per recipient. The patient's custodian re-wraps the key for the chosen pharmacy; no plaintext leaves the boundary.",
        },
        dispense: {
          title: "Dispense",
          body: "The pharmacist dispenses units. On-chain accounting makes double-dispensing impossible across the consortium.",
        },
        audit: {
          title: "Audit",
          body: "Every transition is an event, projected into a read model: a complete, tamper-evident trail.",
        },
      },
    },
    card: {
      soon: "soon",
    },
    footer: "Universitas Gadjah Mada · thesis prototype · YIS",
  },
  id: {
    meta: {
      description:
        "Sistem e-resep berbasis smart-contract yang dirancang ulang: resep yang ditandatangani dokter, terenkripsi end-to-end, dan terlacak siklus hidupnya pada blockchain konsorsium berizin.",
    },
    brand: {
      name: "e-Prescription",
      tagline: "Perancangan ulang smart-contract",
    },
    hero: {
      eyebrow: "Ledger berizin · Besu IBFT 2.0",
      headlineLead: "Resep yang dapat Anda ",
      headlineEmphasis: "buktikan",
      headlineTail: ".",
      subtext:
        "Setiap resep ditandatangani oleh dokternya, dienkripsi end-to-end, dan dilacak melalui siklus hidup yang anti-rusak, dari diterbitkan hingga diserahkan, pada blockchain konsorsium.",
      chooseRole: "Pilih peran",
      howItWorks: "Cara kerja",
    },
    stats: {
      weaknesses: "kelemahan dimitigasi",
      registries: "registri on-chain",
      pii: "PII pada ledger",
    },
    live: {
      eyebrow: "Resep",
      caption:
        "Contoh langsung: tampilan siklus hidup yang sama yang dilihat setiap peran, dibaca langsung dari chain.",
    },
    roles: {
      sectionEyebrow: "Masuk ke konsol",
      sectionHeading: "Pilih peran Anda",
      note: "Konsol sedang dibangun ulang pada backend yang dirancang ulang, diaktifkan satu peran setiap kali.",
      doctor: "Terbitkan & tanda tangani resep",
      pharmacist: "Verifikasi & serahkan unit",
      patient: "Lihat & beri akses apotek",
      admin: "Kelola registri on-chain",
    },
    how: {
      eyebrow: "Dari tanda tangan hingga penyerahan",
      heading: "Bagaimana resep bergerak",
      steps: {
        issue: {
          title: "Terbitkan",
          body: "Dokter menandatangani resep (EIP-712). Resep dienkripsi dan dipin; hanya hash dan siklus hidupnya yang berada on-chain.",
        },
        grant: {
          title: "Beri Akses",
          body: "Kunci dibungkus per penerima. Kustodian pasien membungkus ulang kunci untuk apotek yang dipilih; tidak ada teks asli yang keluar dari batas.",
        },
        dispense: {
          title: "Serahkan",
          body: "Apoteker menyerahkan unit. Pencatatan on-chain membuat penyerahan ganda mustahil di seluruh konsorsium.",
        },
        audit: {
          title: "Audit",
          body: "Setiap transisi adalah sebuah event, diproyeksikan ke dalam read model: jejak yang lengkap dan anti-rusak.",
        },
      },
    },
    card: {
      soon: "segera",
    },
    footer: "Universitas Gadjah Mada · prototipe tesis · YIS",
  },
} as const;
