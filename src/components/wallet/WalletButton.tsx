import { Button } from "@/components/ui/Button";
import { useWallet } from "./useWallet";

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/** Connect / connected-state control for the injected wallet. */
export function WalletButton() {
  const { address, connect, connecting, available } = useWallet();

  if (address) {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 h-9">
        <span className="h-2 w-2 rounded-full bg-st-full" aria-hidden />
        <span className="font-mono text-xs text-ink">{shortAddr(address)}</span>
      </span>
    );
  }

  if (!available) {
    return (
      <span className="inline-flex items-center rounded-lg border border-line bg-paper px-3 h-9 text-xs text-muted">
        No wallet detected
      </span>
    );
  }

  return (
    <Button size="sm" onClick={connect} disabled={connecting}>
      {connecting ? "Connecting..." : "Connect wallet"}
    </Button>
  );
}
