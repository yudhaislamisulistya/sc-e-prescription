// src/pages/pharmacist/index.tsx
//
// Pharmacist console - look up a prescription by id (read straight from chain),
// see its lifecycle, and dispense units or refill. On-chain accounting makes
// double-dispensing impossible across the consortium; the UI reflects the same
// invariants (cannot dispense past the remaining units or out of a valid state).
import { useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleSpine } from "@/components/ui/LifecycleSpine";
import { MonoChip } from "@/components/ui/MonoChip";
import { useWallet } from "@/components/wallet/useWallet";
import { ADDR, besuChain, publicClient, PRESCRIPTION_REGISTRY_ABI } from "@/lib/eth";
import { type StateCode } from "@/components/ui/lifecycle";
import { useT } from "@/i18n/I18nProvider";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

const TONE = { 0: "none", 1: "issued", 2: "partial", 3: "full", 4: "expired", 5: "revoked" } as const;

interface Rx {
  id: `0x${string}`;
  doctor: `0x${string}`;
  patientRef: `0x${string}`;
  cid: string;
  payloadHash: `0x${string}`;
  expiresAt: number;
  totalUnits: number;
  dispensedUnits: number;
  refillsAllowed: number;
  refillsUsed: number;
  state: StateCode;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function PharmacistConsole() {
  const { address, connect, connecting, available, walletClient } = useWallet();
  const t = useT();

  const [lookupId, setLookupId] = useState("");
  const [rx, setRx] = useState<Rx | null>(null);
  const [units, setUnits] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const configured = !!ADDR.prescription;
  const remaining = rx ? rx.totalUnits - rx.dispensedUnits : 0;
  const canDispense = !!rx && (rx.state === 1 || rx.state === 2) && remaining > 0;
  const canRefill = !!rx && rx.state === 3 && rx.refillsUsed < rx.refillsAllowed;

  async function lookup(idArg?: string) {
    const id = (idArg ?? lookupId).trim();
    if (!BYTES32_RE.test(id)) return toast.warning(t("pharmacist.toast.invalidId"));
    if (!configured) return toast.error(t("pharmacist.toast.notConfigured"));
    setLoading(true);
    try {
      const p = await publicClient().readContract({
        address: ADDR.prescription!,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "getPrescription",
        args: [id as `0x${string}`],
      });
      if (Number(p.state) === 0) {
        setRx(null);
        toast.error(t("pharmacist.toast.notFound"));
        return;
      }
      setRx({
        id: id as `0x${string}`,
        doctor: p.doctor,
        patientRef: p.patientRef,
        cid: p.cid,
        payloadHash: p.payloadHash,
        expiresAt: Number(p.expiresAt),
        totalUnits: Number(p.totalUnits),
        dispensedUnits: Number(p.dispensedUnits),
        refillsAllowed: Number(p.refillsAllowed),
        refillsUsed: Number(p.refillsUsed),
        state: Number(p.state) as StateCode,
      });
      setUnits(String(Number(p.totalUnits) - Number(p.dispensedUnits)));
    } catch (err) {
      toast.error((err as Error).message || t("pharmacist.toast.lookupFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function dispense() {
    if (!rx) return;
    if (!address) return toast.warning(t("pharmacist.toast.connectFirst"));
    const u = Number(units);
    if (!Number.isInteger(u) || u <= 0 || u > remaining) {
      return toast.warning(t("pharmacist.toast.dispenseRange", { n: remaining }));
    }
    setBusy(true);
    try {
      const hash = await walletClient().writeContract({
        address: ADDR.prescription!,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "dispense",
        args: [rx.id, u],
        account: address,
        chain: besuChain,
      });
      await publicClient().waitForTransactionReceipt({ hash });
      toast.success(t("pharmacist.toast.dispensed", { n: u }));
      await lookup(rx.id);
    } catch (err) {
      toast.error((err as Error).message || t("pharmacist.toast.dispenseFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function refill() {
    if (!rx) return;
    if (!address) return toast.warning(t("pharmacist.toast.connectFirst"));
    setBusy(true);
    try {
      const hash = await walletClient().writeContract({
        address: ADDR.prescription!,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "refill",
        args: [rx.id],
        account: address,
        chain: besuChain,
      });
      await publicClient().waitForTransactionReceipt({ hash });
      toast.success(t("pharmacist.toast.refilled"));
      await lookup(rx.id);
    } catch (err) {
      toast.error((err as Error).message || t("pharmacist.toast.refillFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell role="pharmacist" active="dispense" title={t("pharmacist.title")} identity={address ? shortAddr(address) : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-1">{t("pharmacist.eyebrow")}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pharmacist.title")}</h1>
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

      <Card className="p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label={t("pharmacist.lookup.label")} className="flex-1">
            <Input
              placeholder="0x..."
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              className="font-mono"
            />
          </Field>
          <Button variant="secondary" onClick={() => lookup()} disabled={loading}>
            {loading ? t("pharmacist.lookup.loading") : t("pharmacist.lookup.button")}
          </Button>
        </div>
      </Card>

      {rx && (
        <div className="grid lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="eyebrow">{t("pharmacist.detail.eyebrow")}</p>
                <p className="font-mono text-sm text-ink mt-1">{shortAddr(rx.id)}</p>
              </div>
              <StatusPill state={rx.state} />
            </div>
            <LifecycleSpine
              state={rx.state}
              totalUnits={rx.totalUnits}
              dispensedUnits={rx.dispensedUnits}
              cid={rx.cid}
              payloadHash={rx.payloadHash}
            />
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="eyebrow mb-1">{t("pharmacist.detail.prescriber")}</dt>
                <dd><MonoChip value={rx.doctor} /></dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">{t("pharmacist.detail.patientRef")}</dt>
                <dd><MonoChip value={rx.patientRef} /></dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">{t("pharmacist.detail.validUntil")}</dt>
                <dd className="text-ink">{new Date(rx.expiresAt * 1000).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">{t("pharmacist.detail.refills")}</dt>
                <dd className="font-mono text-ink">{rx.refillsUsed} / {rx.refillsAllowed}</dd>
              </div>
            </dl>
          </Card>

          <Card className="lg:col-span-5 p-6 h-fit">
            <p className="eyebrow mb-4">{t("pharmacist.actions.eyebrow")}</p>
            <p className="text-sm text-muted mb-4">{t(`common.status.${TONE[rx.state]}.blurb`)}</p>

            {canDispense ? (
              <div className="space-y-3">
                <Field label={t("pharmacist.actions.unitsLabel", { n: remaining })}>
                  <Input type="number" min={1} max={remaining} value={units} onChange={(e) => setUnits(e.target.value)} />
                </Field>
                <Button className="w-full" onClick={dispense} disabled={busy}>
                  {busy ? t("pharmacist.actions.working") : t("pharmacist.actions.dispense")}
                </Button>
              </div>
            ) : canRefill ? (
              <Button className="w-full" onClick={refill} disabled={busy}>
                {busy ? t("pharmacist.actions.working") : t("pharmacist.actions.refill")}
              </Button>
            ) : (
              <p className="text-sm text-muted">{t("pharmacist.actions.none")}</p>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
