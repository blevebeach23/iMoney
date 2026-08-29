"use client";

import { FileText, RotateCcw, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmImportAction, undoImportBatchAction } from "@/lib/imports/actions";
import { csvRowsToObjects, parseCsv } from "@/lib/imports/csv";
import { buildImportPreview, type ImportColumnKey, type ImportMapping, type ImportPreview } from "@/lib/imports/mapping";
import type { ActiveHouseholdOption } from "@/services/households/household-service";
import type { CategoryTreeItem } from "@/services/categories/category-service";
import type { Account, Category, Fund, ImportBatch, Movement } from "@/types/domain";

const fields: Array<{ key: ImportColumnKey; label: string }> = [
  { key: "date", label: "Data" },
  { key: "description", label: "Descrizione" },
  { key: "amount", label: "Importo" },
  { key: "type", label: "Tipo" },
  { key: "category", label: "Categoria" },
  { key: "container", label: "Account/Fund" },
  { key: "reimbursement", label: "Rimborso" },
  { key: "shared", label: "Condivisione famiglia" },
  { key: "notes", label: "Note" }
];

function flattenCategories(categoryTree: CategoryTreeItem[]): Category[] {
  return categoryTree.flatMap((macro) => macro.categories);
}

function containerOptions(accounts: Account[], funds: Fund[]) {
  return [
    ...accounts.map((account) => ({ value: `account:${account.id}`, label: `Conto / ${account.name}` })),
    ...funds.map((fund) => ({ value: `fund:${fund.id}`, label: `Fondo / ${fund.name}` }))
  ];
}

function initialColumns(headers: string[]): Partial<Record<ImportColumnKey, string>> {
  const lowerHeaders = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  return {
    date: lowerHeaders.get("data") ?? lowerHeaders.get("date"),
    description: lowerHeaders.get("descrizione") ?? lowerHeaders.get("description") ?? lowerHeaders.get("causale"),
    amount: lowerHeaders.get("importo") ?? lowerHeaders.get("amount"),
    type: lowerHeaders.get("tipo") ?? lowerHeaders.get("type"),
    category: lowerHeaders.get("categoria") ?? lowerHeaders.get("category"),
    container: lowerHeaders.get("conto") ?? lowerHeaders.get("account") ?? lowerHeaders.get("fondo"),
    reimbursement: lowerHeaders.get("rimborso"),
    shared: lowerHeaders.get("condiviso"),
    notes: lowerHeaders.get("note")
  };
}

