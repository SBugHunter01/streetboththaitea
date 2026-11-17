export type PeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "month"
  | "prevMonth"
  | "custom";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Hari Ini",
  yesterday: "Kemarin",
  "7d": "7 Hari Terakhir",
  month: "Bulan Ini",
  prevMonth: "Bulan Lalu",
  custom: "Periode kustom",
};

// --- Timezone WIB (Asia/Jakarta) helpers ---
// Semua tanggal bisnis periode laporan mengacu pada hari WIB,
// bukan server-local UTC, agar laporan per outlet Jakarta tidak bergeser.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of day (00:00:00 WIB) dinyatakan sebagai Date UTC yang equivalent. */
export function startOfDayWib(d: Date = new Date()): Date {
  const wib = new Date(d.getTime() + WIB_OFFSET_MS);
  const startWib = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
  return new Date(startWib.getTime() - WIB_OFFSET_MS);
}

/** End of day (23:59:59.999 WIB) dinyatakan sebagai Date UTC yang equivalent. */
export function endOfDayWib(d: Date = new Date()): Date {
  return new Date(startOfDayWib(d).getTime() + DAY_MS - 1);
}

/** "YYYY-MM-DD" yang benar-benar ada di kalender (menolak "2026-02-31"). */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

/** Parse "YYYY-MM-DD" sebagai tanggal lokal WIB (bukan UTC). Validasi dulu dengan isDateKey. */
export function parseWibDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - WIB_OFFSET_MS);
}

/** Kunci tanggal WIB "YYYY-MM-DD": untuk input type="date" dan pengelompokan chart. */
export function localDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function dateRange(
  period: PeriodKey,
  custom?: { from: string; to: string },
): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDayWib(now);
  switch (period) {
    case "today":
      return { from: today, to: endOfDayWib(now) };
    case "yesterday": {
      const y = new Date(today.getTime() - DAY_MS);
      return { from: y, to: endOfDayWib(y) };
    }
    case "7d":
      return { from: new Date(today.getTime() - 6 * DAY_MS), to: endOfDayWib(now) };
    case "month": {
      // Baca tahun/bulan dari jam WIB yang digeser, bukan UTC mentah — sekitar
      // pergantian bulan WIB bisa beda satu bulan penuh.
      const wib = new Date(now.getTime() + WIB_OFFSET_MS);
      const f = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - WIB_OFFSET_MS);
      return { from: f, to: endOfDayWib(now) };
    }
    case "prevMonth": {
      const wib = new Date(now.getTime() + WIB_OFFSET_MS);
      const y = wib.getUTCFullYear();
      const m = wib.getUTCMonth();
      const f = new Date(Date.UTC(y, m - 1, 1) - WIB_OFFSET_MS);
      return { from: f, to: endOfDayWib(new Date(Date.UTC(y, m, 0) - WIB_OFFSET_MS)) };
    }
    case "custom": {
      // Tanggal dari URL tidak dipercaya: yang rusak jatuh ke hari ini, dan
      // rentang terbalik ditukar alih-alih menghasilkan laporan kosong.
      const a = custom && isDateKey(custom.from) ? parseWibDate(custom.from) : today;
      const b = custom && isDateKey(custom.to) ? parseWibDate(custom.to) : today;
      const [from, to] = a <= b ? [a, b] : [b, a];
      return { from: startOfDayWib(from), to: endOfDayWib(to) };
    }
  }
}

/** Periode dari searchParams. Nilai `period` yang tidak dikenal jatuh ke "month". */
export function periodFromParams(params: { period?: string; from?: string; to?: string }) {
  const period: PeriodKey =
    params.period && Object.hasOwn(PERIOD_LABEL, params.period) ? (params.period as PeriodKey) : "month";
  return { period, ...dateRange(period, { from: params.from ?? "", to: params.to ?? "" }) };
}

/**
 * Rentang sepanjang durasi yang sama, tepat sebelum `from`.
 * Dipakai untuk pembanding periode ("vs periode sebelumnya") agar angka di
 * dashboard punya konteks, bukan cuma nominal telanjang.
 */
export function previousRange({ from, to }: { from: Date; to: Date }) {
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  return { from: new Date(prevTo.getTime() - span), to: prevTo };
}

/** Rentang satu bulan penuh dari "YYYY-MM" WIB. Null jika format tidak valid. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - WIB_OFFSET_MS);
  const to = new Date(Date.UTC(y, m, 0) - WIB_OFFSET_MS);
  return { from, to: endOfDayWib(to) };
}
