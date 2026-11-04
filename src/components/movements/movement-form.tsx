"use client";

import { categoryOptionsForScope, categoryAfterScopeChange } from "@/lib/categories/scope";
import { useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage, PendingButton, SelectField, TextField } from "@/components/master-data/field-controls";
import { saveMovementAction } from "@/lib/movements/actions";
import { accountOptionLabel } from "@/lib/accounts/labels";
import type { FormState } from "@/lib/auth/validation";
import type { Account, Fund } from "@/types/domain";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { MovementListItem } from "@/services/movements/movement-service";

interface HouseholdOption {
  id: string;
  name: string;
  shareByDefault: boolean;
}

interface MovementRequestRecipientOption {
  userId: string;
  fullName: string;
  username: string;
}

const initialState: FormState = { ok: false };

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: accountOptionLabel(account) })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

export function MovementForm({
  accounts,
  categoryTree,
  funds,
  households,
  movement,
  returnTo = "/movements",
  requestRecipients = []
}: Readonly<{
  accounts: Account[];
  categoryTree: CategoryTreeItem[];
  funds: Fund[];
  households: HouseholdOption[];
  movement?: MovementListItem;
  returnTo?: string;
  requestRecipients?: MovementRequestRecipientOption[];
}>) {
  const [state, action] = useFormState(saveMovementAction, initialState);
  const [requestedForUserId, setRequestedForUserId] = useState("self");
  const [rows, setRows] = useState([0]);
  const today = new Date().toISOString().slice(0, 10);
  const allCategories = categoryTree.flatMap((macro) => macro.categories);
  const containers = containerOptions(accounts, funds);
  const defaultHousehold = households[0];
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(movement?.householdId ?? defaultHousehold?.id ?? "");
  const [sharedRows, setSharedRows] = useState<Record<number, boolean>>({0: movement?.isSharedWithHousehold ?? Boolean(defaultHousehold?.shareByDefault)});
  const [selectedCategories, setSelectedCategories] = useState<Record<number, string>>({0: movement?.categoryId ?? ""});
  function changeScope(row: number, shared: boolean) {
    const previous = sharedRows[row] ? selectedHouseholdId : null;
    const next = shared ? selectedHouseholdId : null;
    setSelectedCategories((current) => ({...current, [row]: categoryAfterScopeChange(previous, next, current[row] ?? "")}));
    setSharedRows((current) => ({...current, [row]: shared}));
  }
  const containerValue = movement?.accountId ? `account:${movement.accountId}` : movement?.fundId ? `fund:${movement.fundId}` : containers[0]?.value;
  const isRequestForOtherMember = !movement && requestedForUserId !== "self";
  const canUseMultipleRows = !movement && !isRequestForOtherMember;

  if (allCategories.length === 0 || (containers.length === 0 && requestRecipients.length === 0)) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-white p-4">
        <p className="font-semibold">Servono dati di base</p>
        <p className="text-sm leading-6 text-zinc-600">Prima di creare un movimento devi avere almeno una categoria attiva e, per i movimenti personali, un conto o fondo.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/accounts" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Conti
          </Link>
          <Link href="/settings/categories" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
            Categorie
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      {movement?.id && <input type="hidden" name="id" value={movement.id} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="householdId" value={selectedHouseholdId} />
      <input type="hidden" name="categoryOptions" value={JSON.stringify(categoryOptionsForScope(categoryTree, selectedHouseholdId || null))} />

      {households.length > 1 && !isRequestForOtherMember && <SelectField label="Famiglia" name="selectedHousehold" value={selectedHouseholdId} onChange={(event) => { setSelectedHouseholdId(event.target.value); setSelectedCategories({}); }} options={households.map((h) => ({value:h.id,label:h.name}))} />}
      {!movement && requestRecipients.length > 0 && (
        <SelectField
          label="Per conto di"
          name="requestedForUserId"
          value={requestedForUserId}
          onChange={(event) => {
            setRequestedForUserId(event.target.value);
            if (event.target.value !== "self") setSelectedHouseholdId(defaultHousehold?.id ?? "");
            setSelectedCategories({});
          }}
          options={[
            { value: "self", label: "Me stesso" },
            ...requestRecipients.map((member) => ({ value: member.userId, label: member.fullName || member.username || "Membro" }))
          ]}
          errors={state.fieldErrors}
        />
      )}

      {canUseMultipleRows && <input type="hidden" name="rowCount" value={rows.length} />}
      {(canUseMultipleRows ? rows : [0]).map((row, index) => {
        const shared = isRequestForOtherMember || Boolean(sharedRows[row]);
        const categories = categoryOptionsForScope(categoryTree, shared ? selectedHouseholdId : null);
        const prefix = canUseMultipleRows ? `rows[${index}].` : "";
        return (
          <fieldset key={row} className="space-y-4 rounded-md border border-border bg-white p-3">
            {canUseMultipleRows && (
              <div className="flex items-center justify-between gap-3">
                <legend className="font-semibold">Operazione {index + 1}</legend>
                {rows.length > 1 && (
                  <Button type="button" variant="secondary" onClick={() => setRows((items) => items.filter((item) => item !== row))}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                    Rimuovi
                  </Button>
                )}
              </div>
            )}
            <TextField label="Data" name={`${prefix}occurredOn`} type="date" defaultValue={movement?.occurredOn ?? today} errors={state.fieldErrors} />
            <TextField label="Descrizione" name={`${prefix}description`} defaultValue={movement?.description ?? ""} errors={state.fieldErrors} />
            <SelectField label="Categoria" name={`${prefix}categoryId`} value={selectedCategories[row] ?? ""} onChange={(event) => setSelectedCategories((current) => ({...current,[row]: event.target.value}))} required options={[{value:"",label:"Seleziona categoria"},...categories]} errors={state.fieldErrors} />
            <SelectField
              label="Tipo"
              name={`${prefix}type`}
              defaultValue={movement?.type === "reimbursement" ? "income" : movement?.type ?? "expense"}
              options={[
                { value: "expense", label: "Spesa" },
                { value: "income", label: "Entrata" }
              ]}
              errors={state.fieldErrors}
            />
            <TextField label="Importo" name={`${prefix}amount`} defaultValue={movement?.amount ?? ""} inputMode="decimal" errors={state.fieldErrors} />
            {isRequestForOtherMember ? (
              <p className="rounded-md border border-border bg-white p-3 text-sm leading-6 text-zinc-600">Il destinatario sceglierà il proprio conto o fondo quando accetta.</p>
            ) : (
              <SelectField label="Conto / Fondo" name={`${prefix}containerId`} defaultValue={containerValue} options={containers} errors={state.fieldErrors} />
            )}
            <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
              <input name={`${prefix}isReimbursement`} type="checkbox" defaultChecked={movement?.type === "reimbursement"} className="h-5 w-5" />
              <span className="text-sm font-semibold">Rimborso</span>
            </label>
            {isRequestForOtherMember ? (
              <input type="hidden" name={`${prefix}reimbursementForMovementId`} value="" />
            ) : (
              <TextField
                label="ID movimento spesa rimborsato"
                name={`${prefix}reimbursementForMovementId`}
                defaultValue={movement?.reimbursementForMovementId ?? ""}
                placeholder="Opzionale"
                errors={state.fieldErrors}
              />
            )}
            {canUseMultipleRows && (
              <>
                <input type="hidden" name={`${prefix}householdId`} value={selectedHouseholdId} />
                <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
                  <input name={`${prefix}sharedWithFamily`} type="checkbox" checked={Boolean(sharedRows[row])} onChange={(event) => changeScope(row,event.target.checked)} className="h-5 w-5" />
                  <span className="text-sm font-semibold">Condividi con famiglia</span>
                </label>
              </>
            )}
            <label className="block">
              <span className="text-sm font-semibold text-foreground">Note</span>
              <textarea
                name={`${prefix}notes`}
                defaultValue={movement?.notes ?? ""}
                className="mt-2 min-h-28 w-full rounded-md border border-border bg-white px-3 py-3 text-base outline-none ring-primary/20 transition focus:border-primary focus:ring-4"
              />
            </label>
          </fieldset>
        );
      })}

      {canUseMultipleRows && (
        <Button type="button" variant="secondary" className="w-full" onClick={() => setRows((items) => [...items, Math.max(...items) + 1])}>
          <Plus aria-hidden className="h-4 w-4" />
          Aggiungi operazione
        </Button>
      )}

      {households.length > 0 && !isRequestForOtherMember && !canUseMultipleRows && (
        <label className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-white px-3">
          <input
            name="sharedWithFamily"
            type="checkbox"
            checked={Boolean(sharedRows[0])}
            onChange={(event) => changeScope(0,event.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-sm font-semibold">Condividi con famiglia</span>
        </label>
      )}

      {isRequestForOtherMember && (
        <>
          <input type="hidden" name="sharedWithFamily" value="true" />
          <p className="rounded-md border border-border bg-white p-3 text-sm leading-6 text-zinc-600">La richiesta resterà visibile nella famiglia e diventerà contabile solo dopo l&apos;accettazione.</p>
        </>
      )}

      <PendingButton>
        <Save aria-hidden className="h-4 w-4" />
        {isRequestForOtherMember ? "Invia richiesta" : "Salva movimento"}
      </PendingButton>
      {movement && (
        <Link href={returnTo} className="flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-semibold">
          Annulla
        </Link>
      )}
    </form>
  );
}
