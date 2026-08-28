import { BarChart3, Home, MoreHorizontal, Plus, Users } from "lucide-react";

const items = [
  { label: "Home", icon: Home },
  { label: "Family", icon: Users },
  { label: "Add", icon: Plus },
  { label: "Statistics", icon: BarChart3 },
  { label: "More", icon: MoreHorizontal }
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-zinc-600">
              <Icon aria-hidden className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
