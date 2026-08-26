/**
 * Safe offline backfill report helper (does not touch production).
 * Prints how the pricing engine would classify example curricula.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { recommendLearnCertificatePrice } = await import(
  pathToFileURL(join(root, "lib/learn-certificate-pricing.ts")).href
);

const samples = [
  { name: "Marketing Fundamentals", hours: 1.5, lessons: 8, difficulty: "beginner" },
  { name: "Social Media Marketing Course", hours: 6, lessons: 18, difficulty: "intermediate" },
  { name: "Advanced Programming Path", hours: 14, lessons: 32, difficulty: "advanced", category: "Programming" },
  { name: "Large Data Analysis Learning Path", hours: 25, lessons: 45, difficulty: "advanced", category: "Data" },
];

for (const sample of samples) {
  const result = recommendLearnCertificatePrice({
    estimatedDurationSeconds: sample.hours * 3600,
    lessonCount: sample.lessons,
    difficulty: sample.difficulty,
    category: sample.category ?? null,
  });
  console.log(
    `${sample.name} → ₦${result.recommendedPriceNgn.toLocaleString("en-NG")} (${result.band})\n${result.reason}\n`,
  );
}
