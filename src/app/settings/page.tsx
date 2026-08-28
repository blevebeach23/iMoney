import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeEuro, FolderTree, Landmark, UserRound, WalletCards } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const items = [
  { href: "/accounts", label: "Conti", icon: Landmark },
  { href: "/funds", label: "Fondi", icon: BadgeEuro },
  { href: "/settings/categories", label: "Categorie", icon: FolderTree },
  { href: "/settings/profile", label: "Profilo", icon: UserRound }
];

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Altro</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Impostazioni</h1>
      </header>
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-white px-4">
              <Icon aria-hidden className="h-5 w-5 text-primary" />
              <span className="font-semibold">{item.label}</span>
            </Link>
          );
        })}
        <div className="flex min-h-16 items-center gap-3 rounded-md border border-dashed border-border bg-white px-4 text-zinc-500">
          <WalletCards aria-hidden className="h-5 w-5" />
          <span className="font-semibold">Altre impostazioni nelle prossime fasi</span>
        </div>
      </div>
    </main>
  );
}
