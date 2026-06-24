import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-card border border-line rounded-[var(--radius-card)] shadow-[0_1px_2px_rgba(14,27,33,0.04)]",
        className
      )}
      {...props}
    />
  );
}
