import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPendingInviteNotifications } from "@/lib/households/notifications";
import {
  createHousehold,
  createHouseholdInvite,
  cancelHouseholdInvite,
  getHouseholdMembers,
  getPendingInvitesForCurrentUser,
  HouseholdInviteError
} from "@/services/households/household-service";

function supabaseWithRpc(result: { data: string | null; error: null | { code: string; details: string; hint: string; message: string; status: number } }) {
  return {
    rpc: vi.fn().mockResolvedValue(result)
  } as unknown as SupabaseClient;
}

function supabaseWithHouseholdMembers() {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

  return {
    supabase: { rpc } as unknown as SupabaseClient,
    rpc
  };
}

function supabaseWithInviteLookup(isRegistered: boolean) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name === "household_email_has_valid_member") {
      return Promise.resolve({ data: false, error: null });
    }

    if (name === "email_is_registered") {
      return Promise.resolve({ data: isRegistered, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  });

  return {
    supabase: { from, rpc } as unknown as SupabaseClient,
    insert,
    rpc
  };
}

function supabaseAdminInviteClient() {
  const inviteUserByEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    adminClient: {
      auth: {
        admin: {
          inviteUserByEmail
        }
      },
      from
    },
    from,
    inviteUserByEmail,
    update
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

function supabaseWithPendingInviteError() {
  const order = vi.fn().mockResolvedValue({
    data: null,
    error: { code: "PGRST500", message: "unexpected invite shape", details: null, hint: null, status: 500 }
  });
  const gt = vi.fn().mockReturnValue({ order });
  const eq = vi.fn().mockReturnValue({ gt });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return { from };
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

  it("loads household member display profiles through the server-side RPC", async () => {
    const { supabase, rpc } = supabaseWithHouseholdMembers();

    await expect(getHouseholdMembers(supabase, "10000000-0000-0000-0000-000000000001")).resolves.toEqual([]);

    expect(rpc).toHaveBeenCalledWith("get_household_members_for_display", {
      target_household_id: "10000000-0000-0000-0000-000000000001"
    });
  });

  it("marks invites for already registered users", async () => {
    const { supabase, insert, rpc } = supabaseWithInviteLookup(true);
    const adminClientFactory = vi.fn();

    const invite = await createHouseholdInvite(
      supabase,
      "10000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-0000000000a1",
      "anna@example.test",
      adminClientFactory
    );

    expect(invite.isRegistered).toBe(true);
    expect(invite.token).toHaveLength(64);
    expect(adminClientFactory).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("household_email_has_valid_member", {
      candidate_household_id: "10000000-0000-0000-0000-000000000001",
      candidate_email: "anna@example.test"
    });
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

  it("creates a household invite and sends a Supabase Auth email for an unregistered user", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://i-money-five.vercel.app");
    const { supabase, insert } = supabaseWithInviteLookup(false);
    const { adminClient, inviteUserByEmail } = supabaseAdminInviteClient();
    const adminClientFactory = vi.fn(() => adminClient);

    const invite = await createHouseholdInvite(
      supabase,
      "10000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-0000000000a1",
      "new@example.test",
      adminClientFactory
    );

    expect(invite.isRegistered).toBe(false);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.test", token: invite.token, status: "PENDING" }));
    expect(inviteUserByEmail).toHaveBeenCalledWith("new@example.test", {
      redirectTo: `https://i-money-five.vercel.app/auth/confirm?next=${encodeURIComponent(`/family/invites/${invite.token}`)}`,
      data: {
        household_invite_token: invite.token
      }
    });
  });

  it("rejects owner self-invites when the email already belongs to a valid household member", async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name === "household_email_has_valid_member") {
        return Promise.resolve({ data: true, error: null });
      }

      return Promise.resolve({ data: false, error: null });
    });
    const supabase = { from, rpc } as unknown as SupabaseClient;

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "owner@example.test"
      )
    ).rejects.toMatchObject(new HouseholdInviteError("already_member", "Questo utente fa già parte della famiglia."));

    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects invites for an active member already present in the household", async () => {
    const insert = vi.fn();
    const from = vi.fn().mockReturnValue({ insert });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const supabase = { from, rpc } as unknown as SupabaseClient;

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "member@example.test"
      )
    ).rejects.toMatchObject({
      code: "already_member",
      message: "Questo utente fa già parte della famiglia."
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps a registration link token for users not registered yet", async () => {
    const { supabase } = supabaseWithInviteLookup(false);
    const { adminClient } = supabaseAdminInviteClient();

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "new@example.test",
        () => adminClient
      )
    ).resolves.toMatchObject({ isRegistered: false });
  });

  it("expires the household invite and returns a clear message when Auth email delivery fails", async () => {
    const { supabase } = supabaseWithInviteLookup(false);
    const { adminClient, inviteUserByEmail, update } = supabaseAdminInviteClient();
    inviteUserByEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "email_failed", message: "SMTP failed", details: null, hint: null, status: 500 }
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "new@example.test",
        () => adminClient
      )
    ).rejects.toMatchObject({
      code: "email_delivery_failed",
      message: "Invito non inviato. Controlla la configurazione email e riprova."
    });

    expect(update).toHaveBeenCalledWith({ status: "EXPIRED" });
    expect(consoleError).toHaveBeenCalledWith("[households] Supabase operation failed", expect.objectContaining({ operation: "household_invite_auth_email" }));
  });

  it("returns a clear message when the server-side admin invite client is not configured", async () => {
    const { supabase, insert } = supabaseWithInviteLookup(false);
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    insert.mockResolvedValueOnce({ error: null });
    vi.mocked(supabase.from).mockReturnValueOnce({ insert } as never).mockReturnValueOnce({ update } as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      createHouseholdInvite(
        supabase,
        "10000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000a1",
        "new@example.test",
        () => {
          throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
        }
      )
    ).rejects.toMatchObject({
      code: "email_delivery_failed",
      message: "Invito non inviato. Configurazione email non disponibile."
    });

    expect(update).toHaveBeenCalledWith({ status: "EXPIRED" });
    expect(consoleError).toHaveBeenCalledWith("[households] Supabase operation failed", expect.objectContaining({ operation: "household_invite_admin_client" }));
  });

  it("loads household names for pending invite notifications", async () => {
    const { supabase, select } = supabaseWithPendingInvites();

    await expect(getPendingInvitesForCurrentUser(supabase)).resolves.toEqual([]);

    expect(select).toHaveBeenCalledWith("*, profiles!household_invites_invited_by_fkey(full_name), households(name)");
  });

  it("cancels a pending household invite through the server-side RPC", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: "10000000-0000-0000-0000-000000000001", error: null })
    } as unknown as SupabaseClient;

    await expect(cancelHouseholdInvite(supabase, "20000000-0000-0000-0000-000000000001")).resolves.toBe("10000000-0000-0000-0000-000000000001");
    expect(supabase.rpc).toHaveBeenCalledWith("cancel_household_invite", {
      invite_id: "20000000-0000-0000-0000-000000000001"
    });
  });

  it("degrades pending invite notifications without throwing a 500", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supabase = { from: supabaseWithPendingInviteError().from } as unknown as SupabaseClient;

    await expect(loadPendingInviteNotifications(supabase)).resolves.toEqual({
      invites: [],
      errorMessage: "Non è stato possibile caricare gli inviti. Riprova tra poco."
    });
    expect(consoleError).toHaveBeenCalledWith("[notifications] Pending household invites failed", {
      code: "PGRST500",
      message: "unexpected invite shape",
      details: null,
      hint: null,
      status: 500
    });
  });
});
