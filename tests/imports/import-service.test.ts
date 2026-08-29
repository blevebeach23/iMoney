import { describe, expect, it } from "vitest";
import { confirmImportSchema } from "@/lib/imports/validation";
import { buildImportBatchPayload, buildImportedMovementPayloads, buildUndoImportPatch, getAffectedContainerIds } from "@/services/imports/import-service";
import type { ImportMovementInput } from "@/services/imports/import-service";

const rows: ImportMovementInput[] = [
  {
    occurredOn: "2026-08-15",
    description: "Supermercato",
    amount: "25.00",
    type: "expense",
    categoryId: "00000000-0000-4000-8000-000000000001",
    accountId: "00000000-0000-4000-8000-000000000002",
    fundId: null,
    isReimbursement: false,
    sharedWithFamily: false,
    householdId: null,
    notes: "Carta"
  },
  {
    occurredOn: "2026-08-16",
    description: "Rimborso spesa",
    amount: "10.00",
    type: "income",
    categoryId: "00000000-0000-4000-8000-000000000001",
    accountId: null,
    fundId: "00000000-0000-4000-8000-000000000003",
    isReimbursement: true,
    sharedWithFamily: true,
    householdId: "00000000-0000-4000-8000-000000000004",
    notes: ""
  }
];

describe("import service payloads", () => {
  it("builds an import batch record", () => {
    expect(buildImportBatchPayload("user-1", "movimenti.csv", 2)).toEqual({
      owner_user_id: "user-1",
      source_filename: "movimenti.csv",
      imported_rows: 2
    });
  });

  it("links every imported movement to the batch", () => {
    const payloads = buildImportedMovementPayloads("user-1", "batch-1", rows);

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      owner_user_id: "user-1",
      import_batch_id: "batch-1",
      account_id: "00000000-0000-4000-8000-000000000002",
      fund_id: null,
      type: "expense",
      amount: "25.00"
    });
    expect(payloads[1]).toMatchObject({
      household_id: "00000000-0000-4000-8000-000000000004",
      shared_with_family: true,
      import_batch_id: "batch-1",
      type: "reimbursement"
    });
  });

  it("builds a soft-delete patch for undo import", () => {
    expect(buildUndoImportPatch("user-1", "2026-08-29T10:00:00.000Z")).toEqual({
      deleted_at: "2026-08-29T10:00:00.000Z",
      updated_by: "user-1"
    });
  });

  it("collects affected accounts and funds once for balance cache rebuild", () => {
    const affected = getAffectedContainerIds([...rows, rows[0]]);

    expect([...affected.accountIds]).toEqual(["00000000-0000-4000-8000-000000000002"]);
    expect([...affected.fundIds]).toEqual(["00000000-0000-4000-8000-000000000003"]);
  });

  it("validates import confirmation payloads server-side", () => {
    expect(() => confirmImportSchema.parse({ filename: "movimenti.csv", rows })).not.toThrow();
    expect(() =>
      confirmImportSchema.parse({
        filename: "movimenti.csv",
        rows: [{ ...rows[0], fundId: "00000000-0000-4000-8000-000000000003" }]
      })
    ).toThrow();
  });
});
