// src/i18n/messages/flow.ts
// "How it works / Flow" page — explains the end-to-end system flow.
// Shape: { en: {...}, id: {...} } with identical nested keys.
export const flow = {
  en: {
    meta: {
      title: "How it works · e-Prescription",
      description:
        "An end-to-end walkthrough of the e-prescription consortium: how a prescription is issued, granted, dispensed and audited without exposing patient data.",
    },
    header: {
      brand: "e-Prescription",
    },
    hero: {
      eyebrow: "How it works",
      title: "One prescription, from signature to audit trail",
      intro:
        "Every prescription moves through four phases on a permissioned consortium ledger. Sensitive clinical data is encrypted off-chain; only integrity anchors and lifecycle state are written on-chain — so the network can prove what happened without ever seeing the contents.",
    },
    lifecycle: {
      eyebrow: "Lifecycle",
      heading: "The four phases of a prescription",
      steps: {
        issue: {
          title: "Issue",
          body: "The doctor fills out the prescription and signs it with an EIP-712 typed message. The payload is encrypted with AES-256-GCM and pinned to IPFS; only the payload hash, the CID and the lifecycle state are written on-chain.",
        },
        grant: {
          title: "Grant",
          body: "Content keys are wrapped per recipient with ECIES. The patient's custodian (KMS) re-wraps the content key for the chosen pharmacy. No plaintext ever leaves the boundary — only sealed envelopes move between parties.",
        },
        dispense: {
          title: "Dispense",
          body: "The pharmacist looks the prescription up and dispenses units. On-chain accounting makes double-dispensing impossible across the consortium, and refills are bounded by the limits the doctor set at issue time.",
        },
        audit: {
          title: "Audit",
          body: "Every transition emits an event. An indexer projects those events into a read-model ledger, producing a complete, tamper-evident trail of who did what and when — verifiable by any consortium member.",
        },
      },
    },
    architecture: {
      eyebrow: "Architecture",
      heading: "Three registries, one consortium",
      cards: {
        identity: {
          title: "IdentityRegistry",
          body: "RBAC roles for every participant: doctor, pharmacist, patient custodian and admin. It decides who may issue, grant, dispense or revoke.",
        },
        prescription: {
          title: "PrescriptionRegistry",
          body: "The lifecycle state machine. It enforces valid transitions and the anti-double-dispensing accounting that keeps unit counts honest across the whole network.",
        },
        keyAccess: {
          title: "KeyAccessRegistry",
          body: "Envelope-key distribution. It records which sealed content keys have been granted to which recipients, so authorised parties — and only them — can decrypt the payload.",
        },
      },
      notes: {
        consortium:
          "Runs on a Hyperledger Besu IBFT 2.0 permissioned consortium — known, vetted validators rather than an open network.",
        pii:
          "Zero PII on-chain: patients are referenced as patientRef = keccak256(salt, DID), never by name or identifier.",
        encryption:
          "End-to-end encryption: clinical content is sealed before it leaves the issuer and only opened by authorised recipients.",
        storage:
          "Off-chain IPFS storage holds the encrypted payload; the chain holds only its hash and CID as integrity anchors.",
      },
    },
    roles: {
      eyebrow: "Roles",
      heading: "Who does what",
      open: "Open console",
      items: {
        doctor: {
          line: "Issues and signs prescriptions, sets refill limits, and can revoke when needed.",
        },
        pharmacist: {
          line: "Verifies a prescription and dispenses units, with double-dispensing blocked on-chain.",
        },
        patient: {
          line: "Holds the custody key, chooses the pharmacy, and grants decryption access to it.",
        },
        admin: {
          line: "Manages RBAC roles and consortium membership in the IdentityRegistry.",
        },
      },
    },
  },
  id: {
    meta: {
      title: "Cara Kerja · e-Prescription",
      description:
        "Panduan menyeluruh tentang konsorsium e-resep: bagaimana resep diterbitkan, diberi akses, diserahkan, dan diaudit tanpa membuka data pasien.",
    },
    header: {
      brand: "e-Prescription",
    },
    hero: {
      eyebrow: "Cara kerja",
      title: "Satu resep, dari tanda tangan hingga jejak audit",
      intro:
        "Setiap resep melewati empat fase pada ledger konsorsium berizin. Data klinis sensitif dienkripsi off-chain; hanya jangkar integritas dan status siklus yang ditulis on-chain — sehingga jaringan dapat membuktikan apa yang terjadi tanpa pernah melihat isinya.",
    },
    lifecycle: {
      eyebrow: "Siklus hidup",
      heading: "Empat fase sebuah resep",
      steps: {
        issue: {
          title: "Terbitkan",
          body: "Dokter mengisi resep dan menandatanganinya dengan pesan berjenis EIP-712. Payload dienkripsi dengan AES-256-GCM dan dipin ke IPFS; hanya hash payload, CID, dan status siklus yang ditulis on-chain.",
        },
        grant: {
          title: "Beri Akses",
          body: "Kunci konten dibungkus per penerima dengan ECIES. Kustodian pasien (KMS) membungkus ulang kunci konten untuk apotek yang dipilih. Tidak ada teks asli yang pernah meninggalkan batas — hanya amplop tersegel yang berpindah antarpihak.",
        },
        dispense: {
          title: "Serahkan",
          body: "Apoteker mencari resep dan menyerahkan unit obat. Pencatatan on-chain membuat penyerahan ganda mustahil di seluruh konsorsium, dan isi ulang dibatasi sesuai ketentuan yang ditetapkan dokter saat penerbitan.",
        },
        audit: {
          title: "Audit",
          body: "Setiap transisi memancarkan sebuah event. Indexer memproyeksikan event tersebut ke ledger read-model, menghasilkan jejak yang lengkap dan tahan-pemalsuan tentang siapa melakukan apa dan kapan — dapat diverifikasi oleh setiap anggota konsorsium.",
        },
      },
    },
    architecture: {
      eyebrow: "Arsitektur",
      heading: "Tiga registri, satu konsorsium",
      cards: {
        identity: {
          title: "IdentityRegistry",
          body: "Peran RBAC untuk setiap peserta: dokter, apoteker, kustodian pasien, dan admin. Registri ini menentukan siapa yang boleh menerbitkan, memberi akses, menyerahkan, atau mencabut.",
        },
        prescription: {
          title: "PrescriptionRegistry",
          body: "Mesin status siklus hidup. Registri ini menegakkan transisi yang sah serta pencatatan anti-penyerahan-ganda yang menjaga jumlah unit tetap akurat di seluruh jaringan.",
        },
        keyAccess: {
          title: "KeyAccessRegistry",
          body: "Distribusi kunci amplop. Registri ini mencatat kunci konten tersegel mana yang telah diberikan kepada penerima mana, sehingga hanya pihak berwenang yang dapat mendekripsi payload.",
        },
      },
      notes: {
        consortium:
          "Berjalan di konsorsium berizin Hyperledger Besu IBFT 2.0 — validator yang dikenal dan tersaring, bukan jaringan terbuka.",
        pii:
          "Nihil PII on-chain: pasien dirujuk sebagai patientRef = keccak256(salt, DID), tidak pernah dengan nama atau identitas.",
        encryption:
          "Enkripsi ujung-ke-ujung: konten klinis disegel sebelum meninggalkan penerbit dan hanya dibuka oleh penerima yang berwenang.",
        storage:
          "Penyimpanan IPFS off-chain menampung payload terenkripsi; rantai hanya menyimpan hash dan CID-nya sebagai jangkar integritas.",
      },
    },
    roles: {
      eyebrow: "Peran",
      heading: "Siapa mengerjakan apa",
      open: "Buka konsol",
      items: {
        doctor: {
          line: "Menerbitkan dan menandatangani resep, menetapkan batas isi ulang, dan dapat mencabut bila diperlukan.",
        },
        pharmacist: {
          line: "Memverifikasi resep dan menyerahkan unit obat, dengan penyerahan ganda diblokir on-chain.",
        },
        patient: {
          line: "Memegang kunci kustodi, memilih apotek, dan memberikan akses dekripsi kepadanya.",
        },
        admin: {
          line: "Mengelola peran RBAC dan keanggotaan konsorsium di IdentityRegistry.",
        },
      },
    },
  },
} as const;
