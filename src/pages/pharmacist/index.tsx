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
import { STATE, type StateCode } from "@/components/ui/lifecycle";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

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
    if (!BYTES32_RE.test(id)) return toast.warning("Enter a valid prescription id (bytes32).");
    if (!configured) return toast.error("PRESCRIPTION_REGISTRY address is not configured.");
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
        toast.error("No prescription found for that id.");
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
      toast.error((err as Error).message || "Lookup failed (is the RPC reachable?).");
    } finally {
      setLoading(false);
    }
  }

  async function dispense() {
    if (!rx) return;
    if (!address) return toast.warning("Connect your wallet first.");
    const u = Number(units);
    if (!Number.isInteger(u) || u <= 0 || u > remaining) {
      return toast.warning(`Enter 1-${remaining} units.`);
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
      toast.success(`Dispensed ${u} unit(s).`);
      await lookup(rx.id);
    } catch (err) {
      toast.error((err as Error).message || "Dispense failed.");
    } finally {
      setBusy(false);
    }
  }

  async function refill() {
    if (!rx) return;
    if (!address) return toast.warning("Connect your wallet first.");
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
      toast.success("Refilled - units reset, status back to issued.");
      await lookup(rx.id);
    } catch (err) {
      toast.error((err as Error).message || "Refill failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell role="pharmacist" active="dispense" title="Dispense" identity={address ? shortAddr(address) : undefined}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-1">Pharmacist console</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dispense</h1>
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

      <Card className="p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Prescription id" className="flex-1">
            <Input
              placeholder="0x..."
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              className="font-mono"
            />
          </Field>
          <Button variant="secondary" onClick={() => lookup()} disabled={loading}>
            {loading ? "Looking up..." : "Look up"}
          </Button>
        </div>
      </Card>

      {rx && (
        <div className="grid lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-7 p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="eyebrow">Prescription</p>
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
                <dt className="eyebrow mb-1">Prescriber</dt>
                <dd><MonoChip value={rx.doctor} /></dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Patient ref</dt>
                <dd><MonoChip value={rx.patientRef} /></dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Valid until</dt>
                <dd className="text-ink">{new Date(rx.expiresAt * 1000).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Refills</dt>
                <dd className="font-mono text-ink">{rx.refillsUsed} / {rx.refillsAllowed}</dd>
              </div>
            </dl>
          </Card>

          <Card className="lg:col-span-5 p-6 h-fit">
            <p className="eyebrow mb-4">Actions</p>
            <p className="text-sm text-muted mb-4">{STATE[rx.state].blurb}</p>

            {canDispense ? (
              <div className="space-y-3">
                <Field label={`Units to dispense (1-${remaining})`}>
                  <Input type="number" min={1} max={remaining} value={units} onChange={(e) => setUnits(e.target.value)} />
                </Field>
                <Button className="w-full" onClick={dispense} disabled={busy}>
                  {busy ? "Working..." : "Dispense"}
                </Button>
              </div>
            ) : canRefill ? (
              <Button className="w-full" onClick={refill} disabled={busy}>
                {busy ? "Working..." : "Refill prescription"}
              </Button>
            ) : (
              <p className="text-sm text-muted">No dispensing action available in this state.</p>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
