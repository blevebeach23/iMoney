import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/auth/validation";
import type { MovementFormInput } from "@/lib/movements/validation";

const mocks = vi.hoisted(() => ({
  createMovement: vi.fn(),
  createMovementBatch: vi.fn(),
  rebuildBalanceCaches: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  notifySharedMovement: vi.fn()
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

vi.mock("@/services/movements/movement-service", () => ({
  createMovement: mocks.createMovement,
  createMovementBatch: mocks.createMovementBatch,
  duplicateMovement: vi.fn(),
  getMovementById: vi.fn(),
  softDeleteMovement: vi.fn(),
  softDeleteMovementBatch: vi.fn(),
  updateMovement: vi.fn()
}));

vi.mock("@/services/transfers/transfer-service", () => ({
  softDeleteTransferBatch: vi.fn()
}));

vi.mock("@/services/movements/movement-request-service", () => ({
  acceptMovementRequest: vi.fn(),
  cancelMovementRequest: vi.fn(),
  createMovementRequest: vi.fn(),
  getMovementRequestById: vi.fn(),
  rejectMovementRequest: vi.fn()
}));

vi.mock("@/services/notifications/notification-service", () => ({
  notifySharedMovement: mocks.notifySharedMovement
}));

describe("movement actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createMovement.mockResolvedValue(movementResult("movement-single"));
    mocks.createMovementBatch.mockResolvedValue([movementResult("movement-batch")]);
    mocks.rebuildBalanceCaches.mockResolvedValue(undefined);
    mocks.notifySharedMovement.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  it("saves one new movement submitted by the multi-row form", async () => {
    const { saveMovementAction } = await import("@/lib/movements/actions");
    const formData = movementFormData([
      {
        occurredOn: "2026-09-03",
        description: "Spesa conto",
        categoryId: "20000000-0000-4000-8000-000000000001",
        type: "expense",
        amount: "12,50",
        containerId: "account:30000000-0000-4000-8000-000000000001",
        sharedWithFamily: true,
        householdId: "40000000-0000-4000-8000-000000000001",
        notes: "nota"
      }
    ]);

    await expect(saveMovementAction(emptyState(), formData)).rejects.toThrow("NEXT_REDIRECT:/movements");

    expect(mocks.createMovement).not.toHaveBeenCalled();
    expect(mocks.createMovementBatch).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000001",
      [
        expect.objectContaining({
          occurredOn: "2026-09-03",
          description: "Spesa conto",
          categoryId: "20000000-0000-4000-8000-000000000001",
          type: "expense",
          amount: "12.50",
          accountId: "30000000-0000-4000-8000-000000000001",
          fundId: null,
          sharedWithFamily: true,
          householdId: "40000000-0000-4000-8000-000000000001",
          notes: "nota"
        })
      ]
    );
  });

  it("saves multiple new movements in one batch", async () => {
    const { saveMovementAction } = await import("@/lib/movements/actions");
    const formData = movementFormData([
      {
        occurredOn: "2026-09-03",
        description: "Rimborso",
        categoryId: "20000000-0000-4000-8000-000000000001",
        type: "income",
        amount: "25",
        containerId: "account:30000000-0000-4000-8000-000000000001",
        isReimbursement: true,
        reimbursementForMovementId: "50000000-0000-4000-8000-000000000001"
      },
      {
        occurredOn: "2026-09-04",
        description: "Spesa fondo",
        categoryId: "20000000-0000-4000-8000-000000000002",
        type: "expense",
        amount: "40",
        containerId: "fund:60000000-0000-4000-8000-000000000001"
      }
    ]);

    await expect(saveMovementAction(emptyState(), formData)).rejects.toThrow("NEXT_REDIRECT:/movements");

    expect(mocks.createMovementBatch).toHaveBeenCalledWith(
      expect.anything(),
      "10000000-0000-4000-8000-000000000001",
      [
        expect.objectContaining({
          isReimbursement: true,
          reimbursementForMovementId: "50000000-0000-4000-8000-000000000001",
          accountId: "30000000-0000-4000-8000-000000000001",
          fundId: null
        }),
        expect.objectContaining({
          isReimbursement: false,
          reimbursementForMovementId: null,
          accountId: null,
          fundId: "60000000-0000-4000-8000-000000000001"
        })
      ]
    );
  });

  it("returns a useful validation message for invalid movement submits", async () => {
    const { saveMovementAction } = await import("@/lib/movements/actions");
    const formData = movementFormData([
      {
        occurredOn: "",
        description: "",
        categoryId: "",
        type: "expense",
        amount: "",
        containerId: ""
      }
    ]);

    await expect(saveMovementAction(emptyState(), formData)).resolves.toMatchObject({
      ok: false,
      message: "Controlla i dati del movimento"
    });
  });
});

function emptyState(): FormState {
  return { ok: false };
}

function movementFormData(rows: Array<Partial<MovementFormInput>>) {
  const formData = new FormData();
  formData.set("rowCount", String(rows.length));
  rows.forEach((row, index) => {
    formData.set(`rows[${index}].occurredOn`, String(row.occurredOn ?? ""));
    formData.set(`rows[${index}].description`, String(row.description ?? ""));
    formData.set(`rows[${index}].categoryId`, String(row.categoryId ?? ""));
    formData.set(`rows[${index}].type`, String(row.type ?? "expense"));
    formData.set(`rows[${index}].amount`, String(row.amount ?? ""));
    formData.set(`rows[${index}].containerId`, String(row.containerId ?? ""));
    formData.set(`rows[${index}].reimbursementForMovementId`, String(row.reimbursementForMovementId ?? ""));
    formData.set(`rows[${index}].householdId`, String(row.householdId ?? ""));
    formData.set(`rows[${index}].notes`, String(row.notes ?? ""));
    if (row.isReimbursement) {
      formData.set(`rows[${index}].isReimbursement`, "on");
    }
    if (row.sharedWithFamily) {
      formData.set(`rows[${index}].sharedWithFamily`, "on");
    }
  });
  return formData;
}

function movementResult(id: string) {
  return {
    id,
    householdId: null,
    accountId: "30000000-0000-4000-8000-000000000001",
    fundId: null,
    categoryId: "20000000-0000-4000-8000-000000000001",
    type: "expense",
    amount: "10",
    occurredOn: "2026-09-03",
    description: "Movimento",
    notes: "",
    isSharedWithHousehold: false,
    reimbursementForMovementId: null
  };
}
