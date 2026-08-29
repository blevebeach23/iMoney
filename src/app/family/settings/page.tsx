import { redirect } from "next/navigation";
import { FamilySettings } from "@/components/family/family-settings";
import { calculateBudgetReport } from "@/lib/calculations/budget";
import { currentMonthRange, previousMonthStart } from "@/lib/calculations/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHouseholdBudgetsForMonth } from "@/services/budgets/budget-service";
import { getCategoryTree } from "@/services/categories/category-service";
import {
  getActiveHouseholds,
  getHouseholdById,
  getHouseholdInvites,
  getHouseholdMembers,
  getHouseholdPreference
} from "@/services/households/household-service";
import { getMovementCategoryInfo, getSharedHouseholdMovements } from "@/services/movements/movement-service";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FamilySettingsPage({ searchParams }: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeHouseholds = await getActiveHouseholds(supabase, user.id);
  const selectedHouseholdId = firstParam(searchParams.householdId) ?? activeHouseholds[0]?.id;
  const range = currentMonthRange();

  if (!selectedHouseholdId) {
    return (
      <FamilySettings
        activeHouseholds={[]}
        budgets={[]}
        budgetReport={calculateBudgetReport([], [], new Map())}
        categoryTree={[]}
        household={null}
        invites={[]}
        members={[]}
        monthStart={range.monthStart}
        previousMonthStart={previousMonthStart(range.monthStart)}
        preference={null}
      />
    );
  }

  const [household, members, invites, preference, budgets, categoryTree, categoryInfo, movements] = await Promise.all([
    getHouseholdById(supabase, selectedHouseholdId),
    getHouseholdMembers(supabase, selectedHouseholdId),
    getHouseholdInvites(supabase, selectedHouseholdId),
    getHouseholdPreference(supabase, selectedHouseholdId, user.id),
    getHouseholdBudgetsForMonth(supabase, selectedHouseholdId, range.monthStart),
    getCategoryTree(supabase, user.id),
    getMovementCategoryInfo(supabase, user.id),
    getSharedHouseholdMovements(supabase, selectedHouseholdId, range.monthStart, range.monthEnd)
  ]);

  return (
    <FamilySettings
      activeHouseholds={activeHouseholds}
      budgets={budgets}
      budgetReport={calculateBudgetReport(budgets, movements, categoryInfo)}
      categoryTree={categoryTree}
      household={household}
      invites={invites}
      members={members}
      monthStart={range.monthStart}
      previousMonthStart={previousMonthStart(range.monthStart)}
      preference={preference}
    />
  );
}
