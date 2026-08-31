import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHousehold, getHouseholdMembers } from "@/services/households/household-service";

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
});
