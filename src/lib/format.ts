import type { FundAccount, MovementType, PaymentMethod } from "@/generated/prisma/enums";
import type { IngredientKind } from "@/lib/constants";

export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);

/** Nominal ringkas untuk sumbu chart: 1.200.000 -> "1,2 jt". */
export const rupiahShort = (n: number) => {
  const abs = Math.abs(n);
  const [div, suffix] =
    abs >= 1_000_000_000
      ? [1_000_000_000, " M"]
      : abs >= 1_000_000
        ? [1_000_000, " jt"]
        : abs >= 1_000
          ? [1_000, " rb"]
          : [1, ""];
  const v = n / div;
  return (
    new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: div > 1 && Math.abs(v) < 10 ? 1 : 0,
    }).format(v) + suffix
  );
};

/** Selisih relatif dalam persen. Null jika basis 0 (persen tak bermakna). */
export const percentDelta = (current: number, previous: number) =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;

export const signedPercent = (n: number) =>
  `${n > 0 ? "+" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n)}%`;

// Zona waktu eksplisit: tanpa ini server (UTC) dan browser (WIB) merender
// tanggal berbeda, sehingga tanggal bergeser sehari dan hydration mismatch.
const TZ = "Asia/Jakarta";

export const date = (d: Date | string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: TZ }).format(new Date(d));

export const dateTime = (d: Date | string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(new Date(d));

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "Tunai",
  QRIS: "QRIS",
  TRANSFER: "Transfer",
  OTHER: "Lainnya",
};

export const FUND_ACCOUNT_LABEL: Record<FundAccount, string> = {
  operational: "Operasional",
  payroll: "Profit & Payroll",
  emergency: "Emergency & Growth",
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  stock_in: "Stok Masuk",
  stock_out: "Stok Keluar",
  adjustment: "Penyesuaian",
};

export const INGREDIENT_KIND_LABEL: Record<IngredientKind, string> = {
  bahan_baku: "Bahan Baku",
  topping: "Topping",
  packaging: "Packaging",
  olahan: "Bahan Olahan",
};
