export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  const errors: string[] = [];
  const source = stripBom(text ?? "");
  const delimiter = detectDelimiter(source);
  let current = "";
  let row: string[] = [];
  let quoted = false;
  let rowNumber = 1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"' && (quoted || current.length === 0)) {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      rowNumber += 1;
    } else {
      current += char;
    }
  }

  if (quoted) {
    errors.push(`Virgolette non chiuse alla riga ${rowNumber}`);
  }

  row.push(current.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  const [headers = [], ...body] = rows;
  const duplicateHeaders = findDuplicateHeaders(headers);
  for (const header of duplicateHeaders) {
    errors.push(`Intestazione duplicata: ${header}`);
  }

  body.forEach((bodyRow, index) => {
    if (bodyRow.length !== headers.length) {
      errors.push(`Riga ${index + 2}: numero colonne ${bodyRow.length}, attese ${headers.length}`);
    }
  });

  if (headers.length === 0) {
    errors.push("Nessuna intestazione CSV trovata");
  }

  return { headers, rows: body, errors };
}

export function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
}

export function csvRowsToObjects(parsed: ParsedCsv): Array<Record<string, string>> {
  return parsed.rows.map((row) =>
    Object.fromEntries(parsed.headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function findDuplicateHeaders(headers: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const header of headers) {
    const key = header.trim().toLowerCase();
    if (seen.has(key)) {
      duplicates.add(header);
    }
    seen.add(key);
  }

  return [...duplicates];
}
