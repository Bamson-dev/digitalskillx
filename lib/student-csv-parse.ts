const NAME_HEADERS = new Set([
  "full_name",
  "fullname",
  "full name",
  "name",
  "student name",
  "student_name",
  "student",
  "studentname",
  "buyer name",
  "buyer_name",
  "customer name",
  "customer_name",
  "purchaser name",
  "purchaser_name",
]);

const EMAIL_HEADERS = new Set([
  "email",
  "email address",
  "e-mail",
  "mail",
  "student email",
  "student_email",
  "buyer email",
  "buyer_email",
  "customer email",
  "customer_email",
  "purchaser email",
  "purchaser_email",
  "contact email",
  "contact_email",
]);

const COURSE_HEADERS = new Set([
  "course",
  "course_name",
  "courses",
  "course title",
  "coursename",
  "product",
  "product name",
  "product_name",
  "product permalink",
  "product_permalink",
]);

/** Columns that look like “product/course” but are never course titles. */
const COURSE_HEADER_BLOCKLIST = new Set([
  "product id",
  "product_id",
  "product uuid",
  "sku",
  "sku id",
  "sku_id",
  "price",
  "amount",
  "currency",
  "quantity",
  "purchase date",
  "purchase_date",
  "sale date",
  "sale_date",
  "created at",
  "created_at",
  "updated at",
  "updated_at",
  "paid at",
  "paid_at",
  "date",
  "timestamp",
  "reference timestamp",
  "reference_timestamp",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_LIKE_RE =
  /^(?:\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?z?)?)$/i;
const MONEY_LIKE_RE = /^(?:₦|ngn|usd|\$|€|£)?\s*\d+(?:[.,]\d{1,2})?\s*(?:₦|ngn|usd|\$|€|£)?$/i;
const BOOL_LIKE_RE = /^(?:true|false|yes|no|y|n|0|1)$/i;

export function normalizeCsvHeader(cell: string) {
  return cell
    .replace(/\uFEFF/g, "")
    .replace(/\u0000/g, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanCsvCell(value: string) {
  return value.replace(/\uFEFF/g, "").replace(/\u0000/g, "").replace(/\u00A0/g, " ").trim();
}

export function cleanCsvEmail(value: string) {
  return cleanCsvCell(value).toLowerCase().replace(/\s+/g, "");
}

export function isCsvEmail(value: string) {
  return EMAIL_RE.test(cleanCsvEmail(value));
}

export function deriveStudentNameFromEmail(email: string) {
  const local = email.split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
  if (!local) return "Student";
  return local
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Reject Excel workbooks uploaded with a .csv extension. */
export function assertReadableStudentCsv(text: string) {
  const sample = text.replace(/\u0000/g, "").slice(0, 8);
  if (sample.startsWith("PK")) {
    throw new Error(
      "This file looks like Excel (.xlsx), not CSV. In Excel use File → Save As → CSV UTF-8 (Comma delimited) and upload that file.",
    );
  }
}

export function detectCsvDelimiter(sampleLine: string): "," | ";" | "\t" {
  const line = sampleLine.replace(/\u0000/g, "");
  let comma = 0;
  let semi = 0;
  let tab = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === ",") comma++;
    else if (char === ";") semi++;
    else if (char === "\t") tab++;
  }

  if (semi > comma && semi >= tab && semi > 0) return ";";
  if (tab > comma && tab > semi && tab > 0) return "\t";
  return ",";
}

export function parseCsvRow(line: string, delimiter = ","): string[] {
  const normalizedLine = line.replace(/\u0000/g, "");
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalizedLine.length; i++) {
    const char = normalizedLine[i];
    if (char === '"') {
      if (inQuotes && normalizedLine[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(cleanCsvCell(current));
      current = "";
      continue;
    }
    current += char;
  }

  result.push(cleanCsvCell(current));
  return result;
}

function splitCsvLines(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function headerIndex(headerCells: string[], candidates: Set<string>) {
  return headerCells.findIndex((cell) => candidates.has(normalizeCsvHeader(cell)));
}

function rowLooksLikeHeader(cells: string[]) {
  const normalized = cells.map(normalizeCsvHeader);
  const hasName = normalized.some(
    (cell) => NAME_HEADERS.has(cell) || cell.includes("name") || cell.includes("student"),
  );
  const hasEmail = normalized.some(
    (cell) => EMAIL_HEADERS.has(cell) || cell.includes("email") || cell.includes("mail"),
  );
  return hasName && hasEmail && !cells.some((cell) => isCsvEmail(cell));
}

function findEmailCellIndex(cells: string[]) {
  return cells.findIndex((cell) => isCsvEmail(cell));
}

function findNameCellIndex(cells: string[], emailIdx: number) {
  if (emailIdx < 0) {
    return cells.findIndex((cell) => cell && !isCsvEmail(cell) && !isNonCourseCsvValue(cell));
  }
  for (let i = 0; i < cells.length; i++) {
    if (i === emailIdx) continue;
    const cell = cells[i]?.trim() ?? "";
    if (cell && !isCsvEmail(cell) && !isNonCourseCsvValue(cell)) return i;
  }
  return -1;
}

/** Dates, prices, flags, and IDs must never become course refs (Gumroad/Excel extras). */
export function isNonCourseCsvValue(value: string) {
  const cell = cleanCsvCell(value);
  if (!cell) return true;
  if (isCsvEmail(cell)) return true;
  if (DATE_LIKE_RE.test(cell)) return true;
  if (MONEY_LIKE_RE.test(cell)) return true;
  if (BOOL_LIKE_RE.test(cell)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cell)) {
    return false; // UUID may be a course id — allow through
  }
  if (/^\d+$/.test(cell)) return true;
  return false;
}

function sanitizeCourseRef(value: string) {
  const cell = cleanCsvCell(value);
  if (!cell || isNonCourseCsvValue(cell)) return "";
  return cell;
}

function mapRowFromCells(
  cells: string[],
  indices: { nameIdx: number; emailIdx: number; courseIdx: number },
  options?: { allowLeftoverCourseGuess?: boolean },
) {
  let email =
    indices.emailIdx >= 0 ? cleanCsvEmail(cells[indices.emailIdx] ?? "") : "";
  let fullName =
    indices.nameIdx >= 0 ? cleanCsvCell(cells[indices.nameIdx] ?? "") : "";
  let courseRef =
    indices.courseIdx >= 0 ? sanitizeCourseRef(cells[indices.courseIdx] ?? "") : "";

  if (!email) {
    const emailIdx = findEmailCellIndex(cells);
    if (emailIdx >= 0) email = cleanCsvEmail(cells[emailIdx] ?? "");
    if (!fullName) {
      const nameIdx = findNameCellIndex(cells, emailIdx);
      if (nameIdx >= 0) fullName = cleanCsvCell(cells[nameIdx] ?? "");
    }
  }

  if (email && !fullName) {
    fullName = deriveStudentNameFromEmail(email);
  }

  // Only guess course from leftover cells for simple no-header rows (name,email,course).
  // With headers, unmatched / empty course columns must stay empty so the default course applies.
  if (!courseRef && options?.allowLeftoverCourseGuess) {
    const used = new Set<number>();
    if (indices.emailIdx >= 0) used.add(indices.emailIdx);
    if (indices.nameIdx >= 0) used.add(indices.nameIdx);
    const emailIdx = findEmailCellIndex(cells);
    if (emailIdx >= 0) used.add(emailIdx);
    const nameIdx = findNameCellIndex(cells, emailIdx);
    if (nameIdx >= 0) used.add(nameIdx);
    for (let i = 0; i < cells.length; i++) {
      if (used.has(i)) continue;
      const cell = sanitizeCourseRef(cells[i] ?? "");
      if (cell) {
        courseRef = cell;
        break;
      }
    }
  }

  return { fullName, email, courseRef };
}

export function parseStudentCsv(text: string): {
  header: boolean;
  rows: { rowNumber: number; cells: string[]; fullName: string; email: string; courseRef: string }[];
} {
  assertReadableStudentCsv(text);

  const normalized = text.replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
  const lines = splitCsvLines(normalized);
  if (lines.length === 0) return { header: false, rows: [] };

  const delimiter = detectCsvDelimiter(lines[0]);
  const first = parseCsvRow(lines[0], delimiter);
  const headerCells = first.map(normalizeCsvHeader);

  const nameIdx = headerIndex(first, NAME_HEADERS);
  const emailIdx = headerIndex(first, EMAIL_HEADERS);
  const courseIdx = headerIndex(first, COURSE_HEADERS);

  const hasHeader =
    (nameIdx >= 0 && emailIdx >= 0) ||
    emailIdx >= 0 ||
    rowLooksLikeHeader(first);

  const resolvedNameIdx =
    nameIdx >= 0
      ? nameIdx
      : headerCells.findIndex((cell) => cell.includes("name") || cell.includes("student"));
  const resolvedEmailIdx =
    emailIdx >= 0
      ? emailIdx
      : headerCells.findIndex((cell) => cell.includes("email") || cell.includes("mail"));
  const resolvedCourseIdx =
    courseIdx >= 0
      ? courseIdx
      : headerCells.findIndex((cell) => {
          if (COURSE_HEADER_BLOCKLIST.has(cell)) return false;
          if (cell.includes("product_id") || cell.includes("product id")) return false;
          if (cell.includes("date") || cell.includes("price") || cell.includes("amount")) {
            return false;
          }
          return cell.includes("course") || cell === "product" || cell.startsWith("product ");
        });

  const startIndex = hasHeader ? 1 : 0;
  const headerIndices = {
    nameIdx: resolvedNameIdx,
    emailIdx: resolvedEmailIdx,
    courseIdx: resolvedCourseIdx,
  };

  const rows = lines.slice(startIndex).map((line, offset) => {
    const cells = parseCsvRow(line, delimiter);
    const mapped =
      hasHeader && resolvedEmailIdx >= 0
        ? mapRowFromCells(cells, headerIndices, { allowLeftoverCourseGuess: false })
        : mapRowFromCells(cells, { nameIdx: -1, emailIdx: -1, courseIdx: -1 }, {
            allowLeftoverCourseGuess: true,
          });

    return {
      rowNumber: startIndex + offset + 1,
      cells,
      fullName: mapped.fullName,
      email: mapped.email,
      courseRef: mapped.courseRef,
    };
  });

  return { header: hasHeader, rows };
}
