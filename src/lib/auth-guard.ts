import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/safe-error";

// cache(): layout dan page memanggil getSession di request yang sama;
// tanpa cache tiap panggilan memicu query session ke DB.
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/**
 * Guard untuk semua aksi yang mengubah data bisnis (penjualan, produk, bahan,
 * pengeluaran). Sesi yang valid saja tidak cukup: akun non-admin hanya boleh
 * membaca, sehingga tidak ada jalur privilege escalation lewat server action.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AppError("Anda tidak punya izin untuk tindakan ini");
  }
  return user;
}
