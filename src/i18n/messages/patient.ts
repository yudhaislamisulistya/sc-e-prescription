// src/i18n/messages/patient.ts
export const patient = {
  en: {
    eyebrow: "Patient portal",
    title: "My prescriptions",
    fields: {
      patientRef: {
        label: "Patient reference",
        hint: "Your on-chain ref (a salted hash - not your identity).",
      },
      pharmacyAddr: {
        label: "Pharmacy address",
      },
    },
    buttons: {
      load: "Load",
      loading: "Loading...",
      grant: "Grant access",
      granting: "Granting...",
    },
    selected: {
      eyebrow: "Selected",
    },
    grant: {
      eyebrow: "Grant pharmacy access",
      custodianNote:
        "Your custodian re-wraps the key for the pharmacy. The web app never sees your private key.",
    },
    empty: {
      none: "No prescriptions to show.",
      selectToGrant: "Select a prescription to grant access.",
    },
    toast: {
      invalidPatientRef: "Enter a valid patient ref (bytes32).",
      noneFound: "No prescriptions found for that ref yet.",
      loadFailed: "Could not load (is the read model running?).",
      invalidPharmacy: "Enter a valid pharmacy address.",
      grantSuccess: "Pharmacy access granted.",
      grantFailed: "Grant failed.",
    },
  },
  id: {
    eyebrow: "Portal pasien",
    title: "Resep saya",
    fields: {
      patientRef: {
        label: "Referensi pasien",
        hint: "Referensi on-chain Anda (hash bersalt - bukan identitas Anda).",
      },
      pharmacyAddr: {
        label: "Alamat apoteker",
      },
    },
    buttons: {
      load: "Muat",
      loading: "Memuat...",
      grant: "Berikan akses",
      granting: "Memberikan...",
    },
    selected: {
      eyebrow: "Dipilih",
    },
    grant: {
      eyebrow: "Berikan akses apoteker",
      custodianNote:
        "Kustodian Anda membungkus ulang kunci untuk apoteker. Aplikasi web tidak pernah melihat kunci privat Anda.",
    },
    empty: {
      none: "Tidak ada resep untuk ditampilkan.",
      selectToGrant: "Pilih sebuah resep untuk memberikan akses.",
    },
    toast: {
      invalidPatientRef: "Masukkan referensi pasien yang valid (bytes32).",
      noneFound: "Belum ada resep yang ditemukan untuk referensi tersebut.",
      loadFailed: "Tidak dapat memuat (apakah read model sedang berjalan?).",
      invalidPharmacy: "Masukkan alamat apoteker yang valid.",
      grantSuccess: "Akses apoteker berhasil diberikan.",
      grantFailed: "Pemberian akses gagal.",
    },
  },
} as const;
