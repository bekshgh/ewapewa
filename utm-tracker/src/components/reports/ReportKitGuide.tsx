"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

const PLACEHOLDER = "[Project Name]";
const NAME_KEY = "reportGuide.projectName";

export interface GuideLayout {
  label: string;
  sheets: { name: string; headings: string[] }[];
}

/** Clipboard API first; an off-screen textarea + execCommand when it is blocked (http, old browsers, iframes). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function CopyAction({ text, label, primary }: { text: string; label: string; primary?: boolean }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className={primary ? "btn-primary" : "btn-ghost"}
      onClick={async () => {
        setState((await copyText(text)) ? "ok" : "fail");
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      {state === "ok" ? t("Copied ✓") : state === "fail" ? t("Copy failed — select the text below") : label}
    </button>
  );
}

function Preview({ title, text }: { title: string; text: string }) {
  const t = useT();
  return (
    <details className="group rounded-xl border border-line bg-bg-base">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-ink">
        <span>{title}</span>
        <span className="text-xs text-ink-faint">
          {t("{n} lines", { n: text.split("\n").length })} <span className="inline-block transition group-open:rotate-90">›</span>
        </span>
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-line p-4 text-xs leading-relaxed text-ink-muted">{text}</pre>
    </details>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">{n}</span>
      <div className="min-w-0 pt-0.5">
        <p className="font-medium text-ink">{title}</p>
        <div className="mt-1 text-sm text-ink-muted">{children}</div>
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-bg-base px-1.5 py-0.5 text-[13px] text-clicks">{children}</code>;
}

const CAN = [
  "Numbers in the tables and KPI cards",
  "Text in KEY SIGNALS and on the Notes sheet",
  "Colours, fonts and column widths",
  "Delete the Charts and Cleaned Data sheets",
];
const CANNOT = [
  "Rename sheets (only the number prefix like “02 · ” is free)",
  "Change the UPPER-CASE headings that start with two spaces",
  "Rename table column labels",
  "Turn percentages or dates into text (“22.6%”)",
  "Paste formulas without saved values",
  "Add e-mails, phone numbers or names",
  "Save as anything but .xlsx",
];

export function ReportKitGuide({
  mainPrompt,
  skillReference,
  kit,
  layouts,
}: {
  mainPrompt: string;
  skillReference: string;
  kit: string;
  layouts: GuideLayout[];
}) {
  const t = useT();
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);
  const onName = (v: string) => {
    setName(v);
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {}
  };
  const project = name.trim();
  const fill = (s: string) => (project ? s.split(PLACEHOLDER).join(project) : s);
  const prompt = fill(mainPrompt + "\n" + skillReference);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="mb-1 font-display text-lg font-semibold">{t("What this is")}</h2>
        <p className="text-sm text-ink-muted">
          {t("Every project's Excel analysis must come out in the same layout, or Reports warns and skips sections. The report kit")}
          (<Code>report_kit.py</Code>) {t("builds the Registration or Feedback workbook exactly the way the site reads it, and its")}{" "}
          <Code>check_report</Code> {t("runs the same checks before you upload. You only give Claude the form export.")}
        </p>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">{t("Steps")}</h2>
        <div className="mb-5 max-w-md">
          <label className="label" htmlFor="guide-project">{t("Project name")}</label>
          <input
            id="guide-project"
            className="input"
            placeholder={t("e.g. Business Cup")}
            value={name}
            maxLength={80}
            onChange={(e) => onName(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-faint">
            {t("Replaces every")} <Code>{PLACEHOLDER}</Code> {t("in the copied prompt.")}
          </p>
        </div>
        <ol className="space-y-5">
          <Step n={1} title={t("Open a new Claude chat and attach two files")}>
            {t("The form export")} (<Code>.xlsx</Code>) {t("and")} <Code>report_kit.py</Code>.
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/reports/guide/kit" download className="btn-ghost">{t("Download report_kit.py")}</a>
              <CopyAction text={kit} label={t("Copy report_kit.py text")} />
            </div>
            <p className="mt-2 text-xs text-ink-faint">{t("If the attachment fails, paste the copied kit text at the end of your message (it becomes PART C of the prompt).")}</p>
          </Step>
          <Step n={2} title={t("Copy the prompt and paste it into the chat")}>
            <div className="mt-2">
              <CopyAction text={prompt} label={t("Copy prompt (Main + Copy/Paste 1)")} primary />
            </div>
            {!project && <p className="mt-2 text-xs text-accent">{t("Enter the project name above first, or replace {ph} by hand.", { ph: PLACEHOLDER })}</p>}
          </Step>
          <Step n={3} title={t("Send it and wait")}>
            {t("Claude cleans the export, builds the workbook with the kit and checks it. This takes a few minutes.")}
          </Step>
          <Step n={4} title={t("Check the reply")}>
            {t("It must contain")} <Code>check_report: PASS</Code>. {t("If not, reply:")} <Code>Run check_report and fix it</Code>.
          </Step>
          <Step n={5} title={t("Download the file and upload it on Reports")}>
            {t("The name follows")} <Code>Project_S_26_Registration_Form_Analysis.xlsx</Code> ({t("S = spring, F = fall")}). {t("Upload it on")}{" "}
            <a href="/reports" className="text-accent hover:underline">{t("Reports → Upload reports")}</a>.
          </Step>
        </ol>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">{t("What is being copied")}</h2>
        <div className="space-y-2">
          <Preview title={t("Main prompt")} text={fill(mainPrompt)} />
          <Preview title={t("Copy/Paste 1 (background notes on Excel)")} text={skillReference} />
          <Preview title="report_kit.py" text={kit} />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">{t("What you can / cannot change after downloading")}</h2>
        </div>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-line">
          {[
            { title: "You can change", items: CAN, mark: "✓", tone: "text-leads" },
            { title: "You cannot", items: CANNOT, mark: "✗", tone: "text-danger" },
          ].map((c, i) => (
            <div key={c.title} className={cn("px-6 py-4", i > 0 && "border-t border-line sm:border-t-0")}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t(c.title)}</p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                {c.items.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className={cn("shrink-0 font-semibold", c.tone)}>{c.mark}</span>
                    <span>{t(x)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {layouts.map((l) => (
          <div key={l.label} className="card p-6">
            <h2 className="mb-1 font-display text-lg font-semibold">{t("{type} sheets", { type: t(l.label) })}</h2>
            <p className="mb-3 text-xs text-ink-faint">{t("Sheet names the site reads, with the section headings it expects.")}</p>
            <ol className="space-y-2 text-sm">
              {l.sheets.map((s, i) => (
                <li key={s.name}>
                  <span className="font-medium text-ink">
                    {String(i + 1).padStart(2, "0")} · {s.name}
                  </span>
                  {s.headings.length > 0 && <p className="text-xs text-ink-faint">{s.headings.join(" · ")}</p>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}
