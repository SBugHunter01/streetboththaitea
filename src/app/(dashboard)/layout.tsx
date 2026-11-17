import { requireUser } from "@/lib/auth-guard";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { DashboardHeader } from "@/components/dashboard-header";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader name={user.name} email={user.email} />
        {/* Padding bawah menyisakan ruang untuk nav mobile (48px) + bar
            checkout kasir, agar baris terakhir tabel tidak tertutup. */}
        <main className="mx-auto w-full max-w-360 flex-1 px-4 py-5 pb-36 sm:px-6 md:pb-8 lg:px-8">
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}