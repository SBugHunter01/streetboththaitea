// Domain finance logic — single source of truth for all financial calculations.
// Money is stored as integer rupiah (no decimals) to avoid floating-point errors.

export interface RecipeCost {
  quantity: number;
  costPerUnit: number;
}

export interface SaleItemInput {
  sellingPrice: number;
  hpp: number;
  quantity: number;
}

export interface SaleItemTotals {
  subtotal: number;
  totalHpp: number;
  grossProfit: number;
}

/** Buang noise floating-point pada kuantitas stok (0.1 + 0.2 → 0.3). */
export const roundQty = (n: number) => Math.round(n * 1e6) / 1e6;

const sumCost = (items: RecipeCost[]) => items.reduce((s, c) => s + c.quantity * c.costPerUnit, 0);

export function calcProductHpp(recipe: RecipeCost[]): number {
  return Math.round(sumCost(recipe));
}

export function calcSaleItemTotals(item: SaleItemInput): SaleItemTotals {
  const subtotal = Math.round(item.sellingPrice * item.quantity);
  const totalHpp = Math.round(item.hpp * item.quantity);
  return { subtotal, totalHpp, grossProfit: subtotal - totalHpp };
}

export function calcSaleTotals(items: SaleItemTotals[]): SaleItemTotals {
  return items.reduce(
    (acc, i) => ({
      subtotal: acc.subtotal + i.subtotal,
      totalHpp: acc.totalHpp + i.totalHpp,
      grossProfit: acc.grossProfit + i.grossProfit,
    }),
    { subtotal: 0, totalHpp: 0, grossProfit: 0 },
  );
}

export const calcGrossProfit = (revenue: number, hpp: number) => revenue - hpp;

export const calcNetProfit = (grossProfit: number, operatingExpenses: number) =>
  grossProfit - operatingExpenses;

/** Margin dalam persen, 2 desimal. 0 jika belum ada pendapatan. */
export const calcMargin = (profit: number, revenue: number) =>
  revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

export function calcUnitCost(packPrice: number, packSize: number): number {
  if (packSize <= 0) throw new Error("packSize harus > 0");
  return Math.round(packPrice / packSize);
}

export function calcBatchCost(components: RecipeCost[], outputQuantity: number): number {
  if (outputQuantity <= 0) throw new Error("outputQuantity harus > 0");
  return Math.round(sumCost(components) / outputQuantity);
}

export interface AllocationPct {
  operationalPct: number;
  payrollPct: number;
  emergencyPct: number;
}

export interface Allocation {
  operational: number;
  payroll: number;
  emergency: number;
}

/**
 * Bagi omzet ke tiga rekening. HPP selalu ke Operasional (modal bahan berikutnya);
 * sisa laba kotor dibagi sesuai persen. Saat rugi tidak ada laba untuk dibagi,
 * jadi seluruh omzet ke Operasional. Operasional = sisa, agar total selalu = omzet.
 */
export function calcAllocation(revenue: number, hpp: number, pct: AllocationPct): Allocation {
  const base = Math.max(0, calcGrossProfit(revenue, hpp));
  const payroll = Math.round((base * pct.payrollPct) / 100);
  // Jika dua bagian membulat naik, sisa rupiah diprioritaskan ke Payroll tanpa mengambil cadangan HPP.
  const emergency = Math.min(base - payroll, Math.round((base * pct.emergencyPct) / 100));
  return { operational: revenue - payroll - emergency, payroll, emergency };
}
