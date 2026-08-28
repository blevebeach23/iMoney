"use client";

import { useFormState } from "react-dom";
import { Archive, FolderPlus, ListPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deactivateCategoryAction,
  deactivateMacroCategoryAction,
  saveCategoryAction,
  saveMacroCategoryAction
} from "@/lib/master-data/actions";
import type { FormState } from "@/lib/auth/validation";
import type { Category } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import { FormMessage, PendingButton, SelectField, TextField } from "./field-controls";

const initialState: FormState = { ok: false };

function MacroCategoryForm({ macro }: Readonly<{ macro?: CategoryTreeItem }>) {
  const [state, action] = useFormState(saveMacroCategoryAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {macro?.id && <input type="hidden" name="id" value={macro.id} />}
      <TextField label="Nome macro-categoria" name="name" defaultValue={macro?.name ?? ""} errors={state.fieldErrors} />
      <TextField label="Ordine" name="sortOrder" type="number" min={0} defaultValue={macro?.sortOrder ?? 0} errors={state.fieldErrors} />
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva
      </PendingButton>
    </form>
  );
}

function CategoryForm({
  category,
  macroCategories,
  defaultMacroCategoryId
}: Readonly<{
  category?: Category;
  defaultMacroCategoryId?: string;
  macroCategories: CategoryTreeItem[];
}>) {
  const [state, action] = useFormState(saveCategoryAction, initialState);

  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {category?.id && <input type="hidden" name="id" value={category.id} />}
      <TextField label="Nome categoria" name="name" defaultValue={category?.name ?? ""} errors={state.fieldErrors} />
      <SelectField
        label="Macro-categoria"
        name="macroCategoryId"
        defaultValue={category?.macroCategoryId ?? defaultMacroCategoryId}
        options={macroCategories.map((macro) => ({ value: macro.id, label: macro.name }))}
        errors={state.fieldErrors}
      />
      <TextField label="Ordine" name="sortOrder" type="number" min={0} defaultValue={category?.sortOrder ?? 0} errors={state.fieldErrors} />
      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        Salva
      </PendingButton>
    </form>
  );
}

export function CategoryManager({ categoryTree }: Readonly<{ categoryTree: CategoryTreeItem[] }>) {
  return (
    <div className="space-y-4">
      <details className="rounded-md border border-border bg-white p-4" open={categoryTree.length === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <FolderPlus aria-hidden className="h-4 w-4" />
          Nuova macro-categoria
        </summary>
        <div className="mt-4">
          <MacroCategoryForm />
        </div>
      </details>

      {categoryTree.length > 0 && (
        <details className="rounded-md border border-border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
            <ListPlus aria-hidden className="h-4 w-4" />
            Nuova categoria
          </summary>
          <div className="mt-4">
            <CategoryForm macroCategories={categoryTree} defaultMacroCategoryId={categoryTree[0]?.id} />
          </div>
        </details>
      )}

      {categoryTree.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-white p-5">
          <p className="font-semibold text-foreground">Nessuna categoria personale</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Crea una macro-categoria, poi aggiungi le categorie figlie.</p>
        </div>
      ) : (
        categoryTree.map((macro) => (
          <details key={macro.id} className="rounded-md border border-border bg-white p-4" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="font-bold tracking-normal">{macro.name}</span>
              <span className="text-xs font-semibold text-zinc-500">{macro.categories.length}</span>
            </summary>

            <div className="mt-4 space-y-3">
              {macro.categories.length === 0 ? (
                <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">Nessuna categoria figlia.</p>
              ) : (
                macro.categories.map((category) => (
                  <div key={category.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{category.name}</p>
                      <span className="text-xs font-medium text-zinc-500">#{category.sortOrder}</span>
                    </div>
                    <details className="mt-3 rounded-md bg-zinc-50 p-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold">Modifica o sposta</summary>
                      <div className="mt-4">
                        <CategoryForm category={category} macroCategories={categoryTree} />
                      </div>
                    </details>
                    <form action={deactivateCategoryAction} className="mt-3">
                      <input type="hidden" name="id" value={category.id} />
                      <Button type="submit" variant="ghost" className="w-full text-red-700">
                        <Archive aria-hidden className="h-4 w-4" />
                        Disattiva categoria
                      </Button>
                    </form>
                  </div>
                ))
              )}

              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer list-none text-sm font-semibold">Aggiungi categoria figlia</summary>
                <div className="mt-4">
                  <CategoryForm macroCategories={categoryTree} defaultMacroCategoryId={macro.id} />
                </div>
              </details>

              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer list-none text-sm font-semibold">Modifica macro-categoria</summary>
                <div className="mt-4">
                  <MacroCategoryForm macro={macro} />
                </div>
              </details>

              <form action={deactivateMacroCategoryAction}>
                <input type="hidden" name="id" value={macro.id} />
                <Button type="submit" variant="secondary" className="w-full text-red-700">
                  <Archive aria-hidden className="h-4 w-4" />
                  Disattiva macro-categoria
                </Button>
              </form>
            </div>
          </details>
        ))
      )}
    </div>
  );
}
