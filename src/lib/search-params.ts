/** Ambil satu nilai string dari searchParams Next (yang bisa berupa array). */
export const sp = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

/** Nomor halaman 1-based. Nilai rusak ("abc", "1.5", "-2") jatuh ke halaman 1. */
export const pageParam = (v: string | string[] | undefined) =>
  Math.max(1, Math.floor(Number(sp(v))) || 1);
