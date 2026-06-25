// src/pages/doctor/index.tsx
//
// Doctor console - issue a prescription end to end on the redesigned backend:
//   1. /api/prescriptions/prepare  -> canonical payload + EIP-712 typed data + CEK
//   2. wallet.signTypedData         -> the doctor's non-repudiable signature
//   3. /api/prescriptions/submit    -> encrypt + pin to IPFS, wrap CEK for patient
//   4. PrescriptionRegistry.issuePrescription  (on-chain, signed by the doctor)
//   5. KeyAccessRegistry.grantAccess           (give the patient their wrapped key)
//
// No plaintext or PII ever leaves the doctor's client except inside the
// end-to-end-encrypted package. The page degrades gracefully when no wallet is
// connected or the contract addresses are not configured.
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useT } from "@/i18n/I18nProvider";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleSpine } from "@/components/ui/LifecycleSpine";
import { useWallet } from "@/components/wallet/useWallet";
import {
  ADDR,
  besuChain,
  publicClient,
  PRESCRIPTION_REGISTRY_ABI,
  KEY_ACCESS_REGISTRY_ABI,
} from "@/lib/eth";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

// Step identifiers (stable keys); the user-visible label is t("doctor.steps.<key>").
const STEPS = ["prepare", "sign", "submit", "issueOnChain", "grantAccess", "done"] as const;
type Step = (typeof STEPS)[number] | null;

interface IssuedResult {
  prescriptionId: `0x${string}`;
  totalUnits: number;
  cid: string;
  payloadHash: `0x${string}`;
}

