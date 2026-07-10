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

// Email-only list (one column, no header)
expectRow("buyer1@example.com\nbuyer2@example.com", 0, {
  fullName: "Buyer1",
  email: "buyer1@example.com",
  courseRef: "",
});
expectRow("buyer1@example.com\nbuyer2@example.com", 1, {
  fullName: "Buyer2",
  email: "buyer2@example.com",
});

// Gumroad-style export
expectRow(
  "email,full_name,product_permalink\nisaac@example.com,Isaac Newton,how-to-attract-buyers",
  0,
  { fullName: "Isaac Newton", email: "isaac@example.com", courseRef: "how-to-attract-buyers" },
);

// Header with email only (no name column)
const emailOnlyHeader = parseStudentCsv("email\nstudent@example.com");
assert.equal(emailOnlyHeader.rows[0]?.email, "student@example.com");
assert.equal(emailOnlyHeader.rows[0]?.fullName, "Student");

try {
  parseStudentCsv("PK\u0003\u0004binary");
  assert.fail("expected xlsx rejection");
} catch (err) {
  assert.match(String(err), /Excel/i);
}

console.log("PASS: student CSV parse tests");
