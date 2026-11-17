import { prisma } from "@/lib/db";
import { calcBatchCost, calcProductHpp, calcUnitCost, roundQty } from "@/lib/finance";
import { number } from "@/lib/format";
import { AppError } from "@/lib/safe-error";
import type { IngredientInput } from "@/lib/schemas";
import type { Prisma } from "@/generated/prisma/client";

export class IngredientError extends AppError {}
export class BatchError extends AppError {}

type Tx = Prisma.TransactionClient;

function resolveCostPerUnit(input: IngredientInput): number {
  if (input.packPrice != null && input.packSize != null) return calcUnitCost(input.packPrice, input.packSize);
  return input.costPerUnit;
}

/** Hitung ulang HPP tersimpan semua produk yang resepnya memakai bahan ini. */
export async function recomputeProductHpps(ingredientId: string, tx: Tx) {
  const products = await tx.product.findMany({
    where: { recipes: { some: { ingredientId } } },
    include: { recipes: { include: { ingredient: true } } },
  });
  for (const p of products) {
    const hpp = calcProductHpp(p.recipes.map((r) => ({ quantity: r.quantity, costPerUnit: r.ingredient.costPerUnit })));
    if (hpp !== p.hpp) await tx.product.update({ where: { id: p.id }, data: { hpp } });
  }
}

export async function createIngredient(input: IngredientInput) {
  return prisma.ingredient.create({
    data: {
      name: input.name,
      unit: input.unit,
      costPerUnit: resolveCostPerUnit(input),
      minimumStock: input.minimumStock,
      currentStock: input.currentStock ?? 0,
      packPrice: input.packPrice ?? null,
      packSize: input.packSize ?? null,
      kind: input.kind ?? null,
    },
  });
}

/** Ubah data master bahan. Stok dan status aktif sengaja tidak disentuh di sini. */
export async function updateIngredient(id: string, input: IngredientInput) {
  const costPerUnit = resolveCostPerUnit(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.ingredient.findUnique({ where: { id } });
    if (!existing) throw new IngredientError("Bahan tidak ditemukan");
    const updated = await tx.ingredient.update({
      where: { id },
      data: {
        name: input.name,
        unit: input.unit,
        costPerUnit,
        minimumStock: input.minimumStock,
        packPrice: input.packPrice ?? null,
        packSize: input.packSize ?? null,
        kind: input.kind ?? null,
      },
    });
    if (existing.costPerUnit !== costPerUnit) await recomputeProductHpps(id, tx);
    return updated;
  });
}

export async function setIngredientActive(id: string, isActive: boolean) {
  return prisma.ingredient.update({ where: { id }, data: { isActive } });
}

export async function deleteIngredient(id: string) {
  const counts = await Promise.all([
    prisma.productRecipe.count({ where: { ingredientId: id } }),
    prisma.productTopping.count({ where: { ingredientId: id } }),
    prisma.batchComponent.count({ where: { ingredientId: id } }),
    prisma.batchTemplate.count({ where: { outputIngredientId: id } }),
    prisma.inventoryMovement.count({ where: { ingredientId: id } }),
  ]);
  if (counts.some((c) => c > 0)) {
    throw new IngredientError(
      "Bahan tidak bisa dihapus karena masih dipakai di resep/topping/batch atau punya riwayat stok. Nonaktifkan saja.",
    );
  }
  return prisma.ingredient.delete({ where: { id } });
}

export async function stockIn(userId: string, ingredientId: string, quantity: number, unitCost?: number, notes?: string | null) {
  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new IngredientError("Bahan tidak ditemukan");
    const costChanged = unitCost !== undefined && unitCost !== ing.costPerUnit;
    await tx.ingredient.update({
      where: { id: ingredientId },
      data: { currentStock: { increment: quantity }, ...(costChanged ? { costPerUnit: unitCost } : {}) },
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        ingredientId,
        type: "stock_in",
        quantity,
        unitCost: unitCost ?? ing.costPerUnit,
        referenceType: "purchase",
        notes: notes ?? "Stok masuk",
        createdBy: userId,
      },
    });
    if (costChanged) await recomputeProductHpps(ingredientId, tx);
    return movement;
  });
}

