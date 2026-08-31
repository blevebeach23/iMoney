import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { Household, HouseholdInvite, HouseholdMember, HouseholdRole, HouseholdMemberStatus } from "@/types/domain";

type Row = Record<string, unknown>;
type SupabaseErrorDetails = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  status?: number;
};

export interface ActiveHouseholdOption {
  id: string;
  name: string;
  shareByDefault: boolean;
  role?: HouseholdRole;
}

export interface HouseholdMemberListItem extends HouseholdMember {
  fullName: string;
  username: string;
  email?: string;
}

export interface HouseholdInviteListItem extends HouseholdInvite {
  invitedByName: string;
}

export async function getActiveHouseholdOptions(supabase: SupabaseClient, userId: string): Promise<ActiveHouseholdOption[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, role, households(name)")
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
      shareByDefault: Boolean(prefs?.share_new_movements_by_default),
      role: row.role as HouseholdRole
    };
  });
}

export async function getActiveHouseholds(supabase: SupabaseClient, userId: string): Promise<ActiveHouseholdOption[]> {
  return getActiveHouseholdOptions(supabase, userId);
}

export async function createHousehold(supabase: SupabaseClient, _userId: string, name: string) {
  const { data, error } = await supabase.rpc("create_household", {
    household_name: name
  });

  if (error) {
    logSupabaseError("create_household_rpc", error);
    throw error;
  }

  return String(data);
}

export async function updateHouseholdName(supabase: SupabaseClient, householdId: string, name: string) {
  const { error } = await supabase.from("households").update({ name }).eq("id", householdId);

  if (error) {
    throw error;
  }
}

export async function getHouseholdById(supabase: SupabaseClient, householdId: string): Promise<Household | null> {
  const { data, error } = await supabase.from("households").select("*").eq("id", householdId).maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapHouseholdRow(data) : null;
}

export async function getHouseholdMembers(supabase: SupabaseClient, householdId: string): Promise<HouseholdMemberListItem[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("*, profiles!household_members_user_id_fkey(full_name, username)")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapHouseholdMemberRow);
}

export async function updateHouseholdMemberRole(supabase: SupabaseClient, householdId: string, userId: string, role: "admin" | "member") {
  const { error } = await supabase.from("household_members").update({ role }).eq("household_id", householdId).eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function removeHouseholdMember(supabase: SupabaseClient, householdId: string, userId: string) {
  const { error } = await supabase
    .from("household_members")
    .update({ status: "REMOVED", removed_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function createHouseholdInvite(supabase: SupabaseClient, householdId: string, invitedBy: string, email: string) {
  const token = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const { error } = await supabase.from("household_invites").insert({
    household_id: householdId,
    invited_by: invitedBy,
    email,
    token,
    status: "PENDING",
    expires_at: expiresAt
  });

  if (error) {
    throw error;
  }

  return token;
}

export async function getHouseholdInvites(supabase: SupabaseClient, householdId: string): Promise<HouseholdInviteListItem[]> {
  const { data, error } = await supabase
    .from("household_invites")
    .select("*, profiles!household_invites_invited_by_fkey(full_name)")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapHouseholdInviteRow);
}

export async function getPendingInvitesForCurrentUser(supabase: SupabaseClient): Promise<HouseholdInviteListItem[]> {
  const { data, error } = await supabase
    .from("household_invites")
    .select("*, profiles!household_invites_invited_by_fkey(full_name)")
    .eq("status", "PENDING")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapHouseholdInviteRow);
}

export async function respondToHouseholdInvite(supabase: SupabaseClient, token: string, accept: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("respond_to_household_invite", {
    invite_token: token,
    accept_invite: accept
  });

  if (error) {
    throw error;
  }

  return String(data);
}

export async function getHouseholdPreference(supabase: SupabaseClient, householdId: string, userId: string): Promise<{ shareNewMovementsByDefault: boolean }> {
  const { data, error } = await supabase
    .from("household_user_preferences")
    .select("preferences")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const prefs = asRecord(data?.preferences);
  return { shareNewMovementsByDefault: Boolean(prefs?.share_new_movements_by_default) };
}

export async function updateHouseholdPreference(supabase: SupabaseClient, householdId: string, userId: string, shareNewMovementsByDefault: boolean) {
  const { error } = await supabase.from("household_user_preferences").upsert({
    household_id: householdId,
    user_id: userId,
    preferences: { share_new_movements_by_default: shareNewMovementsByDefault }
  });

  if (error) {
    throw error;
  }
}

function mapHouseholdRow(row: Row): Household {
  return {
    id: String(row.id),
    name: String(row.name),
    createdBy: String(row.created_by)
  };
}

function mapHouseholdMemberRow(row: Row): HouseholdMemberListItem {
  const profile = asRecord(row.profiles);
  return {
    householdId: String(row.household_id),
    userId: String(row.user_id),
    role: row.role as HouseholdRole,
    status: row.status as HouseholdMemberStatus,
    invitedBy: row.invited_by ? String(row.invited_by) : null,
    joinedAt: row.joined_at ? String(row.joined_at) : null,
    removedAt: row.removed_at ? String(row.removed_at) : null,
    fullName: String(profile?.full_name ?? "Membro"),
    username: String(profile?.username ?? "")
  };
}

function mapHouseholdInviteRow(row: Row): HouseholdInviteListItem {
  const invitedByProfile = asRecord(row.profiles);
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    invitedBy: String(row.invited_by),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    token: String(row.token),
    status: row.status as HouseholdInvite["status"],
    expiresAt: String(row.expires_at),
    acceptedBy: row.accepted_by ? String(row.accepted_by) : null,
    invitedByName: String(invitedByProfile?.full_name ?? "Invitante")
  };
}

function asRecord(value: unknown): Row | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }

  return null;
}

function logSupabaseError(operation: string, error: SupabaseErrorDetails) {
  console.error("[households] Supabase operation failed", {
    operation,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    status: error.status
  });
}
