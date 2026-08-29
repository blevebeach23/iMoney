import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCategoryTree } from "@/services/categories/category-service";

export const dynamic = "force-dynamic";

export default async function MacroCategoryDetailPage({ params, searchParams }: Readonly<{ params: { id: string }; searchParams: { month?: string } }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const categoryTree = await getCategoryTree(supabase, user.id);
  const macro = categoryTree.find((item) => item.id === params.id);

  if (!macro) {
    notFound();
  }

  const period = searchParams.month ? `?period=${searchParams.month}&macroCategoryId=${macro.id}` : `?macroCategoryId=${macro.id}`;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-24 pt-6">
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Macro-categoria</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground">{macro.name}</h1>
      </header>
      <div className="space-y-3">
        <Link href={`/movements${period}`} className="flex min-h-14 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white">
          Apri movimenti
        </Link>
        {macro.categories.map((category) => (
          <Link
            key={category.id}
            href={`/movements?categoryId=${category.id}${searchParams.month ? `&period=${searchParams.month}` : ""}`}
            className="flex min-h-14 items-center justify-between rounded-md border border-border bg-white px-4 shadow-panel"
          >
            <span className="font-medium">{category.name}</span>
            <span className="text-sm font-semibold text-primary">Dettaglio</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
