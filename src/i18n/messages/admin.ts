// src/i18n/messages/admin.ts
// Filled in per-page. Shape: { en: {...}, id: {...} }.
export const admin = {
  en: {
    eyebrow: "Admin console",
    title: "Registry",
    roles: {
      patientCustodian: "Patient custodian",
    },
    actor: {
      eyebrow: "Register actor",
      fields: {
        address: { label: "Actor address" },
        role: { label: "Role" },
        licenseHash: { label: "License hash", hint: "bytes32" },
        institutionId: { label: "Institution id", hint: "bytes32" },
        pubkey: {
          label: "Encryption pubkey",
          hint: "Uncompressed secp256k1 (0x04...), used to wrap keys for this actor.",
        },
      },
      button: "Register actor",
    },
    patient: {
      eyebrow: "Register patient",
      fields: {
        ref: {
          label: "Patient ref",
          hint: "keccak256(salt, DID) - never the patient's identity.",
        },
        pubkey: {
          label: "Encryption pubkey",
          hint: "The patient's custodial public key.",
        },
        custodian: {
          label: "Custodian address",
          hint: "The KMS service EOA that re-wraps keys for this patient.",
        },
      },
      button: "Register patient",
    },
    buttons: {
      working: "Working...",
    },
    toast: {
      connectWallet: "Connect your admin wallet first.",
      notConfigured: "IDENTITY_REGISTRY address is not configured.",
      invalidActor: "Invalid actor address.",
      licenseBytes32: "License hash must be bytes32.",
      institutionBytes32: "Institution id must be bytes32.",
      pubkeyHex: "Encryption pubkey must be 0x hex.",
      actorRegistered: "Registered {role}.",
      actorFailed: "registerActor failed.",
      patientRefBytes32: "Patient ref must be bytes32.",
      invalidCustodian: "Invalid custodian address.",
      patientRegistered: "Patient registered.",
      patientFailed: "registerPatient failed.",
    },
  },
  id: {
    eyebrow: "Konsol admin",
    title: "Registri",
    roles: {
      patientCustodian: "Kustodian pasien",
    },
    actor: {
      eyebrow: "Daftarkan aktor",
      fields: {
        address: { label: "Alamat aktor" },
        role: { label: "Peran" },
        licenseHash: { label: "Hash lisensi", hint: "bytes32" },
        institutionId: { label: "Id institusi", hint: "bytes32" },
        pubkey: {
          label: "Kunci publik enkripsi",
          hint: "secp256k1 tak terkompresi (0x04...), digunakan untuk membungkus kunci bagi aktor ini.",
        },
      },
      button: "Daftarkan aktor",
    },
    patient: {
      eyebrow: "Daftarkan pasien",
      fields: {
        ref: {
          label: "Ref pasien",
          hint: "keccak256(salt, DID) - bukan identitas pasien.",
        },
        pubkey: {
          label: "Kunci publik enkripsi",
          hint: "Kunci publik kustodial milik pasien.",
        },
        custodian: {
          label: "Alamat kustodian",
          hint: "EOA layanan KMS yang membungkus ulang kunci bagi pasien ini.",
        },
      },
      button: "Daftarkan pasien",
    },
    buttons: {
      working: "Memproses...",
    },
    toast: {
      connectWallet: "Hubungkan dompet admin Anda terlebih dahulu.",
      notConfigured: "Alamat IDENTITY_REGISTRY belum dikonfigurasi.",
      invalidActor: "Alamat aktor tidak valid.",
      licenseBytes32: "Hash lisensi harus berupa bytes32.",
      institutionBytes32: "Id institusi harus berupa bytes32.",
      pubkeyHex: "Kunci publik enkripsi harus berupa hex 0x.",
      actorRegistered: "{role} terdaftar.",
      actorFailed: "registerActor gagal.",
      patientRefBytes32: "Ref pasien harus berupa bytes32.",
      invalidCustodian: "Alamat kustodian tidak valid.",
      patientRegistered: "Pasien terdaftar.",
      patientFailed: "registerPatient gagal.",
    },
  },
} as const;
