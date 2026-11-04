import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CategoryManager } from "@/components/master-data/category-manager";
import { initializePersonalCategoriesAction } from "@/lib/master-data/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoryTree } from "@/services/categories/category-service";
import { getActiveHouseholdOptions } from "@/services/households/household-service";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({ searchParams }: Readonly<{ searchParams: Record<string,string|string[]|undefined> }>) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const households = await getActiveHouseholdOptions(supabase,user.id);
  const raw = searchParams.householdId;
  const householdId = Array.isArray(raw) ? raw[0] : raw;
  const household = households.find(h=>h.id===householdId);
  if (householdId && !household) notFound();
  const categoryTree = await getCategoryTree(supabase,user.id,{includeDeleted:true,includeDeletionInfo:true,householdId});
  const canManage = !household || household.role === "owner" || household.role === "admin";
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Impostazioni</p>
        <h1 className="mt-2 text-3xl font-bold">{household ? "Categorie famiglia" : "Le mie categorie"}</h1>
        <p className="mt-2 text-sm text-zinc-600">{household ? household.name : "Tassonomia personale indipendente dalle categorie famiglia."}</p>
      </header>
      <nav aria-label="Bilancio categorie" className="mb-5 flex flex-wrap gap-2">
        <Link href="/settings/categories" aria-current={!household ? "page" : undefined} className="min-h-11 rounded-md border border-border px-3 py-3 text-sm font-semibold">Le mie categorie</Link>
        {households.map(h=><Link key={h.id} href={`/settings/categories?householdId=${h.id}`} aria-current={h.id===householdId ? "page" : undefined} className="min-h-11 rounded-md border border-border px-3 py-3 text-sm font-semibold">Categorie famiglia · {h.name}</Link>)}
      </nav>
      {!household && <form action={initializePersonalCategoriesAction} className="mb-4"><button className="min-h-11 rounded-md border border-border px-3 text-sm font-semibold" type="submit">Aggiungi categorie default mancanti</button></form>}
      <CategoryManager categoryTree={categoryTree} householdId={householdId} canManage={canManage} />
    </main>
  );
}
