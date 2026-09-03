import { redirect } from "next/navigation";
import { CategoryManager } from "@/components/master-data/category-manager";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoryTree } from "@/services/categories/category-service";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const categoryTree = await getCategoryTree(supabase, user.id, { includeDeleted: true, includeDeletionInfo: true });

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Impostazioni</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">Categorie</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Organizza macro-categorie personali e categorie figlie.</p>
      </header>
      <CategoryManager categoryTree={categoryTree} />
    </main>
  );
}
