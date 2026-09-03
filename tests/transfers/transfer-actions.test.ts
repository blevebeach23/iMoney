import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/auth/validation";
import type { TransferFormInput } from "@/lib/transfers/validation";

const mocks = vi.hoisted(() => ({
  createTransfer: vi.fn(),
  createTransferBatch: vi.fn(),
  updateTransfer: vi.fn(),
  rebuildBalanceCaches: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
        error: null
      })
    }
  })
}));

vi.mock("@/services/balances/balance-service", () => ({
  rebuildBalanceCaches: mocks.rebuildBalanceCaches
}));

vi.mock("@/services/transfers/transfer-service", () => ({
  createTransfer: mocks.createTransfer,
  createTransferBatch: mocks.createTransferBatch,
  softDeleteTransfer: vi.fn(),
  updateTransfer: mocks.updateTransfer
}));

describe("transfer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTransfer.mockResolvedValue("transfer-single");
    mocks.createTransferBatch.mockResolvedValue(["transfer-batch"]);
    mocks.updateTransfer.mockResolvedValue(undefined);
    mocks.rebuildBalanceCaches.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("saves one new transfer submitted by the multi-row form", async () => {
    const { saveTransferAction } = await import("@/lib/transfers/actions");
    const formData = transferFormData([
      {
        occurredOn: "2026-09-03",
        fromContainerId: "account:20000000-0000-4000-8000-000000000001",
        toContainerId: "fund:30000000-0000-4000-8000-000000000001",
        amount: "100,50",
        description: "Accantonamento",
        sharedWithFamily: true,
        householdId: "40000000-0000-4000-8000-000000000001"
      }
    ]);

    await expect(saveTransferAction(emptyState(), formData)).rejects.toThrow("NEXT_REDIRECT:/movements");

    expect(mocks.createTransfer).not.toHaveBeenCalled();
    expect(mocks.createTransferBatch).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000001",
      [
        expect.objectContaining({
          occurredOn: "2026-09-03",
          fromAccountId: "20000000-0000-4000-8000-000000000001",
          fromFundId: null,
          toAccountId: null,
          toFundId: "30000000-0000-4000-8000-000000000001",
          amount: "100.50",
          description: "Accantonamento",
          sharedWithFamily: true,
          householdId: "40000000-0000-4000-8000-000000000001"
        })
      ]
    );
  });

  it("saves multiple new transfers in one batch preserving source and destination containers", async () => {
    const { saveTransferAction } = await import("@/lib/transfers/actions");
    const formData = transferFormData([
      {
        occurredOn: "2026-09-03",
        fromContainerId: "account:20000000-0000-4000-8000-000000000001",
        toContainerId: "fund:30000000-0000-4000-8000-000000000001",
        amount: "100",
        description: "Fondo"
      },
      {
        occurredOn: "2026-09-04",
        fromContainerId: "fund:30000000-0000-4000-8000-000000000001",
        toContainerId: "account:20000000-0000-4000-8000-000000000002",
        amount: "40",
        description: "Rientro"
      }
    ]);

    await expect(saveTransferAction(emptyState(), formData)).rejects.toThrow("NEXT_REDIRECT:/movements");

    expect(mocks.createTransferBatch).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000001",
      [
        expect.objectContaining({
          fromAccountId: "20000000-0000-4000-8000-000000000001",
          fromFundId: null,
          toAccountId: null,
          toFundId: "30000000-0000-4000-8000-000000000001"
        }),
        expect.objectContaining({
          fromAccountId: null,
          fromFundId: "30000000-0000-4000-8000-000000000001",
          toAccountId: "20000000-0000-4000-8000-000000000002",
          toFundId: null
        })
      ]
    );
  });

  it("keeps legacy single-transfer submits on the update path", async () => {
    const { saveTransferAction } = await import("@/lib/transfers/actions");
    const formData = new FormData();
    formData.set("id", "50000000-0000-4000-8000-000000000001");
    formData.set("occurredOn", "2026-09-03");
    formData.set("fromContainerId", "account:20000000-0000-4000-8000-000000000001");
    formData.set("toContainerId", "account:20000000-0000-4000-8000-000000000002");
    formData.set("amount", "75");
    formData.set("description", "Modifica");

    await expect(saveTransferAction(emptyState(), formData)).rejects.toThrow("NEXT_REDIRECT:/movements");

    expect(mocks.createTransferBatch).not.toHaveBeenCalled();
    expect(mocks.updateTransfer).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        id: "50000000-0000-4000-8000-000000000001",
        fromAccountId: "20000000-0000-4000-8000-000000000001",
        toAccountId: "20000000-0000-4000-8000-000000000002"
      })
    );
  });

  it("returns a useful validation message for invalid transfer submits", async () => {
    const { saveTransferAction } = await import("@/lib/transfers/actions");
    const formData = transferFormData([
      {
        occurredOn: "",
        fromContainerId: "",
        toContainerId: "",
        amount: "",
        description: ""
      }
    ]);

    await expect(saveTransferAction(emptyState(), formData)).resolves.toMatchObject({
      ok: false,
      message: "Controlla i dati del trasferimento"
    });
  });
});

function emptyState(): FormState {
  return { ok: false };
}

function transferFormData(rows: Array<Partial<TransferFormInput>>) {
  const formData = new FormData();
  formData.set("rowCount", String(rows.length));
  rows.forEach((row, index) => {
    formData.set(`rows[${index}].occurredOn`, String(row.occurredOn ?? ""));
    formData.set(`rows[${index}].fromContainerId`, String(row.fromContainerId ?? ""));
    formData.set(`rows[${index}].toContainerId`, String(row.toContainerId ?? ""));
    formData.set(`rows[${index}].amount`, String(row.amount ?? ""));
    formData.set(`rows[${index}].description`, String(row.description ?? ""));
    formData.set(`rows[${index}].householdId`, String(row.householdId ?? ""));
    if (row.sharedWithFamily) {
      formData.set(`rows[${index}].sharedWithFamily`, "on");
    }
  });
  return formData;
}
