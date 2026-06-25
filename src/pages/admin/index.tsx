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
import { useT } from "@/i18n/I18nProvider";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

const selectClass =
  "w-full h-10 rounded-lg border border-line-strong bg-card px-3 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20";

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function AdminConsole() {
  const t = useT();
  const { address, connect, connecting, available, walletClient } = useWallet();
  const configured = !!ADDR.identity;

  const roleLabel: Record<keyof typeof ROLE_NAMES, string> = {
    DOCTOR_ROLE: t("common.roles.doctor"),
    PHARMACIST_ROLE: t("common.roles.pharmacist"),
    PATIENT_CUSTODIAN_ROLE: t("admin.roles.patientCustodian"),
  };

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
      toast.warning(t("admin.toast.connectWallet"));
      return false;
    }
    if (!configured) {
      toast.error(t("admin.toast.notConfigured"));
      return false;
    }
    return true;
  }

  async function registerActor() {
    if (!guard()) return;
    if (!ADDR_RE.test(actorAddr)) return toast.warning(t("admin.toast.invalidActor"));
    if (!BYTES32_RE.test(licenseHash)) return toast.warning(t("admin.toast.licenseBytes32"));
    if (!BYTES32_RE.test(institutionId)) return toast.warning(t("admin.toast.institutionBytes32"));
    if (!HEX_RE.test(actorPubKey) || actorPubKey.length < 4) return toast.warning(t("admin.toast.pubkeyHex"));
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
      toast.success(t("admin.toast.actorRegistered", { role: roleLabel[role] }));
      setActorAddr("");
    } catch (err) {
      toast.error((err as Error).message || t("admin.toast.actorFailed"));
    } finally {
      setBusyActor(false);
    }
  }

  async function registerPatient() {
    if (!guard()) return;
    if (!BYTES32_RE.test(patientRef)) return toast.warning(t("admin.toast.patientRefBytes32"));
    if (!HEX_RE.test(patientPubKey) || patientPubKey.length < 4) return toast.warning(t("admin.toast.pubkeyHex"));
    if (!ADDR_RE.test(custodian)) return toast.warning(t("admin.toast.invalidCustodian"));
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
      toast.success(t("admin.toast.patientRegistered"));
      setPatientRef("");
    } catch (err) {
      toast.error((err as Error).message || t("admin.toast.patientFailed"));
    } finally {
      setBusyPatient(false);
    }
  }

  return (
    <AppShell role="admin" active="actors" title={t("admin.title")} identity={address ? shortAddr(address) : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-1">{t("admin.eyebrow")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
        </div>
        {!address &&
          (available ? (
            <Button onClick={connect} disabled={connecting}>
              {connecting ? t("common.wallet.connecting") : t("common.wallet.connect")}
            </Button>
          ) : (
            <span className="text-sm text-muted">{t("common.wallet.none")}</span>
          ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* register actor */}
        <Card className="p-6">
          <p className="eyebrow mb-4">{t("admin.actor.eyebrow")}</p>
          <div className="space-y-4">
            <Field label={t("admin.actor.fields.address.label")}>
              <Input placeholder="0x..." value={actorAddr} onChange={(e) => setActorAddr(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label={t("admin.actor.fields.role.label")}>
              <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as keyof typeof ROLE_NAMES)}>
                <option value="DOCTOR_ROLE">{t("common.roles.doctor")}</option>
                <option value="PHARMACIST_ROLE">{t("common.roles.pharmacist")}</option>
                <option value="PATIENT_CUSTODIAN_ROLE">{t("admin.roles.patientCustodian")}</option>
              </select>
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("admin.actor.fields.licenseHash.label")} hint={t("admin.actor.fields.licenseHash.hint")}>
                <Input placeholder="0x..." value={licenseHash} onChange={(e) => setLicenseHash(e.target.value.trim())} className="font-mono" />
              </Field>
              <Field label={t("admin.actor.fields.institutionId.label")} hint={t("admin.actor.fields.institutionId.hint")}>
                <Input placeholder="0x..." value={institutionId} onChange={(e) => setInstitutionId(e.target.value.trim())} className="font-mono" />
              </Field>
            </div>
            <Field label={t("admin.actor.fields.pubkey.label")} hint={t("admin.actor.fields.pubkey.hint")}>
              <Input placeholder="0x04..." value={actorPubKey} onChange={(e) => setActorPubKey(e.target.value.trim())} className="font-mono" />
            </Field>
            <Button onClick={registerActor} disabled={busyActor}>
              {busyActor ? t("admin.buttons.working") : t("admin.actor.button")}
            </Button>
          </div>
        </Card>

        {/* register patient */}
        <Card className="p-6">
          <p className="eyebrow mb-4">{t("admin.patient.eyebrow")}</p>
          <div className="space-y-4">
            <Field label={t("admin.patient.fields.ref.label")} hint={t("admin.patient.fields.ref.hint")}>
              <Input placeholder="0x..." value={patientRef} onChange={(e) => setPatientRef(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label={t("admin.patient.fields.pubkey.label")} hint={t("admin.patient.fields.pubkey.hint")}>
              <Input placeholder="0x04..." value={patientPubKey} onChange={(e) => setPatientPubKey(e.target.value.trim())} className="font-mono" />
            </Field>
            <Field label={t("admin.patient.fields.custodian.label")} hint={t("admin.patient.fields.custodian.hint")}>
              <Input placeholder="0x..." value={custodian} onChange={(e) => setCustodian(e.target.value.trim())} className="font-mono" />
            </Field>
            <Button onClick={registerPatient} disabled={busyPatient}>
              {busyPatient ? t("admin.buttons.working") : t("admin.patient.button")}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
