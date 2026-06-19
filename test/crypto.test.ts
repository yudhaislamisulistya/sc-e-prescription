import { expect } from "chai";
import {
  generateCEK,
  encrypt,
  decrypt,
  packageToBytes,
  packageFromBytes,
} from "../lib/crypto/aes-gcm";
import { wrapCEK, unwrapCEK, addrToRecipientBytes32 } from "../lib/crypto/ecies";
import { derivePatientRef, generateSalt } from "../lib/crypto/patientRef";
import {
  EIP712_DOMAIN,
  PRESCRIPTION_TYPES,
  signPrescription,
  type PrescriptionTypedData,
} from "../lib/crypto/eip712";
import { PrivateKey } from "eciesjs";
import {
  createWalletClient,
  http,
  verifyTypedData,
  recoverTypedDataAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

describe("crypto", function () {
  describe("AES-256-GCM", function () {
    it("encrypts and decrypts correctly (round-trip)", () => {
      const cek = generateCEK();
      const data = Buffer.from("Hello, E-Prescription!", "utf8");
      const pkg = encrypt(cek, data);
      const decrypted = decrypt(cek, pkg);
      expect(decrypted.toString("utf8")).to.equal("Hello, E-Prescription!");
    });

    it("round-trips through packageToBytes/packageFromBytes", () => {
      const cek = generateCEK();
      const data = Buffer.from("canonical prescription JSON", "utf8");
      const pkg = encrypt(cek, data);
      const bytes = packageToBytes(pkg);
      const restored = packageFromBytes(bytes);
      expect(decrypt(cek, restored).toString("utf8")).to.equal(
        "canonical prescription JSON"
      );
    });

    it("tampered authTag causes decryption to throw", () => {
      const cek = generateCEK();
      const pkg = encrypt(cek, Buffer.from("secret"));
      pkg.authTag = Buffer.from("baadbaad".repeat(4), "hex").toString("base64");
      expect(() => decrypt(cek, pkg)).to.throw();
    });

    it("rejects a truncated (weak) authTag before deciphering", () => {
      // Finding 3: Node's aes-256-gcm decipher would otherwise ACCEPT a 4-byte
      // tag, dropping forgery resistance from 2^128 to 2^32. The real 16-byte
      // tag is truncated to its first 4 bytes here.
      const cek = generateCEK();
      const pkg = encrypt(cek, Buffer.from("secret"));
      const fullTag = Buffer.from(pkg.authTag, "base64");
      pkg.authTag = fullTag.subarray(0, 4).toString("base64");
      expect(() => decrypt(cek, pkg)).to.throw(/authTag length/);
    });

    it("rejects an iv that is not 12 bytes", () => {
      const cek = generateCEK();
      const pkg = encrypt(cek, Buffer.from("secret"));
      pkg.iv = Buffer.alloc(16).toString("base64");
      expect(() => decrypt(cek, pkg)).to.throw(/iv length/);
    });

    it("rejects an unsupported / mismatched alg before deciphering", () => {
      // Finding 4: the envelope must not silently downgrade. A package that
      // advertises a different algorithm must be refused even though decrypt
      // only knows how to run AES-256-GCM.
      const cek = generateCEK();
      const pkg = encrypt(cek, Buffer.from("secret"));
      const forged = { ...pkg, alg: "AES-128-GCM" as unknown as "AES-256-GCM" };
      expect(() => decrypt(cek, forged)).to.throw(/unsupported alg/);
    });
  });

  describe("ECIES key-wrap", function () {
    it("wraps and unwraps a CEK (round-trip)", () => {
      const sk = new PrivateKey();
      const privHex = sk.toHex();
      const pubHex = sk.publicKey.toHex();

      const cek = generateCEK();
      const wrapped = wrapCEK(pubHex, cek);
      const unwrapped = unwrapCEK(privHex, wrapped);

      expect(unwrapped.equals(cek)).to.be.true;
    });

    it("wrong private key cannot unwrap", () => {
      const sk = new PrivateKey();
      const other = new PrivateKey();
      const cek = generateCEK();
      const wrapped = wrapCEK(sk.publicKey.toHex(), cek);
      expect(() => unwrapCEK(other.toHex(), wrapped)).to.throw();
    });

    it("addrToRecipientBytes32 matches bytes32(uint256(uint160(addr)))", () => {
      // Finding 2: this encoding must match KeyAccessRegistry's
      // bytes32(uint256(uint160(addr))) layout — the address occupies the low
      // 160 bits, left-padded with zero bytes to 32 bytes. Locks padding side,
      // length and lower-casing against silent regression.
      const addr = "0xAbC0000000000000000000000000000000000123";
      expect(addrToRecipientBytes32(addr)).to.equal(
        "0x000000000000000000000000abc0000000000000000000000000000000000123"
      );

      // All-zero address => all-zero bytes32.
      expect(addrToRecipientBytes32("0x0000000000000000000000000000000000000000")).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

      // Output is always a 32-byte (64 hex char) value with the address in the
      // low 160 bits (high 96 bits / 24 hex chars are zero).
      const out = addrToRecipientBytes32("0xffffffffffffffffffffffffffffffffffffffff");
      expect(out).to.match(/^0x[0-9a-f]{64}$/);
      expect(out.slice(2, 26)).to.equal("0".repeat(24));
      expect(out.slice(26)).to.equal("f".repeat(40));
    });
  });

  describe("derivePatientRef", function () {
    it("is deterministic: same salt + did => same ref", () => {
      const salt = generateSalt();
      const did = "did:example:patient:123";
      const a = derivePatientRef(salt, did);
      const b = derivePatientRef(salt, did);
      expect(a).to.equal(b);
    });

    it("different salt => different ref", () => {
      const did = "did:example:patient:123";
      const refA = derivePatientRef(generateSalt(), did);
      const refB = derivePatientRef(generateSalt(), did);
      expect(refA).to.not.equal(refB);
    });

    it("returns a 32-byte hex string", () => {
      const ref = derivePatientRef(generateSalt(), "did:example:abc");
      expect(ref).to.match(/^0x[0-9a-f]{64}$/);
    });
  });

  describe("EIP-712 prescription signing", function () {
    // Fixed, well-known test private key (hardhat account #0). Its address is
    // deterministic, so the recovered/verifying address is a stable oracle.
    const PRIV_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
    const EXPECTED_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
    const VERIFYING_CONTRACT =
      "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

    // A fixed Prescription message. If anyone reorders the 8 fields or changes a
    // type in PRESCRIPTION_TYPES, the EIP-712 struct hash changes and the
    // signature produced here will no longer recover to EXPECTED_ADDR — the
    // verification assertions below fail loudly.
    const message: PrescriptionTypedData = {
      prescriptionId:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      doctor: EXPECTED_ADDR,
      patientRef:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      payloadHash:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
      issuedAt: 1_700_000_000n,
      expiresAt: 1_700_086_400n,
      totalUnits: 30,
      refillsAllowed: 2,
    };

    function makeWalletClient() {
      const account = privateKeyToAccount(PRIV_KEY);
      // No real transport calls are made; signTypedData is computed locally.
      return createWalletClient({
        account,
        transport: http("http://127.0.0.1:8545"),
      });
    }

    it("exposes the exact spec'd domain and Prescription field order/types", () => {
      // Pins the single most spec-drift-prone deliverable: the typed-data
      // definition itself.
      expect(EIP712_DOMAIN).to.deep.equal({
        name: "EPrescription",
        version: "1",
        chainId: 1337,
      });
      expect(PRESCRIPTION_TYPES.Prescription).to.deep.equal([
        { name: "prescriptionId", type: "bytes32" },
        { name: "doctor", type: "address" },
        { name: "patientRef", type: "bytes32" },
        { name: "payloadHash", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "totalUnits", type: "uint32" },
        { name: "refillsAllowed", type: "uint8" },
      ]);
    });

    it("signature verifies against the signer (verifyTypedData)", async () => {
      const walletClient = makeWalletClient();
      const signature = await signPrescription(
        walletClient,
        VERIFYING_CONTRACT,
        message
      );
      const valid = await verifyTypedData({
        address: EXPECTED_ADDR,
        domain: { ...EIP712_DOMAIN, verifyingContract: VERIFYING_CONTRACT },
        types: PRESCRIPTION_TYPES,
        primaryType: "Prescription",
        message,
        signature,
      });
      expect(valid).to.be.true;
    });

    it("recovers the exact signing address (recoverTypedDataAddress)", async () => {
      const walletClient = makeWalletClient();
      const signature = await signPrescription(
        walletClient,
        VERIFYING_CONTRACT,
        message
      );
      const recovered = await recoverTypedDataAddress({
        domain: { ...EIP712_DOMAIN, verifyingContract: VERIFYING_CONTRACT },
        types: PRESCRIPTION_TYPES,
        primaryType: "Prescription",
        message,
        signature,
      });
      expect(recovered.toLowerCase()).to.equal(EXPECTED_ADDR.toLowerCase());
    });

    it("a different verifyingContract domain does not verify (domain binding)", async () => {
      const walletClient = makeWalletClient();
      const signature = await signPrescription(
        walletClient,
        VERIFYING_CONTRACT,
        message
      );
      const valid = await verifyTypedData({
        address: EXPECTED_ADDR,
        domain: {
          ...EIP712_DOMAIN,
          verifyingContract:
            "0x0000000000000000000000000000000000000000" as const,
        },
        types: PRESCRIPTION_TYPES,
        primaryType: "Prescription",
        message,
        signature,
      });
      expect(valid).to.be.false;
    });
  });
});
