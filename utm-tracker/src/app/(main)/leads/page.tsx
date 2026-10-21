import Link from "next/link";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pill } from "@/components/ui/Pill";
import { prisma } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const NONE = "(none)";

type SP = { q?: string; campaign?: string; page?: string };

/**
 * All leads, newest first: search (name / e-mail / phone), a tab per campaign
 * and pages of 100. A lead that came through a tracker link shows that link's
 * source and campaign (like the reports); others show their own UTM.
 */
export default async function LeadsPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const t = await getT();
  const q = (sp.q ?? "").trim().slice(0, 100);
  const campaign = sp.campaign ?? "";
  const page = Math.max(1, Number(sp.page) || 1);

  const search: Prisma.LeadWhereInput = q
    ? { OR: ["name", "email", "phone"].map((f) => ({ [f]: { contains: q, mode: "insensitive" as const } })) }
    : {};
  const inCampaign: Prisma.LeadWhereInput = !campaign
    ? {}
    : campaign === NONE
      ? { OR: [{ trackingLink: { utmCampaign: null } }, { trackingLinkId: null, utmCampaign: null }] }
      : { OR: [{ trackingLink: { utmCampaign: campaign } }, { trackingLinkId: null, utmCampaign: campaign }] };
  const where: Prisma.LeadWhereInput = { AND: [search, inCampaign] };

  const [all, total, leads, tabs] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, email: true, phone: true, utmSource: true, utmCampaign: true, attributionStatus: true, submittedAt: true,
        trackingLink: { select: { slug: true, utmSource: true, utmCampaign: true } },
      },
    }),
    // a tab per campaign (the link's, else the lead's own), counted over all leads matching the search
    prisma.$queryRaw<{ campaign: string | null; n: bigint }[]>(Prisma.sql`
      SELECT COALESCE(t."utmCampaign", CASE WHEN l."trackingLinkId" IS NULL THEN l."utmCampaign" END) AS campaign, COUNT(*) AS n
      FROM "Lead" l LEFT JOIN "TrackingLink" t ON t.id = l."trackingLinkId"
      ${q ? Prisma.sql`WHERE l.name ILIKE ${`%${q}%`} OR l.email ILIKE ${`%${q}%`} OR l.phone ILIKE ${`%${q}%`}` : Prisma.empty}
      GROUP BY 1 ORDER BY 2 DESC`),
  ]);

  if (all === 0) {
    return (
      <>
        <PageHeader breadcrumb={t("Leads")} title={t("Leads")} subtitle={t("0 leads from forms")} />
        <EmptyState title={t("No leads yet")} description={t("Once your form fires its webhook, leads will appear here.")} ctaHref="/webhooks" ctaLabel={t("Set up the webhook")} />
      </>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: Partial<SP>) => {
    const x = new URLSearchParams();
    const v = { q, campaign, page: "1", ...p };
    if (v.q) x.set("q", v.q);
    if (v.campaign) x.set("campaign", v.campaign);
    if (v.page && v.page !== "1") x.set("page", v.page);
    const s = x.toString();
    return s ? `/leads?${s}` : "/leads";
  };
  const tabTotal = tabs.reduce((a, x) => a + Number(x.n), 0);

  return (
    <>
      <PageHeader breadcrumb={t("Leads")} title={t("Leads")} subtitle={t("Leads from forms: {n}", { n: formatNumber(all) })} />

      <form action="/leads" className="mb-4 flex flex-wrap gap-2">
        {campaign && <input type="hidden" name="campaign" value={campaign} />}
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder={t("Search by name, e-mail or phone")} aria-label={t("Search leads")} />
        <button type="submit" className="btn-ghost border border-line">{t("Search")}</button>
        {q && <Link href={href({ q: "" })} className="btn-ghost">{t("Clear")}</Link>}
      </form>

      <div className="mb-5 flex flex-wrap gap-2">
        {[{ key: "", label: t("All campaigns"), n: tabTotal }, ...tabs.map((x) => ({ key: x.campaign ?? NONE, label: x.campaign ?? t("No campaign"), n: Number(x.n) }))].map((tab) => (
          <Link
            key={tab.key || "all"}
            href={href({ campaign: tab.key })}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition ${campaign === tab.key ? "bg-accent text-black" : "bg-bg-raised text-ink-muted hover:text-ink"}`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-70">({formatNumber(tab.n)})</span>
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-3.5 font-medium">{t("Lead")}</th>
                <th className="px-5 py-3.5 font-medium">{t("Contact")}</th>
                <th className="px-5 py-3.5 font-medium">{t("Source / campaign")}</th>
                <th className="px-5 py-3.5 font-medium">{t("Attribution")}</th>
                <th className="px-5 py-3.5 font-medium">{t("Link")}</th>
                <th className="px-5 py-3.5 text-right font-medium">{t("Submitted")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {leads.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-faint">{t("No leads match.")}</td></tr>}
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-bg-hover/40">
                  <td className="px-5 py-3.5 font-medium text-ink">{l.name || t("Unnamed")}</td>
                  <td className="px-5 py-3.5 text-ink-muted"><div>{l.email || "—"}</div><div className="text-xs text-ink-faint">{l.phone || ""}</div></td>
                  <td className="px-5 py-3.5 text-ink-muted">
                    {(l.trackingLink ? l.trackingLink.utmSource : l.utmSource) || "—"}
                    <span className="text-ink-faint"> / {(l.trackingLink ? l.trackingLink.utmCampaign : l.utmCampaign) || "—"}</span>
                  </td>
                  <td className="px-5 py-3.5"><Pill label={l.attributionStatus} tone={l.attributionStatus} /></td>
                  <td className="px-5 py-3.5 text-clicks">{l.trackingLink ? `/r/${l.trackingLink.slug}` : "—"}</td>
                  <td className="px-5 py-3.5 text-right text-xs text-ink-faint">{formatDateTime(l.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
        <span>
          {total === 0 ? t("0 leads") : t("{from}–{to} of {total}", { from: formatNumber((page - 1) * PAGE_SIZE + 1), to: formatNumber(Math.min(page * PAGE_SIZE, total)), total: formatNumber(total) })}
        </span>
        {pages > 1 && (
          <div className="flex gap-2">
            {page > 1 && <Link href={href({ page: String(page - 1) })} className="btn-ghost border border-line">← {t("Newer")}</Link>}
            <span className="px-2 py-2">{t("Page {page} of {pages}", { page, pages })}</span>
            {page < pages && <Link href={href({ page: String(page + 1) })} className="btn-ghost border border-line">{t("Older")} →</Link>}
          </div>
        )}
      </div>
    </>
  );
}