export async function adjustStock(userId: string, ingredientId: string, newStock: number, notes?: string | null) {
  return prisma.$transaction(async (tx) => {
    // Dibaca di dalam transaksi agar selisih yang dicatat sesuai stok saat ditulis.
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) throw new IngredientError("Bahan tidak ditemukan");
    const delta = roundQty(newStock - ing.currentStock);
    if (delta === 0) return null;
    await tx.ingredient.update({ where: { id: ingredientId }, data: { currentStock: newStock } });
    return tx.inventoryMovement.create({
      data: {
        ingredientId,
        type: "adjustment",
        quantity: delta,
        unitCost: ing.costPerUnit,
        referenceType: "manual",
        notes: notes ?? "Penyesuaian stok",
        createdBy: userId,
      },
    });
  });
}

/**
 * Produksi bahan olahan dari template batch. `overrides` mengganti jumlah per
 * komponen (per batch); output diestimasi dengan rasio terkecil override
 * terhadap template (maks. 1×), dan HPP output dihitung dari bahan yang benar-benar dipakai.
 */
export async function produceBatch(
  userId: string,
  templateId: string,
  batches: number,
  overrides: { ingredientId: string; quantity: number }[] = [],
) {
  return prisma.$transaction(async (tx) => {
    const tpl = await tx.batchTemplate.findUnique({
      where: { id: templateId },
      include: { components: { include: { ingredient: true } }, outputIngredient: true },
    });
    if (!tpl) throw new BatchError("Template batch tidak ditemukan");
    if (!tpl.outputIngredient.isActive) throw new BatchError("Bahan output nonaktif");

    const override = new Map<string, number>();
    for (const o of overrides) {
      if (!tpl.components.some((c) => c.ingredientId === o.ingredientId)) {
        throw new BatchError("Override bahan tidak valid untuk template ini");
      }
      if (override.has(o.ingredientId)) throw new BatchError("Komponen override duplikat");
      override.set(o.ingredientId, o.quantity);
    }

    let ratio = 1;
    const components = tpl.components.map((c) => {
      if (!c.ingredient.isActive) throw new BatchError(`Bahan ${c.ingredient.name} nonaktif`);
      const quantity = override.get(c.ingredientId) ?? c.quantity;
      ratio = Math.min(ratio, quantity / c.quantity);
      return { ...c, quantity };
    });
    const outputPerBatch = tpl.outputQuantity * ratio;
    const batchCost = calcBatchCost(
      components.map((c) => ({ quantity: c.quantity, costPerUnit: c.ingredient.costPerUnit })),
      outputPerBatch,
    );
    const note = `Batch ${tpl.name} x${batches}`;

    for (const c of components) {
      const qty = roundQty(c.quantity * batches);
      const { count } = await tx.ingredient.updateMany({
        where: { id: c.ingredientId, currentStock: { gte: qty } },
        data: { currentStock: { decrement: qty } },
      });
      if (count !== 1) {
        throw new BatchError(
          `Stok ${c.ingredient.name} tidak cukup: butuh ${number(qty)} ${c.ingredient.unit}, tersedia ${number(c.ingredient.currentStock)} ${c.ingredient.unit}`,
        );
      }
      await tx.inventoryMovement.create({
        data: {
          ingredientId: c.ingredientId,
          type: "stock_out",
          quantity: qty,
          unitCost: c.ingredient.costPerUnit,
          referenceType: "production",
          referenceId: tpl.id,
          notes: note,
          createdBy: userId,
        },
      });
    }

    const produced = roundQty(outputPerBatch * batches);
    await tx.ingredient.update({
      where: { id: tpl.outputIngredientId },
      data: { currentStock: { increment: produced }, costPerUnit: batchCost },
    });
    await tx.inventoryMovement.create({
      data: {
        ingredientId: tpl.outputIngredientId,
        type: "stock_in",
        quantity: produced,
        unitCost: batchCost,
        referenceType: "production",
        referenceId: tpl.id,
        notes: `Hasil batch ${tpl.name} x${batches}`,
        createdBy: userId,
      },
    });
    await recomputeProductHpps(tpl.outputIngredientId, tx);
  });
}
