import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { duration, fieldLabel, formTitle, labelsOf } from "@/lib/formAnalytics/filters";
import { getLang, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  page_view: "Opened the page", section_view: "Scrolled to section", cta_click: "Clicked «Apply»", lang_switch: "Switched language",
  faq_open: "Opened a FAQ answer", form_view: "Form came into view", form_start: "Started the form", field_focus: "Entered",
  field_blur: "Left", field_change: "Chose", field_shown: "Question shown", field_hidden: "Question hidden", field_error: "Error",
  submit_attempt: "Send pressed", submit_blocked: "Sending blocked", submit_success: "Sent ✓", submit_error: "Sending failed",
  modal_open: "Saw the success popup", tg_join_click: "Clicked «Join Telegram chat»", abandon: "Left the page",
  form_closed_view: "Saw «applications closed»",
};

function describe(meta: Record<string, unknown> | null, labels: Record<string, string>, t: T): string {
  if (!meta) return "";
  const m = meta;
  const parts: string[] = [];
  if (typeof m.value === "string") parts.push(m.value);
  if (m.filled === true && m.valid === false) parts.push(t("filled, invalid"));
  else if (m.filled === true) parts.push(t("filled"));
  else if (m.filled === false) parts.push(t("empty"));
  else if (Array.isArray(m.filled)) parts.push(t("filled: {list}", { list: m.filled.map((k) => t(fieldLabel(String(k), labels))).join(", ") || t("nothing") }));
  if (typeof m.dur === "number") parts.push(duration(m.dur));
  if (typeof m.len === "number" && m.len) parts.push(t("{n} chars", { n: m.len }));
  if (Array.isArray(m.missing)) parts.push(t("missing: {list}", { list: m.missing.map((k) => t(fieldLabel(String(k), labels))).join(", ") }));
  for (const k of ["s", "from", "to", "q", "error", "city"]) if (typeof m[k] === "string") parts.push(`${k === "s" ? "" : k + ": "}${m[k]}`);
  if (typeof m.elapsed === "number") parts.push(t("after {time}", { time: duration(m.elapsed) }));
  return parts.join(" · ");
}

export default async function SessionPage(props: { params: Promise<{ id: string; sid: string }> }) {
  const { id: raw, sid } = await props.params;
  const id = decodeURIComponent(raw);
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const dt = lang === "ru" ? "ru-RU" : "en-GB";
  const s = await prisma.analyticsSession.findUnique({ where: { id: sid }, include: { events: { orderBy: [{ ts: "asc" }, { id: "asc" }] } } });
  if (!s || s.formId !== id) notFound();
  const form = await prisma.analyticsForm.findUnique({ where: { id }, select: { id: true, title: true, fields: true } });
  const labels = labelsOf(form?.fields);
  const answers = (s.answers as Record<string, string> | null) ?? {};

  return (
    <>
      <PageHeader
        breadcrumb={`${t("Forms")} · ${form ? formTitle(form) : id}`}
        title={t("Session {id}…", { id: s.id.slice(0, 10) })}
        subtitle={[t(s.outcome), s.device, s.lang?.toUpperCase(), s.country, s.utmSource && `utm_source: ${s.utmSource}`, s.utmCampaign && `utm_campaign: ${s.utmCampaign}`, s.isTest && t("test")].filter(Boolean).join(" · ")}
        action={<Link href={`/forms/${encodeURIComponent(id)}`} className="btn-ghost text-sm">← {t("Report")}</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="card overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {s.events.map((e) => (
                <tr key={e.id}>
                  <td className="num w-20 px-4 py-2 text-right text-xs text-ink-faint">+{duration(e.offsetMs)}</td>
                  <td className="px-3 py-2 text-ink">{LABEL[e.type] ? t(LABEL[e.type]) : e.type}{e.fieldId ? <span className="text-accent"> {t(fieldLabel(e.fieldId, labels))}</span> : null}</td>
                  <td className="px-4 py-2 text-ink-muted">{describe(e.meta as Record<string, unknown> | null, labels, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="card h-fit p-4 text-sm">
          <h2 className="font-display font-semibold">{t("Context")}</h2>
          <dl className="mt-2 space-y-1.5 text-ink-muted">
            <div>{t("Started:")} {s.startedAt.toLocaleString(dt, { timeZone: "Asia/Almaty" })}</div>
            <div>{t("Visitor:")} {s.visitorId.slice(0, 10)}…</div>
            {s.referrer && <div className="break-all">{t("Referrer:")} {s.referrer}</div>}
            {s.clickId && <div>{t("Tracker click:")} {s.clickId}</div>}
            {s.screenW ? <div>{t("Screen:")} {s.screenW}px</div> : null}
            {Object.entries(answers).map(([k, v]) => <div key={k}>{t(fieldLabel(k, labels))}: <span className="text-ink">{v}</span></div>)}
          </dl>
        </aside>
      </div>
    </>
  );
}
