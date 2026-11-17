import { randomInt } from "node:crypto";
import { localDateKey } from "@/lib/period";

// 6 digit acak dari CSPRNG: ~1 juta kombinasi per hari, jadi tabrakan
// invoiceNumber (unique constraint) praktis tidak terjadi walau POS dipakai
// ramai. Math.random() dengan 4 digit hanya punya 9.000 slot per hari.
// Tanggal mengikuti hari WIB, sama dengan laporan, bukan zona waktu server.
export function invoiceNumber(now: Date = new Date()): string {
  const rand = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return `INV-${localDateKey(now).replaceAll("-", "")}-${rand}`;
}
