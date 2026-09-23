"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CERTIFICATE_FILTERS,
  DURATION_BUCKETS,
  LEARN_DIFFICULTIES,
  LEARN_SORTS,
  countActiveLearnFilters,
  learnDiscoveryHref,
  type LearnDiscoveryParams,
} from "@/lib/learn-discovery/discovery-shared";
import { LIBRARY_CATEGORIES } from "@/lib/content-factory/library-shared";

type Props = {
  initial: LearnDiscoveryParams;
  total?: number;
};

export function LearnDiscoveryToolbar({ initial, total }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [category, setCategory] = useState(initial.category);
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? "");
  const [duration, setDuration] = useState(initial.duration ?? "");
  const [certificate, setCertificate] = useState(initial.certificate);
  const [sort, setSort] = useState(initial.sort);

  const params = useMemo(
    (): LearnDiscoveryParams => ({
      q: q.trim(),
      category,
      difficulty: difficulty ? (difficulty as LearnDiscoveryParams["difficulty"]) : null,
      duration: duration ? (duration as LearnDiscoveryParams["duration"]) : null,
      certificate,
      sort,
      page: 1,
    }),
    [q, category, difficulty, duration, certificate, sort],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      router.replace(learnDiscoveryHref(params), { scroll: false });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [params, router]);

  const activeFilters = countActiveLearnFilters(params);

  function clearAll() {
    setQ("");
    setCategory("all");
    setDifficulty("");
    setDuration("");
    setCertificate("any");
    setSort("newest");
    router.replace("/learn", { scroll: false });
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="max-w-xl">
        <label htmlFor="learn-q" className="sr-only">
          Search learning paths
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="learn-q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, topic, objectives, or description"
            className="h-11 min-w-0 flex-1 rounded-xl border border-app bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            autoComplete="off"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="h-11 shrink-0 rounded-xl border border-app px-4 text-sm font-medium text-neutral-700 hover:border-brand"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as LearnDiscoveryParams["category"])}
          options={LIBRARY_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
        />
        <FilterSelect
          label="Difficulty"
          value={difficulty}
          onChange={setDifficulty}
          options={[{ value: "", label: "Any" }, ...LEARN_DIFFICULTIES.map((d) => ({ value: d, label: d }))]}
        />
        <FilterSelect
          label="Duration"
          value={duration}
          onChange={setDuration}
          options={[
            { value: "", label: "Any" },
            { value: "short", label: "Short (< 2h)" },
            { value: "medium", label: "Medium (2–6h)" },
            { value: "long", label: "Long (6h+)" },
          ]}
        />
        <FilterSelect
          label="Certificate"
          value={certificate}
          onChange={(v) => setCertificate(v as LearnDiscoveryParams["certificate"])}
          options={[
            { value: "any", label: "Any" },
            { value: "available", label: "Certificate available" },
            { value: "free", label: "Free certificate" },
            { value: "paid", label: "Certificate offered" },
          ]}
        />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as LearnDiscoveryParams["sort"])}
          options={LEARN_SORTS.map((s) => ({
            value: s,
            label:
              s === "newest"
                ? "Newest"
                : s === "updated"
                  ? "Recently updated"
                  : s === "shortest"
                    ? "Shortest"
                    : "Longest",
          }))}
        />
        {activeFilters > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="h-10 rounded-lg border border-app px-3 text-sm text-neutral-700 hover:border-brand"
          >
            Clear filters ({activeFilters})
          </button>
        ) : null}
      </div>

      {typeof total === "number" ? (
        <p className="text-sm text-neutral-600">
          {total} course{total === 1 ? "" : "s"} found
        </p>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const id = `learn-filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="min-w-[9rem]">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-app bg-white px-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      >
        {options.map((opt) => (
          <option key={opt.value || "any"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
