import { ArrowRightLeft, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AddPage() {
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
        <p className="text-sm font-semibold text-primary">Aggiungi</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Nuova operazione</h1>
      </header>
      <div className="space-y-3">
        <Link href="/movements/new" className="flex min-h-20 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
          <span>
            <span className="block font-semibold">Movimento</span>
            <span className="mt-1 block text-sm text-zinc-600">Entrata, spesa o rimborso</span>
          </span>
          <Plus aria-hidden className="h-5 w-5 text-primary" />
        </Link>
        <Link href="/transfers/new" className="flex min-h-20 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel">
          <span>
            <span className="block font-semibold">Trasferimento</span>
            <span className="mt-1 block text-sm text-zinc-600">Conto, contanti o fondo</span>
          </span>
          <ArrowRightLeft aria-hidden className="h-5 w-5 text-primary" />
        </Link>
      </div>
    </main>
  );
}
