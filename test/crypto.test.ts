import { expect } from "chai";
import {
  generateCEK,
  encrypt,
  decrypt,
  packageToBytes,
  packageFromBytes,
} from "../lib/crypto/aes-gcm";
import { wrapCEK, unwrapCEK } from "../lib/crypto/ecies";
import { derivePatientRef, generateSalt } from "../lib/crypto/patientRef";
import { PrivateKey } from "eciesjs";

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
});
