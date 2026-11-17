import { prisma } from "@/lib/db";
import { calcGrossProfit, calcMargin, calcNetProfit } from "@/lib/finance";
import { localDateKey, startOfDayWib } from "@/lib/period";

export interface ProfitSummary {
  revenue: number;
  hpp: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

export interface SalesSummary {
  totalTransactions: number;
  itemsSold: number;
  revenue: number;
  averageOrderValue: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: { name: string; amount: number }[];
}

export interface IngredientUsageItem {
  name: string;
  unit: string;
  quantity: number;
}

const completedSales = (from: Date, to: Date) => ({ createdAt: { gte: from, lte: to }, status: "COMPLETED" as const });
const expensesIn = (from: Date, to: Date) => ({ expenseDate: { gte: from, lte: to } });
// Kas pembelian persediaan dilaporkan di Pengeluaran/Rekening; laba rugi sudah mengakui bahan terjual lewat HPP.
const operatingExpensesIn = (from: Date, to: Date) => ({
  ...expensesIn(from, to),
  category: { isInventoryPurchase: false },
});

export async function salesSummary(from: Date, to: Date): Promise<SalesSummary> {
  const [totals, products] = await Promise.all([
    prisma.sale.aggregate({ where: completedSales(from, to), _count: true, _sum: { total: true } }),
    prisma.saleItem.groupBy({
      by: ["productNameSnapshot"],
      where: { sale: completedSales(from, to) },
      _sum: { quantity: true, subtotal: true },
    }),
  ]);
  const totalTransactions = totals._count;
  const revenue = totals._sum.total ?? 0;
  const topProducts = products
    .map((p) => ({ name: p.productNameSnapshot, quantity: p._sum.quantity ?? 0, revenue: p._sum.subtotal ?? 0 }))
    .sort((a, b) => b.quantity - a.quantity);
  return {
    totalTransactions,
    itemsSold: topProducts.reduce((s, p) => s + p.quantity, 0),
    revenue,
    averageOrderValue: totalTransactions > 0 ? Math.round(revenue / totalTransactions) : 0,
    topProducts,
  };
}

export async function expenseSummary(from: Date, to: Date): Promise<ExpenseSummary> {
  const [groups, categories] = await Promise.all([
    prisma.expense.groupBy({ by: ["categoryId"], where: expensesIn(from, to), _sum: { amount: true }, _count: true }),
    prisma.category.findMany({ where: { type: "expense" } }),
  ]);
  const name = new Map(categories.map((c) => [c.id, c.name]));
  // Digabung per nama (bukan id): nama kategori tidak unik, dan UI memakai nama sebagai key.
  const byName = new Map<string, number>();
  for (const g of groups) {
    const n = name.get(g.categoryId) ?? "Lainnya";
    byName.set(n, (byName.get(n) ?? 0) + (g._sum.amount ?? 0));
  }
  return {
    total: groups.reduce((s, g) => s + (g._sum.amount ?? 0), 0),
    count: groups.reduce((s, g) => s + g._count, 0),
    byCategory: [...byName.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function profitSummary(from: Date, to: Date): Promise<ProfitSummary> {
  const [sales, expenses] = await Promise.all([
    prisma.sale.aggregate({ where: completedSales(from, to), _sum: { total: true, totalHpp: true } }),
    prisma.expense.aggregate({ where: operatingExpensesIn(from, to), _sum: { amount: true } }),
  ]);
  const revenue = sales._sum.total ?? 0;
  const hpp = sales._sum.totalHpp ?? 0;
  const grossProfit = calcGrossProfit(revenue, hpp);
  const operatingExpenses = expenses._sum.amount ?? 0;
  const netProfit = calcNetProfit(grossProfit, operatingExpenses);
  return {
    revenue,
    hpp,
    grossProfit,
    operatingExpenses,
    netProfit,
    grossMargin: calcMargin(grossProfit, revenue),
    netMargin: calcMargin(netProfit, revenue),
  };
}

export async function dailySeries(from: Date, to: Date) {
  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({ where: completedSales(from, to), select: { createdAt: true, total: true, totalHpp: true } }),
    prisma.expense.findMany({
      where: expensesIn(from, to),
      select: { expenseDate: true, amount: true, category: { select: { isInventoryPurchase: true } } },
    }),
  ]);
  const days = new Map<string, { revenue: number; hpp: number; expense: number; operatingExpense: number }>();
  const day = (k: string) => {
    const cur = days.get(k) ?? { revenue: 0, hpp: 0, expense: 0, operatingExpense: 0 };
    days.set(k, cur);
    return cur;
  };
  for (const s of sales) {
    const cur = day(localDateKey(s.createdAt));
    cur.revenue += s.total;
    cur.hpp += s.totalHpp;
  }
  for (const e of expenses) {
    const cur = day(localDateKey(e.expenseDate));
    cur.expense += e.amount;
    if (!e.category.isInventoryPurchase) cur.operatingExpense += e.amount;
  }

  const out = [];
  // Batasi panjang chart (~1 tahun) agar rentang kustom ekstrem tidak membuat ribuan titik.
  const start = startOfDayWib(from);
  const limit = new Date(start.getTime() + 370 * 24 * 60 * 60 * 1000);
  const end = to < limit ? to : limit;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = localDateKey(d);
    const v = days.get(date) ?? { revenue: 0, hpp: 0, expense: 0, operatingExpense: 0 };
    const grossProfit = calcGrossProfit(v.revenue, v.hpp);
    out.push({ date, ...v, grossProfit, netProfit: calcNetProfit(grossProfit, v.operatingExpense) });
  }
  return out;
}

/**
 * Pemakaian bahan pada periode: konsumsi transaksi selesai yang dibuat dalam
 * periode (bersih dari edit; transaksi void tidak dihitung, sama seperti omzet)
 * ditambah bahan yang dipakai produksi batch dalam periode.
 */
export async function ingredientUsage(from: Date, to: Date): Promise<IngredientUsageItem[]> {
  const [sales, movements] = await Promise.all([
    prisma.sale.findMany({ where: completedSales(from, to), select: { id: true } }),
    // Movement transaksi selalu dibuat >= waktu transaksi (edit bisa sesudah `to`),
    // jadi cukup batasi dari `from` lalu saring per transaksi di bawah. Tidak
    // memakai `referenceId IN (...)` karena SQLite membatasi jumlah parameter.
    prisma.inventoryMovement.findMany({
      where: {
        OR: [
          { referenceType: "sale", type: { in: ["stock_out", "stock_in"] }, createdAt: { gte: from } },
          { referenceType: "production", type: "stock_out", createdAt: { gte: from, lte: to } },
        ],
      },
      select: { ingredientId: true, type: true, quantity: true, referenceType: true, referenceId: true },
    }),
  ]);
  const saleIds = new Set(sales.map((s) => s.id));
  const net = new Map<string, number>();
  for (const m of movements) {
    if (m.referenceType === "sale" && !saleIds.has(m.referenceId ?? "")) continue;
    net.set(m.ingredientId, (net.get(m.ingredientId) ?? 0) + (m.type === "stock_out" ? m.quantity : -m.quantity));
  }
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: [...net.keys()] } },
    select: { id: true, name: true, unit: true },
  });
  return ingredients
    .map((i) => ({ name: i.name, unit: i.unit, quantity: Math.round((net.get(i.id) ?? 0) * 1000) / 1000 }))
    .filter((i) => i.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);
}
