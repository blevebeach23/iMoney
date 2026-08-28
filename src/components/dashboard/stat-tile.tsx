import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning";
}

export function StatTile({ label, value, tone = "default" }: StatTileProps) {
  return (
    <div className="rounded-md border border-border bg-white p-4 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "warning" && "text-amber-700",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
