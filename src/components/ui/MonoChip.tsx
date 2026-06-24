import { useState } from "react";
import { cn } from "./cn";

function truncateMiddle(v: string, head = 6, tail = 4): string {
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}

/** A monospace chip for on-chain data (hash / address / cid) with copy-to-clipboard. */
export function MonoChip({
  label,
  value,
  full = false,
  className,
}: {
  label?: string;
  value: string;
  full?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shown = full ? value : truncateMiddle(value);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-line bg-paper px-2 py-1",
        className
      )}
    >
      {label && <span className="eyebrow !text-[0.625rem]">{label}</span>}
      <code className="font-mono text-xs text-ink">{shown}</code>
      <button
        type="button"
        onClick={copy}
        className="text-faint hover:text-teal text-xs leading-none"
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
