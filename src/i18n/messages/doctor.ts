// src/i18n/messages/doctor.ts
// Doctor console: issue a prescription end to end.
export const doctor = {
  en: {
    eyebrow: "Doctor console",
    title: "Issue a prescription",
    shellTitle: "Issue prescription",
    fields: {
      patientRef: {
        label: "Patient reference",
        hint: "The patient's on-chain ref (keccak256 of salt + DID) - never their identity.",
      },
      medication: {
        label: "Medication",
        placeholder: "e.g. Amlodipine 5 mg",
      },
      totalUnits: {
        label: "Total units",
        hint: "Dispensable quantity.",
      },
      instructions: {
        label: "Instructions",
        hint: "Encrypted with the prescription - never stored in plaintext.",
        placeholder: "e.g. One tablet daily, after breakfast.",
      },
      refills: {
        label: "Refills allowed",
      },
      validUntil: {
        label: "Valid until",
      },
    },
    formError: {
      patientRef: "Patient ref must be a 0x bytes32 value.",
      totalUnits: "Total units must be greater than zero.",
    },
    toast: {
      connectFirst: "Connect your wallet first.",
      notConfigured: "Contract addresses are not configured.",
      invalidPatientRef: "Enter a valid patient ref (bytes32).",
      medRequired: "Add at least the medication name.",
      expiryFuture: "Expiry must be in the future.",
      success: "Prescription issued and anchored on-chain.",
      failed: "Failed to issue prescription.",
    },
    steps: {
      prepare: "Prepare",
      sign: "Sign",
      submit: "Submit",
      issueOnChain: "Issue on-chain",
      grantAccess: "Grant access",
      done: "Done",
    },
    buttons: {
      issue: "Sign & issue prescription",
      working: "Working...",
    },
    stepWorking: "{step}...",
    side: {
      eyebrow: "What happens on submit",
      note:
        "The signature commits to the encrypted content's hash. Only the hash, CID, and lifecycle live on-chain - the prescription body stays encrypted off-chain.",
    },
    issued: {
      eyebrow: "Issued",
    },
  },
  id: {
    eyebrow: "Konsol dokter",
    title: "Terbitkan resep",
    shellTitle: "Terbitkan resep",
    fields: {
      patientRef: {
        label: "Referensi pasien",
        hint: "Ref on-chain pasien (keccak256 dari salt + DID) - bukan identitasnya.",
      },
      medication: {
        label: "Obat",
        placeholder: "mis. Amlodipine 5 mg",
      },
      totalUnits: {
        label: "Total unit",
        hint: "Jumlah yang dapat diserahkan.",
      },
      instructions: {
        label: "Instruksi",
        hint: "Dienkripsi bersama resep - tidak pernah disimpan dalam teks biasa.",
        placeholder: "mis. Satu tablet sehari, sesudah sarapan.",
      },
      refills: {
        label: "Isi ulang yang diizinkan",
      },
      validUntil: {
        label: "Berlaku sampai",
      },
    },
    formError: {
      patientRef: "Ref pasien harus berupa nilai bytes32 0x.",
      totalUnits: "Total unit harus lebih besar dari nol.",
    },
    toast: {
      connectFirst: "Hubungkan dompet Anda terlebih dahulu.",
      notConfigured: "Alamat kontrak belum dikonfigurasi.",
      invalidPatientRef: "Masukkan ref pasien yang valid (bytes32).",
      medRequired: "Tambahkan setidaknya nama obat.",
      expiryFuture: "Masa berlaku harus di masa mendatang.",
      success: "Resep diterbitkan dan terjangkar on-chain.",
      failed: "Gagal menerbitkan resep.",
    },
    steps: {
      prepare: "Siapkan",
      sign: "Tanda tangan",
      submit: "Kirim",
      issueOnChain: "Terbitkan on-chain",
      grantAccess: "Beri akses",
      done: "Selesai",
    },
    buttons: {
      issue: "Tanda tangani & terbitkan resep",
      working: "Memproses...",
    },
    stepWorking: "{step}...",
    side: {
      eyebrow: "Yang terjadi saat dikirim",
      note:
        "Tanda tangan mengikat hash dari konten terenkripsi. Hanya hash, CID, dan siklus hidup yang tersimpan on-chain - isi resep tetap terenkripsi off-chain.",
    },
    issued: {
      eyebrow: "Diterbitkan",
    },
  },
} as const;
