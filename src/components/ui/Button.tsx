import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-teal text-white hover:bg-teal-deep border border-transparent",
  secondary: "bg-card text-ink border border-line-strong hover:border-teal hover:text-teal",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-line/60 border border-transparent",
  danger: "bg-card text-st-revoked border border-st-revoked/40 hover:bg-st-revoked hover:text-white",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    />
  );
}
