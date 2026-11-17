import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

/** Error bisnis yang pesannya aman ditampilkan ke pengguna apa adanya. */
export class AppError extends Error {}

export function toSafeError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof z.ZodError) {
    // Pesan locale id sebagian sudah diawali "Input tidak valid"; jangan diulang.
    const msg = err.issues[0]?.message ?? "periksa kembali isian";
    return msg.startsWith("Input tidak valid") ? msg : `Input tidak valid: ${msg}`;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return "Data sudah ada (duplikat).";
      case "P2003":
        return "Data masih direferensikan oleh entitas lain.";
      case "P2025":
        return "Data tidak ditemukan.";
    }
  }
  // Pesan error lain (driver DB, TypeError, dll.) bisa membocorkan detail
  // internal, jadi hanya dicatat di server.
  console.error("[unexpected]", err);
  return "Terjadi kesalahan. Coba lagi.";
}
