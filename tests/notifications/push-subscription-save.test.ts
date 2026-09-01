import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deletePushSubscription, savePushSubscription } from "@/services/notifications/notification-service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn()
}));

function supabaseWithUpsert(error: { code?: string; message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ upsert });

  return { from, upsert, client: { from } as unknown as SupabaseClient };
}

function adminSupabase() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });

  return { from, upsert, client: { from } as unknown as SupabaseClient };
}

describe("push subscription persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts or updates the current user's own subscription idempotently", async () => {
    const supabase = supabaseWithUpsert();

    await savePushSubscription(supabase.client, "user-1", {
      endpoint: "https://push.example/subscription-1",
      p256dh: "p256dh-key",
      auth: "auth-token",
      userAgent: "iPhone PWA"
    });

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        endpoint: "https://push.example/subscription-1",
        p256dh: "p256dh-key",
        auth: "auth-token",
        user_agent: "iPhone PWA",
        updated_at: expect.any(String)
      }),
      { onConflict: "endpoint" }
    );
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("handles duplicate stale endpoints server-side without widening RLS", async () => {
    const supabase = supabaseWithUpsert({
      code: "42501",
      message: "new row violates row-level security policy (USING expression) for table \"push_subscriptions\""
    });
    const admin = adminSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin.client);

    await savePushSubscription(supabase.client, "current-user", {
      endpoint: "https://push.example/stale",
      p256dh: "fresh-key",
      auth: "fresh-auth",
      userAgent: "iPhone PWA"
    });

    expect(createSupabaseAdminClient).toHaveBeenCalled();
    expect(admin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "current-user",
        endpoint: "https://push.example/stale",
        p256dh: "fresh-key",
        auth: "fresh-auth"
      }),
      { onConflict: "endpoint" }
    );
  });

  it("does not hide non-RLS subscription save failures", async () => {
    const supabase = supabaseWithUpsert({ code: "23514", message: "check constraint failed" });

    await expect(
      savePushSubscription(supabase.client, "user-1", {
        endpoint: "https://push.example/subscription-1",
        p256dh: "p256dh-key",
        auth: "auth-token"
      })
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("deletes only the current user's subscription endpoint", async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteBuilder = { eq: vi.fn().mockReturnValue({ eq: deleteEq }) };
    const deleteRows = vi.fn().mockReturnValue(deleteBuilder);
    const from = vi.fn().mockReturnValue({ delete: deleteRows });

    await deletePushSubscription({ from } as unknown as SupabaseClient, "user-1", "https://push.example/subscription-1");

    expect(deleteRows).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(deleteEq).toHaveBeenCalledWith("endpoint", "https://push.example/subscription-1");
  });
});
