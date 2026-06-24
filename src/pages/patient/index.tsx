// src/pages/patient/index.tsx
//
// Patient portal - look up your prescriptions from the read model and grant a
// pharmacy access to a prescription's key. The grant is delegated to the KMS
// signer (the patient's custodian); the web tier never handles patient keys.
import { useState } from "react";
import { toast } from "react-toastify";
import { AppShell } from "@/components/ui/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/StatusPill";
import { LifecycleSpine } from "@/components/ui/LifecycleSpine";
import { RxListItem, type RxSummary } from "@/components/ui/RxListItem";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

interface FullRx extends RxSummary {
  cid: string;
  payloadHash: string;
}

export default function PatientPortal() {
  const [patientRef, setPatientRef] = useState("");
  const [list, setList] = useState<FullRx[] | null>(null);
  const [selected, setSelected] = useState<FullRx | null>(null);
  const [pharmacy, setPharmacy] = useState("");
  const [loading, setLoading] = useState(false);
  const [granting, setGranting] = useState(false);

  async function load() {
    if (!BYTES32_RE.test(patientRef)) return toast.warning("Enter a valid patient ref (bytes32).");
    setLoading(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/prescriptions?patient=${encodeURIComponent(patientRef)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      setList(data as FullRx[]);
      if (data.length === 0) toast.info("No prescriptions found for that ref yet.");
    } catch (err) {
      toast.error((err as Error).message || "Could not load (is the read model running?).");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  async function grant() {
    if (!selected) return;
    if (!ADDR_RE.test(pharmacy)) return toast.warning("Enter a valid pharmacy address.");
    setGranting(true);
    try {
      const res = await fetch("/api/key-access/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescriptionId: selected.prescriptionId, pharmacyAddr: pharmacy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail?.error || "grant failed");
      toast.success("Pharmacy access granted.");
      setPharmacy("");
    } catch (err) {
      toast.error((err as Error).message || "Grant failed.");
    } finally {
      setGranting(false);
    }
  }

  return (
    <AppShell role="patient" active="mine" title="My prescriptions">
      <div className="mb-6">
        <p className="eyebrow mb-1">Patient portal</p>
        <h1 className="text-2xl font-semibold tracking-tight">My prescriptions</h1>
      </div>

      <Card className="p-5 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <Field label="Patient reference" className="flex-1" hint="Your on-chain ref (a salted hash - not your identity).">
            <Input
              placeholder="0x..."
              value={patientRef}
              onChange={(e) => setPatientRef(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="font-mono"
            />
          </Field>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Load"}
          </Button>
        </div>
      </Card>

      {list && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            {list.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted">No prescriptions to show.</Card>
            ) : (
              list.map((rx) => (
                <RxListItem
                  key={rx.prescriptionId}
                  rx={rx}
                  selected={selected?.prescriptionId === rx.prescriptionId}
                  onClick={() => setSelected(rx)}
                />
              ))
            )}
          </div>

          <div className="lg:col-span-5">
            {selected ? (
              <Card className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <p className="eyebrow">Selected</p>
                    <p className="font-mono text-sm text-ink mt-1">
                      {selected.prescriptionId.slice(0, 6)}...{selected.prescriptionId.slice(-4)}
                    </p>
                  </div>
                  <StatusPill state={selected.state as 0 | 1 | 2 | 3 | 4 | 5} />
                </div>
                <LifecycleSpine
                  state={selected.state as 0 | 1 | 2 | 3 | 4 | 5}
                  totalUnits={selected.totalUnits}
                  dispensedUnits={selected.dispensedUnits}
                  cid={selected.cid}
                  payloadHash={selected.payloadHash}
                />
                <div className="mt-6 pt-5 border-t border-line space-y-3">
                  <p className="eyebrow">Grant pharmacy access</p>
                  <Field label="Pharmacy address">
                    <Input
                      placeholder="0x..."
                      value={pharmacy}
                      onChange={(e) => setPharmacy(e.target.value.trim())}
                      className="font-mono"
                    />
                  </Field>
                  <Button className="w-full" onClick={grant} disabled={granting}>
                    {granting ? "Granting..." : "Grant access"}
                  </Button>
                  <p className="text-xs text-muted leading-relaxed">
                    Your custodian re-wraps the key for the pharmacy. The web app never sees your private key.
                  </p>
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center text-sm text-muted">Select a prescription to grant access.</Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
