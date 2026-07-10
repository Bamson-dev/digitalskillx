import assert from "node:assert/strict";
import { parseStudentCsv } from "../lib/student-csv-parse";

function expectRow(
  text: string,
  index: number,
  expected: { fullName: string; email: string; courseRef?: string },
) {
  const { rows } = parseStudentCsv(text);
  assert.equal(rows[index]?.fullName, expected.fullName, `row ${index} name`);
  assert.equal(rows[index]?.email, expected.email, `row ${index} email`);
  if (expected.courseRef !== undefined) {
    assert.equal(rows[index]?.courseRef, expected.courseRef, `row ${index} course`);
  }
}

// Comma-separated with spaces after delimiter (common paste format)
expectRow(
  "full_name,email,course\nJane Akande, jane@example.com, Facebook Ad Mastery\nJohn Doe, john@example.com,",
  0,
  { fullName: "Jane Akande", email: "jane@example.com", courseRef: "Facebook Ad Mastery" },
);
expectRow(
  "full_name,email,course\nJane Akande, jane@example.com, Facebook Ad Mastery\nJohn Doe, john@example.com,",
  1,
  { fullName: "John Doe", email: "john@example.com", courseRef: "" },
);

// Semicolon Excel export (European locale)
expectRow(
  "full_name;email;course\nJane Akande;jane@example.com;Facebook Ad Mastery",
  0,
  { fullName: "Jane Akande", email: "jane@example.com", courseRef: "Facebook Ad Mastery" },
);

// Tab-separated
expectRow("full_name\temail\tcourse\nJane Akande\tjane@example.com\tFacebook Ad Mastery", 0, {
  fullName: "Jane Akande",
  email: "jane@example.com",
  courseRef: "Facebook Ad Mastery",
});

// Alternate header names
expectRow("Student Name,E-mail,Course Title\nJane Akande,jane@example.com,Facebook Ad Mastery", 0, {
  fullName: "Jane Akande",
  email: "jane@example.com",
  courseRef: "Facebook Ad Mastery",
});

// No header row
expectRow("Jane Akande,jane@example.com,Facebook Ad Mastery", 0, {
  fullName: "Jane Akande",
  email: "jane@example.com",
  courseRef: "Facebook Ad Mastery",
});

try {
  parseStudentCsv("PK\u0003\u0004binary");
  assert.fail("expected xlsx rejection");
} catch (err) {
  assert.match(String(err), /Excel/i);
}

console.log("PASS: student CSV parse tests");
