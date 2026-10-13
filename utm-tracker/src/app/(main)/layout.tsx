import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABEL, isAdmin } from "@/lib/permissions";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/api/auth/logout?reason=signin");
  if (actor.status !== "active") redirect(`/api/auth/logout?reason=${actor.status}`);
  const admin = isAdmin(actor);
  const pending = admin ? await prisma.user.count({ where: { status: "pending" } }) : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        user={{
          name: actor.name || actor.email,
          roleLabel: actor.owner ? "Owner · Admin" : actor.position || ROLE_LABEL[actor.role],
          admin,
          editor: admin || actor.role === "manager",
          pending,
        }}
      />
      <main className="flex-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <div className="mx-auto w-full max-w-[1180px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
