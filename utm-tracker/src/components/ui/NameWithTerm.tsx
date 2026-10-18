"use client";

import { useState } from "react";
import { formatProjectName, parseProjectName, termOptions, type Term } from "@/lib/naming";

/**
 * "<Project name> <term>": a name field and a term picker (F'26 = fall 2026,
 * S'26 = spring 2026). Reports the full name, or "" until both are set.
 */
export function NameWithTerm({
  id,
  value,
  onChange,
  placeholder = "SheCodes",
  label = "Project name",
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const parsed = parseProjectName(value);
  const [base, setBase] = useState(parsed?.base ?? value);
  const [term, setTerm] = useState<Term | "">(parsed?.term ?? "");
  const options = termOptions();
  if (term && !options.includes(term)) options.push(term);

  const update = (b: string, t: Term | "") => {
    setBase(b);
    setTerm(t);
    onChange(b.trim().length >= 2 && t ? formatProjectName(b, t) : "");
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="label" htmlFor={id}>{label}</label>
          <input id={id} className="input" required minLength={2} maxLength={110} placeholder={placeholder}
            value={base} onChange={(e) => update(e.target.value, term)} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-term`}>Term</label>
          <select id={`${id}-term`} className="input" required value={term} onChange={(e) => update(base, e.target.value as Term | "")}>
            <option value="" disabled>Choose…</option>
            {options.map((t) => (
              <option key={t} value={t}>{t} · {t.startsWith("F") ? "fall" : "spring"} 20{t.slice(2)}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint">
        {base.trim() && term ? <>Saved as <strong className="text-ink">{formatProjectName(base, term)}</strong></> : "Name, then the term: F = fall, S = spring — e.g. SheCodes F'26."}
      </p>
    </div>
  );
}
