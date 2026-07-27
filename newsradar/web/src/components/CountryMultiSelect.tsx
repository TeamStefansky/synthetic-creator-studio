"use client";

import { COUNTRIES } from "@/lib/countries";
import { countryFlag } from "@/lib/format";

type Props = {
  label: string;
  hint?: string;
  selected: string[];
  onChange: (codes: string[]) => void;
};

export function CountryMultiSelect({ label, hint, selected, onChange }: Props) {
  const toggle = (code: string) => {
    const set = new Set(selected);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    onChange([...set]);
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      {hint ? <p className="mb-2 text-xs text-ink-faint">{hint}</p> : null}
      <div className="flex flex-wrap gap-1">
        {COUNTRIES.map((c) => {
          const active = selected.includes(c.code);
          return (
            <button
              key={c.code}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(c.code)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper text-ink-soft hover:border-ink"
              }`}
              title={c.name}
            >
              {countryFlag(c.code)} {c.code}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
