const NAME_HEADERS = new Set([
  "full_name",
  "fullname",
  "full name",
  "name",
  "student name",
  "student_name",
  "student",
  "studentname",
]);

const EMAIL_HEADERS = new Set([
  "email",
  "email address",
  "e-mail",
  "mail",
  "student email",
  "student_email",
]);

const COURSE_HEADERS = new Set([
  "course",
  "course_name",
  "courses",
  "course title",
  "coursename",
]);

export function normalizeCsvHeader(cell: string) {
  return cell
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanCsvCell(value: string) {
  return value.replace(/\uFEFF/g, "").replace(/\u00A0/g, " ").trim();
}

export function cleanCsvEmail(value: string) {
  return cleanCsvCell(value).toLowerCase().replace(/\s+/g, "");
}

/** Reject Excel workbooks uploaded with a .csv extension. */
export function assertReadableStudentCsv(text: string) {
  const sample = text.slice(0, 8);
  if (sample.startsWith("PK")) {
    throw new Error(
      "This file looks like Excel (.xlsx), not CSV. In Excel use File → Save As → CSV UTF-8 (Comma delimited) and upload that file.",
    );
  }
}

export function detectCsvDelimiter(sampleLine: string): "," | ";" | "\t" {
  let comma = 0;
  let semi = 0;
  let tab = 0;
  let inQuotes = false;

  for (let i = 0; i < sampleLine.length; i++) {
    const char = sampleLine[i];
    if (char === '"') {
      if (inQuotes && sampleLine[i + 1] === '"') {
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
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
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
  return hasName && hasEmail && !cells.some((cell) => cell.includes("@"));
}

export function parseStudentCsv(text: string): {
  header: boolean;
  rows: { rowNumber: number; cells: string[]; fullName: string; email: string; courseRef: string }[];
} {
  assertReadableStudentCsv(text);

  const normalized = text.replace(/^\uFEFF/, "").trim();
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { header: false, rows: [] };

  const delimiter = detectCsvDelimiter(lines[0]);
  const first = parseCsvRow(lines[0], delimiter);
  const headerCells = first.map(normalizeCsvHeader);

  const nameIdx = headerIndex(first, NAME_HEADERS);
  const emailIdx = headerIndex(first, EMAIL_HEADERS);
  const courseIdx = headerIndex(first, COURSE_HEADERS);

  const hasHeader =
    (nameIdx >= 0 && emailIdx >= 0) ||
    rowLooksLikeHeader(first);

  const resolvedNameIdx =
    nameIdx >= 0
      ? nameIdx
      : headerCells.findIndex(
          (cell) => cell.includes("name") || cell.includes("student"),
        );
  const resolvedEmailIdx =
    emailIdx >= 0
      ? emailIdx
      : headerCells.findIndex((cell) => cell.includes("email") || cell.includes("mail"));
  const resolvedCourseIdx =
    courseIdx >= 0
      ? courseIdx
      : headerCells.findIndex((cell) => cell.includes("course"));

  const startIndex = hasHeader ? 1 : 0;

  const rows = lines.slice(startIndex).map((line, offset) => {
    const cells = parseCsvRow(line, delimiter);
    let fullName = "";
    let email = "";
    let courseRef = "";

    if (hasHeader && resolvedNameIdx >= 0 && resolvedEmailIdx >= 0) {
      fullName = cleanCsvCell(cells[resolvedNameIdx] ?? "");
      email = cleanCsvEmail(cells[resolvedEmailIdx] ?? "");
      courseRef =
        resolvedCourseIdx >= 0 ? cleanCsvCell(cells[resolvedCourseIdx] ?? "") : "";
    } else if (cells.length >= 2 && cells[1]?.includes("@")) {
      fullName = cleanCsvCell(cells[0] ?? "");
      email = cleanCsvEmail(cells[1] ?? "");
      courseRef = cleanCsvCell(cells[2] ?? "");
    } else if (cells.length >= 2 && cells[0]?.includes("@")) {
      email = cleanCsvEmail(cells[0] ?? "");
      fullName = cleanCsvCell(cells[1] ?? "");
      courseRef = cleanCsvCell(cells[2] ?? "");
    } else {
      fullName = cleanCsvCell(cells[0] ?? "");
      email = cleanCsvEmail(cells[1] ?? "");
      courseRef = cleanCsvCell(cells[2] ?? "");
    }

    return {
      rowNumber: startIndex + offset + 1,
      cells,
      fullName,
      email,
      courseRef,
    };
  });

  return { header: hasHeader, rows };
}
