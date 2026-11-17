import { redirect } from "next/navigation";
import { CircleDollarSign, PiggyBank, ShoppingCart } from "lucide-react";
import { getSession } from "@/lib/auth-guard";
import { LoginForm } from "./login-form";
import { CupSoda } from "lucide-react";

const HIGHLIGHTS = [
  {
    icon: ShoppingCart,
    title: "Kasir kilat",
    desc: "Catat penjualan dalam hitungan detik, stok terpotong otomatis.",
  },
  {
    icon: CircleDollarSign,
    title: "HPP otomatis",
    desc: "Harga pokok dihitung langsung dari resep tiap produk.",
  },
  {
    icon: PiggyBank,
    title: "Laba real-time",
    desc: "Pendapatan, pengeluaran, dan margin dalam satu laporan.",
  },
] as const;

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      {/* Panel brand: warna solid, tanpa blob blur. Ornamen gradient tidak
          membawa informasi dan justru menandai desain generik. */}
      <div className="hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <CupSoda className="size-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Streetboth</p>
            <p className="text-xs text-sidebar-foreground/60">ThaiTea Cheesy</p>
          </div>
        </div>

        <div className="max-w-md space-y-8">
          <p className="text-2xl font-semibold tracking-tight text-balance">
            Kelola kasir &amp; keuangan kedai dari satu tempat.
          </p>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-sidebar-foreground/60">
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-sidebar-foreground/40">
          Area internal — hanya untuk pemilik usaha.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          {/* Logo hanya di layar kecil, tempat panel brand tidak tampil.
              Satu <h1> untuk kedua breakpoint agar tidak ada judul ganda. */}
          <div className="mb-6">
            <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground lg:hidden">
              <CupSoda className="size-5.5" />
            </div>
            <h1>Masuk ke Streetboth</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Kasir &amp; manajemen keuangan ThaiTea Cheesy.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
