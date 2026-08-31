import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHousehold, createHouseholdInvite, getHouseholdMembers, getPendingInvitesForCurrentUser } from "@/services/households/household-service";

function supabaseWithRpc(result: { data: string | null; error: null | { code: string; details: string; hint: string; message: string; status: number } }) {
  return {
    rpc: vi.fn().mockResolvedValue(result)
  } as unknown as SupabaseClient;
}

function supabaseWithHouseholdMembers() {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as SupabaseClient,
    select
  };
}

function supabaseWithInviteLookup(isRegistered: boolean) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  const rpc = vi.fn().mockResolvedValue({ data: isRegistered, error: null });

  return {
    supabase: { from, rpc } as unknown as SupabaseClient,
    insert,
    rpc
  };
}

function supabaseWithPendingInvites() {
  const order = vi.fn().mockResolvedValue({ data: [], error: null });
  const gt = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ gt });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as SupabaseClient,
    select
  };
}

describe("household service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the initial household through the atomic RPC", async () => {
    const supabase = supabaseWithRpc({
      data: "10000000-0000-0000-0000-000000000001",
      error: null
    });

    await expect(createHousehold(supabase, "00000000-0000-0000-0000-0000000000a1", "Famiglia Bleve")).resolves.toBe(
      "10000000-0000-0000-0000-000000000001"
    );

    expect(supabase.rpc).toHaveBeenCalledWith("create_household", {
      household_name: "Famiglia Bleve"
    });
  });

  it("logs Supabase diagnostics without logging form input", async () => {
    const error = {
      code: "42501",
      details: "new row violates row-level security policy",
      hint: "Check create_household RPC deployment",
      message: "permission denied",
      status: 403
    };
    const supabase = supabaseWithRpc({ data: null, error });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createHousehold(supabase, "00000000-0000-0000-0000-0000000000a1", "Famiglia Segreta")).rejects.toEqual(error);

    expect(consoleError).toHaveBeenCalledWith("[households] Supabase operation failed", {
      operation: "create_household_rpc",
      code: "42501",
      message: "permission denied",
      details: "new row violates row-level security policy",
      hint: "Check create_household RPC deployment",
      status: 403
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Famiglia Segreta");
  });

  it("embeds member profiles through the user_id foreign key", async () => {
    const { supabase, select } = supabaseWithHouseholdMembers();

    await expect(getHouseholdMembers(supabase, "10000000-0000-0000-0000-000000000001")).resolves.toEqual([]);

    expect(select).toHaveBeenCalledWith("*, profiles!household_members_user_id_fkey(full_name, username)");
  });

  it("marks invites for already registered users", async () => {
    const { supabase, insert, rpc } = supabaseWithInviteLookup(true);

    const invite = await createHouseholdInvite(
      supabase,
      "10000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-0000000000a1",
      "anna@example.test"
    );

    expect(invite.isRegistered).toBe(true);
    expect(invite.token).toHaveLength(64);
    expect(rpc).toHaveBeenCalledWith("email_is_registered", { candidate_email: "anna@example.test" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        household_id: "10000000-0000-0000-0000-000000000001",
        invited_by: "00000000-0000-0000-0000-0000000000a1",
        email: "anna@example.test",
        status: "PENDING"
      })
    );
  });

  it("keeps a registration link token for users not registered yet", async () => {
    const { supabase } = supabaseWithInviteLookup(false);

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "new@example.test"
      )
    ).resolves.toMatchObject({ isRegistered: false });
  });

  it("loads household names for pending invite notifications", async () => {
    const { supabase, select } = supabaseWithPendingInvites();

    await expect(getPendingInvitesForCurrentUser(supabase)).resolves.toEqual([]);

    expect(select).toHaveBeenCalledWith("*, profiles!household_invites_invited_by_fkey(full_name), households(name)");
  });
});
