// src/pages/admin/index.tsx
//
// Admin registry console - onboard actors (doctor / pharmacist / patient
// custodian) and patients into the IdentityRegistry (RBAC, mitigates V3). Only
// an ADMIN_ROLE account can submit these; the writes are signed by the connected
// wallet. Patients are registered by their ref (a salted hash) - zero PII.
import { useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useWallet } from "@/components/wallet/useWallet";
import { ADDR, besuChain, publicClient, IDENTITY_REGISTRY_ABI, ROLE_NAMES, roleHash } from "@/lib/eth";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

const selectClass =
  "w-full h-10 rounded-lg border border-line-strong bg-card px-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20";

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function AdminConsole() {
  const { address, connect, connecting, available, walletClient } = useWallet();
  const configured = !!ADDR.identity;

  // register actor
  const [actorAddr, setActorAddr] = useState("");
  const [role, setRole] = useState<keyof typeof ROLE_NAMES>("DOCTOR_ROLE");
  const [licenseHash, setLicenseHash] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [actorPubKey, setActorPubKey] = useState("");
  const [busyActor, setBusyActor] = useState(false);

  // register patient
  const [patientRef, setPatientRef] = useState("");
  const [patientPubKey, setPatientPubKey] = useState("");
  const [custodian, setCustodian] = useState("");
  const [busyPatient, setBusyPatient] = useState(false);

  function guard(): boolean {
    if (!address) {
      toast.warning("Connect your admin wallet first.");
      return false;
    }
    if (!configured) {
      toast.error("IDENTITY_REGISTRY address is not configured.");
      return false;
    }
    return true;
  }

  async function registerActor() {
    if (!guard()) return;
    if (!ADDR_RE.test(actorAddr)) return toast.warning("Invalid actor address.");
    if (!BYTES32_RE.test(licenseHash)) return toast.warning("License hash must be bytes32.");
    if (!BYTES32_RE.test(institutionId)) return toast.warning("Institution id must be bytes32.");
    if (!HEX_RE.test(actorPubKey) || actorPubKey.length < 4) return toast.warning("Encryption pubkey must be 0x hex.");
    setBusyActor(true);
    try {
      const hash = await walletClient().writeContract({
        address: ADDR.identity!,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "registerActor",
        args: [
          actorAddr as `0x${string}`,
          roleHash(ROLE_NAMES[role]),
          licenseHash as `0x${string}`,
          institutionId as `0x${string}`,
          actorPubKey as `0x${string}`,
        ],
        account: address!,
        chain: besuChain,
      });
      await publicClient().waitForTransactionReceipt({ hash });
      toast.success(`Registered ${role.replace("_ROLE", "").toLowerCase()}.`);
      setActorAddr("");
    } catch (err) {
      toast.error((err as Error).message || "registerActor failed.");
    } finally {
      setBusyActor(false);
    }
  }

  async function registerPatient() {
    if (!guard()) return;
    if (!BYTES32_RE.test(patientRef)) return toast.warning("Patient ref must be bytes32.");
    if (!HEX_RE.test(patientPubKey) || patientPubKey.length < 4) return toast.warning("Encryption pubkey must be 0x hex.");
    if (!ADDR_RE.test(custodian)) return toast.warning("Invalid custodian address.");
    setBusyPatient(true);
    try {
      const hash = await walletClient().writeContract({
        address: ADDR.identity!,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "registerPatient",
        args: [patientRef as `0x${string}`, patientPubKey as `0x${string}`, custodian as `0x${string}`],
        account: address!,
        chain: besuChain,
      });
      await publicClient().waitForTransactionReceipt({ hash });
      toast.success("Patient registered.");
      setPatientRef("");
    } catch (err) {
      toast.error((err as Error).message || "registerPatient failed.");
    } finally {
      setBusyPatient(false);
    }
  }

  return (
    <AppShell role="admin" active="actors" title="Registry" identity={address ? shortAddr(address) : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-1">Admin console</p>
          <h1 className="text-2xl font-semibold tracking-tight">Registry</h1>
        </div>
        {!address &&
          (available ? (
            <Button onClick={connect} disabled={connecting}>
              {connecting ? "Connecting..." : "Connect wallet"}
            </Button>
          ) : (
            <span className="text-sm text-muted">No wallet detected</span>
          ))}
      </div>

      {!configured && (
        <Card className="p-4 mb-6 border-st-partial/30 bg-st-partial/5">
          <p className="text-sm text-ink">
            <span className="font-medium">Contract not configured.</span> Set{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS</code> after deploying the stack.
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* register actor */}
        <Card className="p-6">
          <p className="eyebrow mb-4">Register actor</p>
          <div className="space-y-4">
            <Field label="Actor address">
              <Input placeholder="0x..." value={actorAddr} onChange={(e) => setActorAddr(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label="Role">
              <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as keyof typeof ROLE_NAMES)}>
                <option value="DOCTOR_ROLE">Doctor</option>
                <option value="PHARMACIST_ROLE">Pharmacist</option>
                <option value="PATIENT_CUSTODIAN_ROLE">Patient custodian</option>
              </select>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="License hash" hint="bytes32">
                <Input placeholder="0x..." value={licenseHash} onChange={(e) => setLicenseHash(e.target.value.trim())} className="font-mono" />
              </Field>
              <Field label="Institution id" hint="bytes32">
                <Input placeholder="0x..." value={institutionId} onChange={(e) => setInstitutionId(e.target.value.trim())} className="font-mono" />
              </Field>
            </div>
            <Field label="Encryption pubkey" hint="Uncompressed secp256k1 (0x04...), used to wrap keys for this actor.">
              <Input placeholder="0x04..." value={actorPubKey} onChange={(e) => setActorPubKey(e.target.value.trim())} className="font-mono" />
            </Field>
            <Button onClick={registerActor} disabled={busyActor}>
              {busyActor ? "Working..." : "Register actor"}
            </Button>
          </div>
        </Card>

        {/* register patient */}
        <Card className="p-6">
          <p className="eyebrow mb-4">Register patient</p>
          <div className="space-y-4">
            <Field label="Patient ref" hint="keccak256(salt, DID) - never the patient's identity.">
              <Input placeholder="0x..." value={patientRef} onChange={(e) => setPatientRef(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label="Encryption pubkey" hint="The patient's custodial public key.">
              <Input placeholder="0x04..." value={patientPubKey} onChange={(e) => setPatientPubKey(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label="Custodian address" hint="The KMS service EOA that re-wraps keys for this patient.">
              <Input placeholder="0x..." value={custodian} onChange={(e) => setCustodian(e.target.value.trim())} className="font-mono" />
            </Field>
            <Button onClick={registerPatient} disabled={busyPatient}>
              {busyPatient ? "Working..." : "Register patient"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
