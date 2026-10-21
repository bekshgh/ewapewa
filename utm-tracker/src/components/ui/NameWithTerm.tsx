"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
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
  label,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const t = useT();
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
          <label className="label" htmlFor={id}>{label ?? t("Project name")}</label>
          <input id={id} className="input" required minLength={2} maxLength={110} placeholder={placeholder}
            value={base} onChange={(e) => update(e.target.value, term)} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-term`}>{t("Term")}</label>
          <select id={`${id}-term`} className="input" required value={term} onChange={(e) => update(base, e.target.value as Term | "")}>
            <option value="" disabled>{t("Choose…")}</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt} · {t(opt.startsWith("F") ? "fall" : "spring")} 20{opt.slice(2)}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="hint">
        {base.trim() && term ? <>{t("Saved as")} <strong className="text-ink">{formatProjectName(base, term)}</strong></> : t("Name, then the term: F = fall, S = spring — e.g. SheCodes F'26.")}
      </p>
    </div>
  );
}
