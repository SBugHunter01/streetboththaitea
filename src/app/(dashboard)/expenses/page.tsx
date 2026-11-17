import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/period";
import { pageParam, sp } from "@/lib/search-params";
import { ExpensesClient } from "./expenses-client";

const PAGE_SIZE = 15;

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  await requireUser();
  const p = await searchParams;
  const categoryId = sp(p.category) ?? "all";
  const monthParam = sp(p.month) ?? "";
  const range = monthRange(monthParam);

  const where = {
    ...(categoryId !== "all" ? { categoryId } : {}),
    ...(range ? { expenseDate: { gte: range.from, lte: range.to } } : {}),
  };

  const [total, totalAmount, categories] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.category.findMany({ where: { type: "expense" }, orderBy: { name: "asc" } }),
  ]);
  const page = Math.min(pageParam(p.page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { category: true },
  });

  return (
    <ExpensesClient
      expenses={expenses}
      categories={categories}
      page={page}
      totalItems={total}
      pageSize={PAGE_SIZE}
      categoryId={categoryId}
      month={range ? monthParam : ""}
      totalAmount={totalAmount._sum.amount ?? 0}
    />
  );
}
