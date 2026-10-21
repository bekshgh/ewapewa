import { PageHeader } from "@/components/ui/PageHeader";
import { CopyButton } from "@/components/ui/CopyButton";
import { Pill } from "@/components/ui/Pill";
import { prisma } from "@/lib/db";
import { getProjectSettings } from "@/lib/projects/settings";
import { ThresholdsForm } from "@/components/projects/ThresholdsForm";
import { AccessDenied } from "@/components/AccessDenied";
import { currentActor } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { LinkDomainsEditor } from "@/components/LinkDomainsEditor";
import { OldNamesFixer } from "@/components/OldNamesFixer";
import { linkDomains } from "@/lib/linkDomainsServer";
import { getLang, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://aieseckz.vercel.app";

function maskSecret(v: string | undefined): string {
  if (!v) return "";
  if (v.length <= 6) return "••••••";
  return v.slice(0, 3) + "••••••" + v.slice(-2);
}

/** A single environment variable row with a "set / missing" status. */
function EnvRow({
  name,
  value,
  required,
  hint,
  t,
}: {
  name: string;
  value: string | undefined;
  required?: boolean;
  hint: string;
  t: T;
}) {
  const isSet = Boolean(value && value.trim());
  const secret = /SECRET|SALT|URL/.test(name) && name !== "NEXT_PUBLIC_BASE_URL";
  return (
    <tr className="hover:bg-bg-hover/40">
      <td className="px-5 py-3.5 align-top">
        <div className="font-mono text-[13px] text-ink">{name}</div>
        <div className="mt-0.5 text-xs text-ink-faint">{t(hint)}</div>
      </td>
      <td className="px-5 py-3.5 align-top font-mono text-xs text-ink-muted">
        {isSet ? (secret ? maskSecret(value) : value) : <span className="text-ink-faint">—</span>}
      </td>
      <td className="px-5 py-3.5 text-right align-top">
        {isSet ? (
          <Pill label="set" tone="success" />
        ) : required ? (
          <Pill label="missing" tone="failed" />
        ) : (
          <Pill label="optional" tone="default" />
        )}
      </td>
    </tr>
  );
}

export default async function SettingsPage() {
  if (!isAdmin(await currentActor())) return <AccessDenied />;
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [thresholds, domains] = await Promise.all([getProjectSettings(prisma), linkDomains()]);
  const [links, clicks, leads, campaigns, webhookLogs] = await Promise.all([
    prisma.trackingLink.count(),
    prisma.clickEvent.count(),
    prisma.lead.count(),
    prisma.campaign.count(),
    prisma.webhookLog.count(),
  ]);

  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    IP_HASH_SALT: process.env.IP_HASH_SALT,
  };

  const stats = [
    { label: t("Tracking links"), value: links },
    { label: t("Clicks recorded"), value: clicks },
    { label: t("Leads attributed"), value: leads },
    { label: t("Campaigns"), value: campaigns },
    { label: t("Webhook events"), value: webhookLogs },
  ];

  return (
    <>
      <PageHeader breadcrumb={t("Settings")} title={t("Settings")} subtitle={t("Configuration, environment and data overview")} />

      {/* Workspace */}
      <section className="mb-8 animate-fade-up">
        <h2 className="mb-3 font-display text-lg font-semibold">{t("Workspace")}</h2>
        <div className="card p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="text-xs uppercase tracking-wide text-ink-faint">{t("Tracker base URL")}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg-base px-3 py-2 font-mono text-sm text-ink">
                  {BASE}
                </code>
                <CopyButton value={BASE} />
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">
                {t("Used to build short links")} <span className="font-mono">{BASE}/r/&#123;slug&#125;</span>.
              </p>
            </div>
            <div className="min-w-0">
              <label className="text-xs uppercase tracking-wide text-ink-faint">{t("Webhook endpoint")}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg-base px-3 py-2 font-mono text-sm text-ink">
                  {BASE}/api/webhooks/tilda-lead
                </code>
                <CopyButton value={`${BASE}/api/webhooks/tilda-lead`} />
              </div>
              <p className="mt-1.5 text-xs text-ink-faint">{t("Paste this into your form platform → Forms → Webhook.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Short link domains */}
      <section className="card mb-8 p-6">
        <h2 className="font-display text-lg font-semibold">{t("Short link domains")}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">{t("Domains a link can be handed out with, e.g. zimran-aiesec.vercel.app/r/… Pick one when creating or editing a link.")}</p>
        <LinkDomainsEditor domains={domains} />
      </section>

      {/* Old names */}
      <section className="card mb-8 p-6">
        <h2 className="font-display text-lg font-semibold">{t("Old names")}</h2>
        <p className="mb-4 mt-1 text-sm text-ink-muted">{t("Projects and campaigns named before the “Name F'26 / S'26” rule.")}</p>
        <OldNamesFixer />
      </section>

      {/* Environment */}
      <section className="mb-8 animate-fade-up">
        <h2 className="mb-1 font-display text-lg font-semibold">{t("Environment variables")}</h2>
        <p className="mb-3 text-sm text-ink-muted">
          {t("These are read from the server at runtime. On Vercel, set them under Project → Settings → Environment Variables.")}
        </p>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-3.5 font-medium">{t("Variable")}</th>
                  <th className="px-5 py-3.5 font-medium">{t("Value")}</th>
                  <th className="px-5 py-3.5 text-right font-medium">{t("Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <EnvRow name="DATABASE_URL" value={env.DATABASE_URL} required hint={t("Pooled PostgreSQL connection (app runtime)")} t={t} />
                <EnvRow name="DIRECT_URL" value={env.DIRECT_URL} required hint={t("Direct connection used for migrations")} t={t} />
                <EnvRow name="NEXT_PUBLIC_BASE_URL" value={env.NEXT_PUBLIC_BASE_URL} required hint={t("Public URL of this tracker")} t={t} />
                <EnvRow name="WEBHOOK_SECRET" value={env.WEBHOOK_SECRET} required hint={t("Shared secret that authorises the webhook")} t={t} />
                <EnvRow name="IP_HASH_SALT" value={env.IP_HASH_SALT} hint={t("Salt for hashing IPs (raw IPs are never stored)")} t={t} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Project thresholds */}
      <section className="card mb-8 p-6">
        <h2 className="font-display text-lg font-semibold">{t("Project thresholds")}</h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">{t("Used by the filters and quick views on the Projects page.")}</p>
        <ThresholdsForm initial={thresholds} />
      </section>

      {/* Data overview */}
      <section className="animate-fade-up">
        <h2 className="mb-3 font-display text-lg font-semibold">{t("Data overview")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="num text-2xl font-bold text-ink">{s.value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}</div>
              <div className="mt-1 text-xs text-ink-muted">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          {t("One shared workspace for the whole team: everyone sees the same data; roles decide who can change what.")}
        </p>
      </section>
    </>
  );
}