export function ImportWorkflow({
  accounts,
  batches,
  categoryTree,
  existingMovements,
  funds,
  households
}: Readonly<{
  accounts: Account[];
  batches: ImportBatch[];
  categoryTree: CategoryTreeItem[];
  existingMovements: Movement[];
  funds: Fund[];
  households: ActiveHouseholdOption[];
}>) {
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [columns, setColumns] = useState<Partial<Record<ImportColumnKey, string>>>({});
  const [defaultCategoryId, setDefaultCategoryId] = useState(flattenCategories(categoryTree)[0]?.id ?? "");
  const [defaultContainerId, setDefaultContainerId] = useState(containerOptions(accounts, funds)[0]?.value ?? "");
  const [missingCategoryStrategy, setMissingCategoryStrategy] = useState<ImportMapping["missingCategoryStrategy"]>("default");
  const [macroCategoryIdForNew, setMacroCategoryIdForNew] = useState(categoryTree[0]?.id ?? "");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const defaultHousehold = households[0];
  const categories = useMemo(() => flattenCategories(categoryTree), [categoryTree]);
  const containers = useMemo(() => containerOptions(accounts, funds), [accounts, funds]);

  const mapping: ImportMapping = useMemo(
    () => ({
      columns,
      defaults: {
        categoryId: defaultCategoryId,
        containerId: defaultContainerId,
        type: "expense",
        sharedWithFamily: Boolean(defaultHousehold?.shareByDefault),
        householdId: defaultHousehold?.id ?? null,
        notes: "",
        macroCategoryIdForNew
      },
      missingCategoryStrategy
    }),
    [columns, defaultCategoryId, defaultContainerId, defaultHousehold?.id, defaultHousehold?.shareByDefault, macroCategoryIdForNew, missingCategoryStrategy]
  );
  const preview: ImportPreview | null = useMemo(
    () => (rows.length > 0 ? buildImportPreview({ rows, mapping, categories, accounts, funds, existingMovements }) : null),
    [accounts, categories, existingMovements, funds, mapping, rows]
  );
  const rowsToImport = preview?.rows.filter((row) => row.valid && row.movement && (allowDuplicates || !row.duplicateCandidate)).map((row) => row.movement) ?? [];
  const canImport = rowsToImport.length > 0 && Boolean(defaultCategoryId) && Boolean(defaultContainerId);

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const parsed = parseCsv(text);
    setFilename(file.name);
    setHeaders(parsed.headers);
    setRows(csvRowsToObjects(parsed));
    setColumns(initialColumns(parsed.headers));
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
        <div className="flex items-center gap-3">
          <FileText aria-hidden className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">File CSV</h2>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-sm file:font-semibold file:text-white"
        />
        {filename && <p className="text-sm font-semibold text-zinc-600">{filename}: {rows.length} righe lette</p>}
      </section>

      {headers.length > 0 && (
        <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
          <h2 className="text-lg font-semibold text-foreground">Mapping colonne</h2>
          {fields.map((field) => (
            <label key={field.key} className="block">
              <span className="text-sm font-semibold text-foreground">{field.label}</span>
              <select
                value={columns[field.key] ?? ""}
                onChange={(event) => setColumns((current) => ({ ...current, [field.key]: event.target.value || undefined }))}
                className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3"
              >
                <option value="">Default / non mappato</option>
                {headers.map((header) => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}

      {headers.length > 0 && (
        <section className="space-y-4 rounded-md border border-border bg-white p-4 shadow-panel">
          <h2 className="text-lg font-semibold text-foreground">Default e categorie</h2>
          <Select label="Categoria default" value={defaultCategoryId} onChange={setDefaultCategoryId} options={categories.map((category) => ({ value: category.id, label: category.name }))} />
          <Select label="Account/Fund default" value={defaultContainerId} onChange={setDefaultContainerId} options={containers} />
          <Select
            label="Categoria mancante"
            value={missingCategoryStrategy}
            onChange={(value) => setMissingCategoryStrategy(value as ImportMapping["missingCategoryStrategy"])}
            options={[
              { value: "default", label: "Usa categoria default" },
              { value: "create", label: "Crea nuova categoria" },
              { value: "skip", label: "Salta riga" }
            ]}
          />
          {missingCategoryStrategy === "create" && (
            <Select label="Macro per nuove categorie" value={macroCategoryIdForNew} onChange={setMacroCategoryIdForNew} options={categoryTree.map((macro) => ({ value: macro.id, label: macro.name }))} />
          )}
          {preview && preview.duplicateCandidates > 0 && (
            <label className="flex min-h-12 items-center gap-3 rounded-md border border-border px-3">
              <input type="checkbox" checked={allowDuplicates} onChange={(event) => setAllowDuplicates(event.target.checked)} className="h-5 w-5" />
              <span className="text-sm font-semibold">Importa anche candidati duplicati</span>
            </label>
          )}
        </section>
      )}

      {preview && (
        <section className="space-y-4">
          <div className="rounded-md border border-border bg-white p-4 shadow-panel">
            <h2 className="text-lg font-semibold text-foreground">Anteprima</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Valide {preview.validRows} · duplicate {preview.duplicateCandidates} · saltate {preview.skippedRows}
            </p>
          </div>
          <div className="space-y-3">
            {preview.rows.slice(0, 20).map((row) => (
              <article key={row.rowNumber} className="rounded-md border border-border bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-500">Riga {row.rowNumber}</p>
                    <h3 className="mt-1 font-bold">{row.movement?.description ?? "Non importabile"}</h3>
                    <p className="mt-1 text-sm text-zinc-600">{row.movement?.categoryName ?? row.errors.join(", ")}</p>
                  </div>
                  <p className="font-bold tabular-nums">EUR {row.movement?.amount ?? "-"}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  {row.duplicateCandidate && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">Possibile duplicato</span>}
                  {row.skipped && <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600">Saltata</span>}
                  {row.valid && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Valida</span>}
                  {row.errors.map((error) => <span key={error} className="rounded-md bg-red-50 px-2 py-1 text-red-700">{error}</span>)}
                </div>
              </article>
            ))}
          </div>
          <form action={confirmImportAction}>
            <input type="hidden" name="payload" value={JSON.stringify({ filename, rows: rowsToImport, macroCategoryIdForNew })} />
            <Button type="submit" disabled={!canImport} className="w-full">
              <Upload aria-hidden className="h-4 w-4" />
              Conferma import
            </Button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Import recenti</h2>
        {batches.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-zinc-600">Nessun import recente.</p>
        ) : (
          batches.map((batch) => (
            <article key={batch.id} className="rounded-md border border-border bg-white p-4 shadow-panel">
              <p className="font-semibold">{batch.sourceFilename}</p>
              <p className="mt-1 text-sm text-zinc-600">{batch.importedRows} righe importate</p>
              <form action={undoImportBatchAction} className="mt-3">
                <input type="hidden" name="batchId" value={batch.id} />
                <Button type="submit" variant="secondary" className="w-full">
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  Annulla import
                </Button>
              </form>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function Select({
  label,
  onChange,
  options,
  value
}: Readonly<{
  label: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
