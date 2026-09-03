"use client";

import { useFormState } from "react-dom";
import { Archive, FolderPlus, ListPlus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deactivateCategoryAction,
  deactivateMacroCategoryAction,
  deleteCategoryAction,
  deleteMacroCategoryAction,
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

function DeleteCategoryForm({ action, id, label }: Readonly<{ action: typeof deleteCategoryAction | typeof deleteMacroCategoryAction; id: string; label: string }>) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm(`Eliminare definitivamente "${label}"?`)) {
          event.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" className="w-full text-red-700">
        <Trash2 aria-hidden className="h-4 w-4" />
        Elimina definitivamente
      </Button>
    </form>
  );
}

function BlockedDeleteNote({ reasons }: Readonly<{ reasons: string[] }>) {
  if (reasons.length === 0) {
    return null;
  }

  return <p className="text-xs leading-5 text-zinc-500">Eliminazione definitiva bloccata: {reasons.join(", ")}.</p>;
}

export function CategoryManager({ categoryTree }: Readonly<{ categoryTree: CategoryTreeItem[] }>) {
  const activeMacroCategories = categoryTree.filter((macro) => macro.deletedAt === null);

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

      {activeMacroCategories.length > 0 && (
        <details className="rounded-md border border-border bg-white p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
            <ListPlus aria-hidden className="h-4 w-4" />
            Nuova categoria
          </summary>
          <div className="mt-4">
            <CategoryForm macroCategories={activeMacroCategories} defaultMacroCategoryId={activeMacroCategories[0]?.id} />
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
              <span className="font-bold tracking-normal">
                {macro.name}
                {macro.deletedAt && <span className="ml-2 text-xs font-semibold text-zinc-500">Disattivata</span>}
              </span>
              <span className="text-xs font-semibold text-zinc-500">{macro.categories.length}</span>
            </summary>

            <div className="mt-4 space-y-3">
              {macro.categories.length === 0 ? (
                <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">Nessuna categoria figlia.</p>
              ) : (
                macro.categories.map((category) => (
                  <div key={category.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        {category.name}
                        {category.deletedAt && <span className="ml-2 text-xs font-semibold text-zinc-500">Disattivata</span>}
                      </p>
                      <span className="text-xs font-medium text-zinc-500">#{category.sortOrder}</span>
                    </div>
                    {category.deletedAt === null && (
                      <details className="mt-3 rounded-md bg-zinc-50 p-3">
                        <summary className="cursor-pointer list-none text-sm font-semibold">Modifica o sposta</summary>
                        <div className="mt-4">
                          <CategoryForm category={category} macroCategories={activeMacroCategories} />
                        </div>
                      </details>
                    )}
                    <div className="mt-3 space-y-2">
                      {!category.deletion.canDelete && category.deletedAt === null && (
                        <form action={deactivateCategoryAction}>
                          <input type="hidden" name="id" value={category.id} />
                          <Button type="submit" variant="ghost" className="w-full text-red-700">
                            <Archive aria-hidden className="h-4 w-4" />
                            Disattiva categoria
                          </Button>
                        </form>
                      )}
                      {category.deletion.canDelete ? (
                        <>
                          {category.deletedAt === null && (
                            <form action={deactivateCategoryAction}>
                              <input type="hidden" name="id" value={category.id} />
                              <Button type="submit" variant="secondary" className="w-full text-red-700">
                                <Archive aria-hidden className="h-4 w-4" />
                                Disattiva categoria
                              </Button>
                            </form>
                          )}
                          <DeleteCategoryForm action={deleteCategoryAction} id={category.id} label={category.name} />
                        </>
                      ) : (
                        <BlockedDeleteNote reasons={category.deletion.reasons} />
                      )}
                    </div>
                  </div>
                ))
              )}

              {macro.deletedAt === null && (
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold">Aggiungi categoria figlia</summary>
                  <div className="mt-4">
                    <CategoryForm macroCategories={activeMacroCategories} defaultMacroCategoryId={macro.id} />
                  </div>
                </details>
              )}

              {macro.deletedAt === null && (
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold">Modifica macro-categoria</summary>
                  <div className="mt-4">
                    <MacroCategoryForm macro={macro} />
                  </div>
                </details>
              )}

              <div className="space-y-2">
                {!macro.deletion.canDelete && macro.deletedAt === null && (
                  <form action={deactivateMacroCategoryAction}>
                    <input type="hidden" name="id" value={macro.id} />
                    <Button type="submit" variant="secondary" className="w-full text-red-700">
                      <Archive aria-hidden className="h-4 w-4" />
                      Disattiva macro-categoria
                    </Button>
                  </form>
                )}
                {macro.deletion.canDelete ? (
                  <>
                    {macro.deletedAt === null && (
                      <form action={deactivateMacroCategoryAction}>
                        <input type="hidden" name="id" value={macro.id} />
                        <Button type="submit" variant="secondary" className="w-full text-red-700">
                          <Archive aria-hidden className="h-4 w-4" />
                          Disattiva macro-categoria
                        </Button>
                      </form>
                    )}
                    <DeleteCategoryForm action={deleteMacroCategoryAction} id={macro.id} label={macro.name} />
                  </>
                ) : (
                  <BlockedDeleteNote reasons={macro.deletion.reasons} />
                )}
              </div>
            </div>
          </details>
        ))
      )}
    </div>
  );
}
