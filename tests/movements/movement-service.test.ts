import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getSharedHouseholdMovementById } from "@/services/movements/movement-service";

describe("movement service", () => {
  it("loads a shared household movement by id without applying an owner filter", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const query = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle
    };
    const select = vi.fn(() => query);
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as unknown as SupabaseClient;

    await getSharedHouseholdMovementById(supabase, "10000000-0000-4000-8000-000000000001");

    expect(from).toHaveBeenCalledWith("movements");
    expect(query.eq).toHaveBeenCalledWith("id", "10000000-0000-4000-8000-000000000001");
    expect(query.eq).toHaveBeenCalledWith("shared_with_family", true);
    expect(query.eq).not.toHaveBeenCalledWith("owner_user_id", expect.any(String));
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  });
});
