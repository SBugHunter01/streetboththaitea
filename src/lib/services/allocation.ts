import { prisma } from "@/lib/db";
import { DEFAULT_ALLOCATION } from "@/lib/constants";
import { calcAllocation, calcGrossProfit, type AllocationPct } from "@/lib/finance";
import type { AllocationInput } from "@/lib/schemas";
import type { FundAccount } from "@/generated/prisma/enums";

const SETTING_ID = "default";
const ACCOUNTS: FundAccount[] = ["operational", "payroll", "emergency"];

export interface AllocationSummary {
  pct: AllocationPct;
  revenue: number;
  hpp: number;
  grossProfit: number;
  accounts: { account: FundAccount; allocated: number; spent: number; balance: number }[];
}

export async function getAllocation(): Promise<AllocationPct> {
  const row = await prisma.allocationSetting.findUnique({ where: { id: SETTING_ID } });
  return row
    ? { operationalPct: row.operationalPct, payrollPct: row.payrollPct, emergencyPct: row.emergencyPct }
    : DEFAULT_ALLOCATION;
}

export async function updateAllocation(data: AllocationInput) {
  return prisma.allocationSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });
}

/** Jatah, pemakaian, dan sisa tiap rekening untuk periode (laporan alokasi, bukan saldo tersimpan). */
export async function allocationSummary(from: Date, to: Date): Promise<AllocationSummary> {
  const [pct, sales, groups, categories] = await Promise.all([
    getAllocation(),
    prisma.sale.aggregate({
      where: { createdAt: { gte: from, lte: to }, status: "COMPLETED" },
      _sum: { total: true, totalHpp: true },
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.category.findMany({ where: { type: "expense" }, select: { id: true, account: true } }),
  ]);
  const revenue = sales._sum.total ?? 0;
  const hpp = sales._sum.totalHpp ?? 0;
  const allocated = calcAllocation(revenue, hpp, pct);

  const accountOf = new Map(categories.map((c) => [c.id, c.account]));
  const spent: Record<FundAccount, number> = { operational: 0, payroll: 0, emergency: 0 };
  for (const g of groups) spent[accountOf.get(g.categoryId) ?? "operational"] += g._sum.amount ?? 0;

  return {
    pct,
    revenue,
    hpp,
    grossProfit: calcGrossProfit(revenue, hpp),
    accounts: ACCOUNTS.map((account) => ({
      account,
      allocated: allocated[account],
      spent: spent[account],
      balance: allocated[account] - spent[account],
    })),
  };
}
