"use client";

import type { ButtonHTMLAttributes } from "react";
import { hapticTap } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ className, onClick, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-white shadow-panel",
        variant === "secondary" && "border border-border bg-white text-foreground",
        variant === "ghost" && "text-foreground hover:bg-black/5",
        className
      )}
      onClick={(event) => {
        hapticTap();
        onClick?.(event);
      }}
      {...props}
    />
  );
}
