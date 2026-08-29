import { BarChart3, Home, MoreHorizontal, Plus, Users } from "lucide-react";
import Link from "next/link";

const items = [
  { label: "Home", href: "/", icon: Home },
  { label: "Family", href: "/family", icon: Users },
  { label: "Add", href: "/add", icon: Plus },
  { label: "Statistics", href: "/statistics", icon: BarChart3 },
  { label: "More", href: "/settings", icon: MoreHorizontal }
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-zinc-600">
              <Icon aria-hidden className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
