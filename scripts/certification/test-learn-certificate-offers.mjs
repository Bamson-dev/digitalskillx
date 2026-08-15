/**
 * Stage 8 certificate-offer validator checks (offline).
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const {
  parseCertificateOfferPatch,
  recommendedCourseIsSelectable,
  isUniqueViolation,
  learningPathCertificateShareText,
  PATH_CERTIFICATE_ATTRIBUTION,
} = await import(pathToFileURL(join(root, "lib/learn-certificate-shared.ts")).href);

const enabled = parseCertificateOfferPatch({
  certificate_enabled: true,
  certificate_price_ngn: 1500,
  recommended_course_id: "1611149e-4530-4380-8ee8-5c02c38c25d7",
});
assert.equal(enabled.ok, true);

const disabledPrice = parseCertificateOfferPatch({
  certificate_enabled: true,
  certificate_price_ngn: 0,
});
assert.equal(disabledPrice.ok, false);

const missingPrice = parseCertificateOfferPatch({
  certificate_enabled: true,
  certificate_price_ngn: null,
});
assert.equal(missingPrice.ok, false);

assert.equal(
  recommendedCourseIsSelectable({
    courseId: "1611149e-4530-4380-8ee8-5c02c38c25d7",
    publishedCourseIds: [],
  }),
  false,
);
assert.equal(
  recommendedCourseIsSelectable({
    courseId: "1611149e-4530-4380-8ee8-5c02c38c25d7",
    publishedCourseIds: ["1611149e-4530-4380-8ee8-5c02c38c25d7"],
  }),
  true,
);
assert.equal(
  isUniqueViolation("duplicate key value violates unique constraint certificates_student_learning_path"),
  true,
);
assert.match(learningPathCertificateShareText("Linear Algebra"), /learning path Linear Algebra/);
assert.match(PATH_CERTIFICATE_ATTRIBUTION, /does not claim a partnership/);

console.log("PASS: Stage 8 certificate offer validators");
