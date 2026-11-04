import type { CategoryTreeItem } from "@/services/categories/category-service";

export function categoryTreeForScope(tree: CategoryTreeItem[], householdId: string | null) {
  return tree.filter((macro) => macro.deletedAt === null && (householdId
    ? macro.householdId === householdId && macro.ownerUserId === null
    : macro.householdId === null && macro.ownerUserId !== null));
}

export function categoryOptionsForScope(tree: CategoryTreeItem[], householdId: string | null) {
  return categoryTreeForScope(tree, householdId).flatMap((macro) => macro.categories
    .filter((category) => category.deletedAt === null)
    .map((category) => ({ value: category.id, label: `${macro.name} / ${category.name}` })));
}

/** Never carry a selected category across independent taxonomies. */
export function categoryAfterScopeChange(previousScope: string | null, nextScope: string | null, categoryId: string) {
  return previousScope === nextScope ? categoryId : "";
}
