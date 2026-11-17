import { prisma } from "@/lib/db";
import { parseWibDate } from "@/lib/period";
import { AppError } from "@/lib/safe-error";
import type { ExpenseData } from "@/lib/schemas";

export class ExpenseError extends AppError {}

async function toExpenseData(input: ExpenseData) {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (category?.type !== "expense") throw new ExpenseError("Kategori tidak valid");
  return {
    categoryId: input.categoryId,
    amount: input.amount,
    description: input.description,
    paymentMethod: input.paymentMethod,
    expenseDate: parseWibDate(input.expenseDate),
    notes: input.notes,
  };
}

export async function createExpense(userId: string, input: ExpenseData) {
  return prisma.expense.create({ data: { userId, ...(await toExpenseData(input)) } });
}

export async function updateExpense(id: string, input: ExpenseData) {
  return prisma.expense.update({ where: { id }, data: await toExpenseData(input) });
}

export async function deleteExpense(id: string) {
  return prisma.expense.delete({ where: { id } });
}
