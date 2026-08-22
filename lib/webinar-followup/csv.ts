import { isValidEmail, normalizeEmail, MAX_CSV_ROWS, webinarPersonalFirstName } from "./constants";

export type CsvColumnGuess = {
  emailColumn: string | null;
  firstNameColumn: string | null;
  headers: string[];
};

export type ParsedCsvContact = {
  email: string;
  normalizedEmail: string;
  firstName: string | null;
  rowNumber: number;
};

export type CsvDryRunReport = {
  totalRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicatesInFile: number;
  alreadyInCampaign: number;
  suppressed: number;
  eligibleNew: number;
  willEnroll: number;
  sampleInvalid: string[];
  sampleExisting: string[];
  sampleSuppressed: string[];
  sampleNew: string[];
};

const EMAIL_HEADER_HINTS = [
  "email",
  "e-mail",
  "email address",
  "emailaddress",
  "attendee email",
  "registrant email",
  "buyer email",
  "mail",
];

const NAME_HEADER_HINTS = [
  "first name",
  "firstname",
  "first",
  "given name",
  "name",
  "full name",
  "fullname",
];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseCsvMatrix(raw: string): { headers: string[]; rows: string[][] } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length && rows.length < MAX_CSV_ROWS; i++) {
    rows.push(splitCsvLine(lines[i]!));
  }
  return { headers, rows };
}

function scoreHeader(header: string, hints: string[]): number {
  const h = header.trim().toLowerCase();
  if (!h) return 0;
  for (const hint of hints) {
    if (h === hint) return 100;
    if (h.includes(hint)) return 80;
  }
  return 0;
}

export function guessCsvColumns(headers: string[]): CsvColumnGuess {
  let emailColumn: string | null = null;
  let firstNameColumn: string | null = null;
  let bestEmail = 0;
  let bestName = 0;
  for (const header of headers) {
    const e = scoreHeader(header, EMAIL_HEADER_HINTS);
    if (e > bestEmail) {
      bestEmail = e;
      emailColumn = header;
    }
    const n = scoreHeader(header, NAME_HEADER_HINTS);
    if (n > bestName) {
      bestName = n;
      firstNameColumn = header;
    }
  }
  if (bestEmail < 50) emailColumn = null;
  if (bestName < 40) firstNameColumn = null;
  return { emailColumn, firstNameColumn, headers };
}

function firstNameFromValue(raw: string | undefined): string | null {
  return webinarPersonalFirstName(raw);
}

export function extractContactsFromCsv(params: {
  raw: string;
  emailColumn?: string | null;
  firstNameColumn?: string | null;
}): {
  guess: CsvColumnGuess;
  contacts: ParsedCsvContact[];
  invalidRows: Array<{ rowNumber: number; value: string }>;
  duplicatesInFile: number;
} {
  const { headers, rows } = parseCsvMatrix(params.raw);
  const guess = guessCsvColumns(headers);
  const emailCol = params.emailColumn?.trim() || guess.emailColumn;
  const nameCol = params.firstNameColumn?.trim() || guess.firstNameColumn;

  if (!emailCol) {
    return { guess, contacts: [], invalidRows: [], duplicatesInFile: 0 };
  }

  const emailIdx = headers.findIndex((h) => h === emailCol);
  const nameIdx = nameCol ? headers.findIndex((h) => h === nameCol) : -1;
  if (emailIdx < 0) {
    return { guess, contacts: [], invalidRows: [], duplicatesInFile: 0 };
  }

  const seen = new Set<string>();
  const contacts: ParsedCsvContact[] = [];
  const invalidRows: Array<{ rowNumber: number; value: string }> = [];
  let duplicatesInFile = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // 1-indexed + header
    const rawEmail = (row[emailIdx] ?? "").trim();
    if (!rawEmail) {
      invalidRows.push({ rowNumber, value: "" });
      continue;
    }
    const normalized = normalizeEmail(rawEmail);
    if (!isValidEmail(normalized)) {
      invalidRows.push({ rowNumber, value: rawEmail.slice(0, 120) });
      continue;
    }
    if (seen.has(normalized)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(normalized);
    const firstName =
      nameIdx >= 0 ? firstNameFromValue(row[nameIdx]) : null;
    contacts.push({
      email: normalized,
      normalizedEmail: normalized,
      firstName,
      rowNumber,
    });
  }

  return { guess, contacts, invalidRows, duplicatesInFile };
}

export function buildDryRunReport(params: {
  totalRows: number;
  contacts: ParsedCsvContact[];
  invalidCount: number;
  duplicatesInFile: number;
  alreadyInCampaign: Set<string>;
  suppressed: Set<string>;
}): CsvDryRunReport {
  const newOnes: ParsedCsvContact[] = [];
  let already = 0;
  let suppressedCount = 0;
  const sampleExisting: string[] = [];
  const sampleSuppressed: string[] = [];
  const sampleNew: string[] = [];

  for (const c of params.contacts) {
    if (params.suppressed.has(c.normalizedEmail)) {
      suppressedCount += 1;
      if (sampleSuppressed.length < 5) sampleSuppressed.push(c.normalizedEmail);
      continue;
    }
    if (params.alreadyInCampaign.has(c.normalizedEmail)) {
      already += 1;
      if (sampleExisting.length < 5) sampleExisting.push(c.normalizedEmail);
      continue;
    }
    newOnes.push(c);
    if (sampleNew.length < 5) sampleNew.push(c.normalizedEmail);
  }

  return {
    totalRows: params.totalRows,
    validEmails: params.contacts.length,
    invalidEmails: params.invalidCount,
    duplicatesInFile: params.duplicatesInFile,
    alreadyInCampaign: already,
    suppressed: suppressedCount,
    eligibleNew: newOnes.length,
    willEnroll: newOnes.length,
    sampleInvalid: [],
    sampleExisting,
    sampleSuppressed,
    sampleNew,
  };
}
