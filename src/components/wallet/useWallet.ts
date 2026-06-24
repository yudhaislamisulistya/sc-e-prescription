import { useCallback, useEffect, useState } from "react";
import { getInjected, walletClientFor } from "@/lib/eth";

/** Minimal injected-wallet hook (no extra deps). Exposes the connected account
 *  and a factory for a viem WalletClient bound to the injected provider. */
export function useWallet() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const p = getInjected();
    setAvailable(!!p);
    if (!p) return;
    p.request({ method: "eth_accounts" })
      .then((accts) => {
        const a = accts as string[];
        if (a && a[0]) setAddress(a[0] as `0x${string}`);
      })
      .catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    const p = getInjected();
    if (!p) return;
    setConnecting(true);
    try {
      const accts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      setAddress((accts?.[0] ?? null) as `0x${string}` | null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const walletClient = useCallback(() => {
    const p = getInjected();
    if (!p) throw new Error("No injected wallet available");
    return walletClientFor(p);
  }, []);

  return { address, connect, connecting, available, walletClient };
}
