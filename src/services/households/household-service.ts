import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export interface ActiveHouseholdOption {
  id: string;
  name: string;
  shareByDefault: boolean;
}

export async function getActiveHouseholdOptions(supabase: SupabaseClient, userId: string): Promise<ActiveHouseholdOption[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(name)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  if (membershipError) {
    throw membershipError;
  }

  const ids = (memberships ?? []).map((row: Row) => String(row.household_id));

  if (ids.length === 0) {
    return [];
  }

  const { data: preferences, error: preferenceError } = await supabase
    .from("household_user_preferences")
    .select("household_id, preferences")
    .eq("user_id", userId)
    .in("household_id", ids);

  if (preferenceError) {
    throw preferenceError;
  }

  const preferenceByHousehold = new Map((preferences ?? []).map((row: Row) => [String(row.household_id), asRecord(row.preferences)]));

  return (memberships ?? []).map((row: Row) => {
    const household = asRecord(row.households);
    const prefs = preferenceByHousehold.get(String(row.household_id));

    return {
      id: String(row.household_id),
      name: String(household?.name ?? "Famiglia"),
      shareByDefault: Boolean(prefs?.share_new_movements_by_default)
    };
  });
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }

  return null;
}