function defaultExpiry(): string {
  // 30 days out, formatted for <input type="datetime-local">.
  const d = new Date(Date.now() + 30 * 86400 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function DoctorConsole() {
  const t = useT();
  const { address, connect, connecting, available, walletClient } = useWallet();

  const [patientRef, setPatientRef] = useState("");
  const [medName, setMedName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [totalUnits, setTotalUnits] = useState("30");
  const [refills, setRefills] = useState("0");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);

  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IssuedResult | null>(null);

  const configured = !!ADDR.prescription && !!ADDR.keyAccess;
  const canSubmit = !!address && configured && !busy;

  const formError = useMemo(() => {
    if (patientRef && !BYTES32_RE.test(patientRef)) return t("doctor.formError.patientRef");
    if (Number(totalUnits) <= 0) return t("doctor.formError.totalUnits");
    return null;
  }, [patientRef, totalUnits, t]);

  async function handleIssue() {
    if (!address) return toast.warning("Connect your wallet first.");
    if (!configured) return toast.error("Contract addresses are not configured.");
    if (!BYTES32_RE.test(patientRef)) return toast.warning("Enter a valid patient ref (bytes32).");
    if (!medName.trim()) return toast.warning("Add at least the medication name.");
    const units = Number(totalUnits);
    const refillsN = Number(refills);
    const expiryUnix = Math.floor(new Date(expiresAt).getTime() / 1000);
    if (!Number.isFinite(expiryUnix) || expiryUnix <= Math.floor(Date.now() / 1000)) {
      return toast.warning("Expiry must be in the future.");
    }

    setBusy(true);
    setResult(null);
    try {
      // 1. prepare
      setStep("Prepare");
      const prepRes = await fetch("/api/prescriptions/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorAddress: address,
          patientRef,
          medications: [{ name: medName.trim(), instructions: instructions.trim() }],
          expiresAt: expiryUnix,
          totalUnits: units,
          refillsAllowed: refillsN,
        }),
      });
      const prep = await prepRes.json();
      if (!prepRes.ok) throw new Error(prep.error || "prepare failed");

      // 2. sign EIP-712 (uint64 fields as BigInt so the message matches submit's)
      setStep("Sign");
      const m = prep.eip712.message;
      const signature = await walletClient().signTypedData({
        account: address,
        domain: prep.eip712.domain,
        types: prep.eip712.types,
        primaryType: "Prescription",
        message: {
          prescriptionId: m.prescriptionId,
          doctor: m.doctor,
          patientRef: m.patientRef,
          payloadHash: m.payloadHash,
          issuedAt: BigInt(m.issuedAt),
          expiresAt: BigInt(m.expiresAt),
          totalUnits: m.totalUnits,
          refillsAllowed: m.refillsAllowed,
        },
      });

      // 3. submit (encrypt + pin + wrap CEK for the patient)
      setStep("Submit");
      const subRes = await fetch("/api/prescriptions/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prescriptionId: prep.prescriptionId,
          patientRef,
          canonicalPayload: prep.canonicalPayload,
          encryptedPackage: prep.encryptedPackage,
          cek: prep.cek,
          eip712Signature: signature,
        }),
      });
      const sub = await subRes.json();
      if (!subRes.ok) throw new Error(sub.error || "submit failed");

      const wallet = walletClient();
      const pub = publicClient();

      // 4. issuePrescription on-chain
      setStep("Issue on-chain");
      const issueHash = await wallet.writeContract({
        address: ADDR.prescription!,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "issuePrescription",
        args: [prep.prescriptionId, patientRef as `0x${string}`, sub.cid, sub.payloadHash, BigInt(expiryUnix), units, refillsN],
        account: address,
        chain: besuChain,
      });
      await pub.waitForTransactionReceipt({ hash: issueHash });

      // 5. grantAccess (patient gets their wrapped key)
      setStep("Grant access");
      const grantHash = await wallet.writeContract({
        address: ADDR.keyAccess!,
        abi: KEY_ACCESS_REGISTRY_ABI,
        functionName: "grantAccess",
        args: [prep.prescriptionId, patientRef as `0x${string}`, sub.wrappedForPatient],
        account: address,
        chain: besuChain,
      });
      await pub.waitForTransactionReceipt({ hash: grantHash });

      setStep("Done");
      setResult({ prescriptionId: prep.prescriptionId, totalUnits: units, cid: sub.cid, payloadHash: sub.payloadHash });
      toast.success("Prescription issued and anchored on-chain.");
    } catch (err) {
      toast.error((err as Error).message || "Failed to issue prescription.");
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell role="doctor" active="issue" title="Issue prescription" identity={address ? shortAddr(address) : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-1">Doctor console</p>
          <h1 className="text-2xl font-semibold tracking-tight">Issue a prescription</h1>
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
            <span className="font-medium">Contracts not configured.</span> Set{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS</code> and{" "}
            <code className="font-mono text-xs">NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS</code> after deploying the stack.
            The form below stays usable for review; on-chain steps are disabled.
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        {/* form */}
        <Card className="lg:col-span-7 p-6">
          <div className="space-y-4">
            <Field
              label="Patient reference"
              hint="The patient's on-chain ref (keccak256 of salt + DID) - never their identity."
            >
              <Input
                placeholder="0x..."
                value={patientRef}
                onChange={(e) => setPatientRef(e.target.value.trim())}
                className="font-mono"
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Medication">
                <Input placeholder="e.g. Amlodipine 5 mg" value={medName} onChange={(e) => setMedName(e.target.value)} />
              </Field>
              <Field label="Total units" hint="Dispensable quantity.">
                <Input type="number" min={1} value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} />
              </Field>
            </div>

            <Field label="Instructions" hint="Encrypted with the prescription - never stored in plaintext.">
              <Textarea
                placeholder="e.g. One tablet daily, after breakfast."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Refills allowed">
                <Input type="number" min={0} value={refills} onChange={(e) => setRefills(e.target.value)} />
              </Field>
              <Field label="Valid until">
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </div>

            {formError && <p className="text-sm text-st-revoked">{formError}</p>}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleIssue} disabled={!canSubmit || !!formError}>
                {busy ? "Working..." : "Sign & issue prescription"}
              </Button>
              {busy && step && <span className="font-mono text-xs text-muted">{step}...</span>}
            </div>
          </div>
        </Card>

        {/* side: progress / result */}
        <div className="lg:col-span-5 space-y-6">
          {result ? (
            <Card className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="eyebrow">Issued</p>
                  <p className="font-mono text-sm text-ink mt-1">{shortAddr(result.prescriptionId)}</p>
                </div>
                <StatusPill state={1} />
              </div>
              <LifecycleSpine
                state={1}
                totalUnits={result.totalUnits}
                dispensedUnits={0}
                cid={result.cid}
                payloadHash={result.payloadHash}
              />
            </Card>
          ) : (
            <Card className="p-6">
              <p className="eyebrow mb-3">What happens on submit</p>
              <ol className="space-y-3">
                {STEPS.slice(0, 5).map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span
                      className={
                        "inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[0.625rem] " +
                        (step === s ? "bg-teal text-white" : "bg-line text-muted")
                      }
                    >
                      {i + 1}
                    </span>
                    <span className={"text-sm " + (step === s ? "text-ink font-medium" : "text-muted")}>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs text-muted leading-relaxed">
                The signature commits to the encrypted content&apos;s hash. Only the hash, CID, and lifecycle live
                on-chain - the prescription body stays encrypted off-chain.
              </p>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
