import { Sidebar } from "@/components/Sidebar";
import { LiveClock } from "@/components/ui/LiveClock";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="relative flex-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <LiveClock className="absolute right-12 top-4 z-10 hidden lg:flex" />
        <div className="mx-auto w-full max-w-[1180px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
