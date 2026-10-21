import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileForm } from "@/components/ProfileForm";
import { currentActor } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";
import { allProjectGroups } from "@/lib/projectStats";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const actor = (await currentActor())!;
  const t = await getT();
  const folders = actor.role === "manager" ? (await allProjectGroups()).filter((g) => actor.projectKeys.includes(g.key)) : [];

  return (
    <>
      <PageHeader breadcrumb={t("Profile")} title={actor.name || actor.email} subtitle={[...new Set([actor.position, t(ROLE_LABEL[actor.role])]), actor.email].filter(Boolean).join(" · ")} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-display text-base font-semibold">{t("What you can do")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            <li>{t("See every dashboard, campaign, link, lead and project.")}</li>
            {actor.role === "admin" && <li>{t("Change everything: campaigns, links, numbers, reports, data, settings and the team.")}</li>}
            {actor.role === "manager" && <li>{t("Edit the campaigns, UTM links and numbers of your projects (below).")}</li>}
            {actor.role === "viewer" && <li>{t("Nothing to edit yet — an admin can make you a project manager.")}</li>}
          </ul>
          {actor.role === "manager" && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink">{t("Your projects")}</h3>
              {folders.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">{t("No projects assigned yet. Ask an admin.")}</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {folders.map((f) => (
                    <li key={f.key}>
                      <Link href={`/campaigns/projects/${f.key}`} className="text-accent hover:underline">{f.title} →</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {actor.owner ? (
          <section className="card p-5 text-sm text-ink-muted">
            <h2 className="font-display text-base font-semibold text-ink">{t("Owner login")}</h2>
            <p className="mt-3">{t("You are signed in with the owner e-mail and password set in Vercel (AUTH_EMAIL / AUTH_PASSWORD).")}</p>
            <p className="mt-2">{t("For a personal profile, create an account with the same e-mail on the sign-up page: it becomes an admin right away.")}</p>
          </section>
        ) : (
          <ProfileForm name={actor.name ?? ""} />
        )}
      </div>
    </>
  );
}
