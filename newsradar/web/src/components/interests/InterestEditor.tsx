"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { CountryMatchMode, InterestOut } from "@/lib/api/types";
import { t } from "@/lib/strings.en";
import { CountryMultiSelect } from "@/components/CountryMultiSelect";
import { useDebounced } from "@/lib/use-debounced";

type FormState = {
  name: string;
  description: string;
  keywords: string[];
  sourceCountries: string[];
  subjectCountries: string[];
  matchMode: CountryMatchMode;
  similarity: number;
};

function fromInterest(i: InterestOut | null): FormState {
  return {
    name: i?.name ?? "",
    description: i?.description ?? "",
    keywords: i?.keywords ?? [],
    sourceCountries: i?.source_country_filter ?? [],
    subjectCountries: i?.subject_country_filter ?? [],
    matchMode: (i?.country_match_mode as CountryMatchMode) ?? "either",
    similarity: i?.min_semantic_similarity ?? 0.78,
  };
}

function toBody(f: FormState) {
  return {
    name: f.name,
    description: f.description,
    keywords: f.keywords,
    source_countries: f.sourceCountries.length ? f.sourceCountries : null,
    subject_countries: f.subjectCountries.length ? f.subjectCountries : null,
    country_match_mode: f.matchMode,
    min_semantic_similarity: f.similarity,
  };
}

export function InterestEditor({
  interest,
  onSaved,
  onDeleted,
  onPreviewBump,
}: {
  interest: InterestOut | null;
  onSaved: (i: InterestOut) => void;
  onDeleted: () => void;
  onPreviewBump: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromInterest(interest));
  const [kwDraft, setKwDraft] = useState("");
  const loadedId = useRef<string | null>(interest?.id ?? null);

  // Reset the form when a different interest is selected.
  useEffect(() => {
    setForm(fromInterest(interest));
    loadedId.current = interest?.id ?? null;
  }, [interest]);

  const debounced = useDebounced(form, 800);

  const create = useMutation({
    mutationFn: () => apiFetch<InterestOut>("/interests", { method: "POST", body: toBody(form) }),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ["interests"] });
      onSaved(i);
    },
  });

  const patch = useMutation({
    mutationFn: (id: string) =>
      apiFetch<InterestOut>(`/interests/${id}`, { method: "PATCH", body: toBody(debounced) }),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ["interests"] });
      onPreviewBump();
      onSaved(i);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/interests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interests"] });
      onDeleted();
    },
  });

  // Auto-save (debounced) for an existing interest so the live preview tracks
  // description/slider changes. Skips the initial load of a selection.
  useEffect(() => {
    if (!interest) return;
    if (loadedId.current !== interest.id) return;
    const changed = JSON.stringify(toBody(debounced)) !== JSON.stringify(toBody(fromInterest(interest)));
    if (changed && !patch.isPending) patch.mutate(interest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addKeyword = () => {
    const v = kwDraft.trim();
    if (v && !form.keywords.includes(v)) set("keywords", [...form.keywords, v]);
    setKwDraft("");
  };

  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-headline text-lg text-ink">
          {interest ? interest.name || "Edit interest" : t.interests.create}
        </h3>
        {interest ? (
          <button
            type="button"
            onClick={() => confirm(`Delete "${interest.name}"?`) && del.mutate(interest.id)}
            className="text-xs text-accent underline"
          >
            {t.interests.delete}
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="int-name" className="text-sm font-medium text-ink">
            {t.interests.name}
          </label>
          <input
            id="int-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="int-desc" className="text-sm font-medium text-ink">
            {t.interests.description}
          </label>
          <p className="text-xs text-ink-faint">{t.interests.descriptionHint}</p>
          <textarea
            id="int-desc"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-line bg-wash px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">{t.interests.keywords}</label>
          <p className="text-xs text-ink-faint">{t.interests.keywordsHint}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {form.keywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-full bg-wash px-2 py-0.5 text-xs"
              >
                {kw}
                <button
                  type="button"
                  aria-label={`Remove ${kw}`}
                  onClick={() => set("keywords", form.keywords.filter((k) => k !== kw))}
                  className="text-ink-faint hover:text-accent"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={kwDraft}
              onChange={(e) => setKwDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="+ keyword"
              className="w-24 rounded border border-line bg-paper px-2 py-0.5 text-xs"
            />
          </div>
        </div>

        <CountryMultiSelect
          label={t.interests.publishedIn}
          hint={t.filters.publishedInHint}
          selected={form.sourceCountries}
          onChange={(v) => set("sourceCountries", v)}
        />
        <CountryMultiSelect
          label={t.interests.about}
          hint={t.filters.aboutHint}
          selected={form.subjectCountries}
          onChange={(v) => set("subjectCountries", v)}
        />

        <div>
          <label htmlFor="int-mode" className="text-sm font-medium text-ink">
            {t.interests.matchMode}
          </label>
          <select
            id="int-mode"
            value={form.matchMode}
            onChange={(e) => set("matchMode", e.target.value as CountryMatchMode)}
            className="mt-1 block rounded border border-line bg-wash px-3 py-2 text-sm"
          >
            <option value="either">Either</option>
            <option value="source">Published in (source)</option>
            <option value="subject">About (subject)</option>
          </select>
        </div>

        <div>
          <label htmlFor="int-sim" className="text-sm font-medium text-ink">
            {t.interests.similarity} — {form.similarity.toFixed(2)}
          </label>
          <input
            id="int-sim"
            type="range"
            min={0.7}
            max={0.9}
            step={0.01}
            value={form.similarity}
            onChange={(e) => set("similarity", Number(e.target.value))}
            className="mt-1 w-full accent-[#a3231c]"
          />
          <div className="flex justify-between text-xs text-ink-faint">
            <span>{t.interests.similarityBroad}</span>
            <span>{t.interests.similarityPrecise}</span>
          </div>
        </div>

        {!interest ? (
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={!form.name.trim() || create.isPending}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-accent disabled:opacity-50"
          >
            {create.isPending ? t.interests.saving : t.interests.save}
          </button>
        ) : (
          <p className="text-xs text-ink-faint">
            {patch.isPending ? t.interests.saving : "Changes save automatically."}
          </p>
        )}
        {(create.isError || patch.isError) ? (
          <p className="text-sm text-accent">
            {((create.error || patch.error) as Error).message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
