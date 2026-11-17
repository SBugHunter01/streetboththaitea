"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { toSafeError } from "@/lib/safe-error";
import { createSale, voidSale, editSale } from "@/lib/services/pos";
import { createProduct, updateProduct, setProductActive, deleteProduct } from "@/lib/services/product";
import {
  createIngredient,
  updateIngredient,
  setIngredientActive,
  deleteIngredient,
  stockIn,
  adjustStock,
  produceBatch,
} from "@/lib/services/ingredient";
import { createExpense, updateExpense, deleteExpense } from "@/lib/services/expense";
import { updateAllocation } from "@/lib/services/allocation";
import {
  idSchema,
  posItemsSchema,
  paymentMethodSchema,
  productSchema,
  ingredientSchema,
  expenseSchema,
  stockInSchema,
  adjustStockSchema,
  produceBatchSchema,
  allocationSchema,
  type PosItemInput,
  type ProductInput,
  type IngredientInput,
  type ExpenseInput,
  type AllocationInput,
} from "@/lib/schemas";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { User } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Halaman yang membaca data terkait; di-revalidate setelah mutasi berhasil.
const SALES = ["/pos", "/transactions", "/ingredients", "/reports", "/dashboard"];
const PRODUCTS = ["/products", "/pos", "/transactions"];
const INVENTORY = ["/ingredients", "/products", "/pos", "/reports", "/dashboard"];
const EXPENSES = ["/expenses", "/reports", "/dashboard"];

/**
 * Pola tunggal semua server action: wajib admin, jalankan mutasi (validasi
 * input di dalamnya), revalidate halaman terkait, dan ubah error menjadi pesan
 * aman untuk klien. Error navigasi Next (redirect login) tetap diteruskan.
 */
async function run(paths: string[], fn: (user: User) => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn(await requireAdmin());
    for (const p of paths) revalidatePath(p);
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: toSafeError(e) };
  }
}

export async function actionCreateSale(items: PosItemInput, paymentMethod: PaymentMethod) {
  return run(SALES, (user) => createSale(user.id, posItemsSchema.parse(items), paymentMethodSchema.parse(paymentMethod)));
}

export async function actionVoidSale(saleId: string) {
  return run(SALES, (user) => voidSale(user.id, idSchema.parse(saleId)));
}

export async function actionEditSale(saleId: string, items: PosItemInput, paymentMethod: PaymentMethod) {
  return run(SALES, (user) =>
    editSale(user.id, idSchema.parse(saleId), posItemsSchema.parse(items), paymentMethodSchema.parse(paymentMethod)),
  );
}

export async function actionCreateProduct(input: ProductInput) {
  return run(PRODUCTS, () => createProduct(productSchema.parse(input)));
}

export async function actionUpdateProduct(id: string, input: ProductInput) {
  return run(PRODUCTS, () => updateProduct(idSchema.parse(id), productSchema.parse(input)));
}

export async function actionSetProductActive(id: string, isActive: boolean) {
  return run(PRODUCTS, () => setProductActive(idSchema.parse(id), isActive === true));
}

export async function actionDeleteProduct(id: string) {
  return run(PRODUCTS, () => deleteProduct(idSchema.parse(id)));
}

export async function actionCreateIngredient(input: IngredientInput) {
  return run(INVENTORY, () => createIngredient(ingredientSchema.parse(input)));
}

export async function actionUpdateIngredient(id: string, input: IngredientInput) {
  return run(INVENTORY, () => updateIngredient(idSchema.parse(id), ingredientSchema.parse(input)));
}

export async function actionSetIngredientActive(id: string, isActive: boolean) {
  return run(INVENTORY, () => setIngredientActive(idSchema.parse(id), isActive === true));
}

export async function actionDeleteIngredient(id: string) {
  return run(INVENTORY, () => deleteIngredient(idSchema.parse(id)));
}

export async function actionStockIn(ingredientId: string, quantity: number, unitCost?: number, notes?: string) {
  return run(INVENTORY, (user) => {
    const d = stockInSchema.parse({ ingredientId, quantity, unitCost, notes });
    return stockIn(user.id, d.ingredientId, d.quantity, d.unitCost, d.notes);
  });
}

export async function actionAdjustStock(ingredientId: string, newStock: number, notes?: string) {
  return run(INVENTORY, (user) => {
    const d = adjustStockSchema.parse({ ingredientId, newStock, notes });
    return adjustStock(user.id, d.ingredientId, d.newStock, d.notes);
  });
}

export async function actionProduceBatch(
  templateId: string,
  batches: number,
  overrides: { ingredientId: string; quantity: number }[] = [],
) {
  return run(INVENTORY, (user) => {
    const d = produceBatchSchema.parse({ templateId, batches, overrides });
    return produceBatch(user.id, d.templateId, d.batches, d.overrides);
  });
}

export async function actionCreateExpense(input: ExpenseInput) {
  return run(EXPENSES, (user) => createExpense(user.id, expenseSchema.parse(input)));
}

export async function actionUpdateExpense(id: string, input: ExpenseInput) {
  return run(EXPENSES, () => updateExpense(idSchema.parse(id), expenseSchema.parse(input)));
}

export async function actionDeleteExpense(id: string) {
  return run(EXPENSES, () => deleteExpense(idSchema.parse(id)));
}

export async function actionUpdateAllocation(input: AllocationInput) {
  return run(["/reports"], () => updateAllocation(allocationSchema.parse(input)));
}
