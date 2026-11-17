import { prisma } from "@/lib/db";
import { calcProductHpp, calcSaleItemTotals, calcSaleTotals, roundQty, type SaleItemTotals } from "@/lib/finance";
import { number } from "@/lib/format";
import { invoiceNumber } from "@/lib/invoice";
import { AppError } from "@/lib/safe-error";
import { Prisma, type PaymentMethod } from "@/generated/prisma/client";
import type { PosItems } from "@/lib/schemas";

export class PosError extends AppError {}

type Tx = Prisma.TransactionClient;

const productInclude = {
  recipes: { include: { ingredient: true } },
  toppings: { include: { ingredient: true } },
} satisfies Prisma.ProductInclude;
type LoadedProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

type Line = SaleItemTotals & {
  product: LoadedProduct;
  toppings: LoadedProduct["toppings"];
  quantity: number;
  sellingPrice: number;
  hpp: number;
};

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const addQty = (m: Map<string, number>, id: string, q: number) =>
  m.set(id, roundQty((m.get(id) ?? 0) + q));

/** Muat produk aktif + validasi topping, lalu hitung harga & HPP per baris dari biaya bahan terkini. */
async function prepareLines(items: PosItems): Promise<Line[]> {
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, isActive: true },
    include: productInclude,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new PosError("Produk tidak ditemukan atau tidak aktif");
    const toppings = item.toppingIds.map((tid) => {
      const t = product.toppings.find((x) => x.ingredientId === tid);
      if (!t) throw new PosError(`Topping tidak valid untuk ${product.name}`);
      if (!t.ingredient.isActive) throw new PosError(`Topping ${t.ingredient.name} sedang tidak aktif`);
      return t;
    });
    const hpp = calcProductHpp(
      [...product.recipes, ...toppings].map((r) => ({ quantity: r.quantity, costPerUnit: r.ingredient.costPerUnit })),
    );
    const sellingPrice = product.sellingPrice + toppings.reduce((s, t) => s + t.extraPrice, 0);
    return {
      product,
      toppings,
      quantity: item.quantity,
      sellingPrice,
      hpp,
      ...calcSaleItemTotals({ sellingPrice, hpp, quantity: item.quantity }),
    };
  });
}

function consumptionOf(lines: Line[]) {
  const consumption = new Map<string, number>();
  for (const l of lines) {
    for (const r of [...l.product.recipes, ...l.toppings]) addQty(consumption, r.ingredientId, r.quantity * l.quantity);
  }
  return consumption;
}

/** Konsumsi bersih yang sudah dicatat untuk sebuah transaksi (stok keluar − stok kembali). */
async function recordedConsumption(tx: Tx, saleId: string) {
  const movements = await tx.inventoryMovement.findMany({ where: { referenceType: "sale", referenceId: saleId } });
  const consumption = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== "adjustment") addQty(consumption, m.ingredientId, m.type === "stock_out" ? m.quantity : -m.quantity);
  }
  return consumption;
}

const saleTotals = (lines: Line[]) => {
  const t = calcSaleTotals(lines);
  return { subtotal: t.subtotal, total: t.subtotal, totalHpp: t.totalHpp, grossProfit: t.grossProfit };
};

async function writeLines(tx: Tx, saleId: string, lines: Line[]) {
  for (const l of lines) {
    await tx.saleItem.create({
      data: {
        saleId,
        productId: l.product.id,
        productNameSnapshot: l.product.name,
        quantity: l.quantity,
        sellingPrice: l.sellingPrice,
        hpp: l.hpp,
        subtotal: l.subtotal,
        totalHpp: l.totalHpp,
        grossProfit: l.grossProfit,
        toppings: {
          create: l.toppings.map((t) => ({
            ingredientId: t.ingredientId,
            ingredientName: t.ingredient.name,
            quantity: t.quantity * l.quantity,
            unitCost: t.ingredient.costPerUnit,
            extraPrice: t.extraPrice,
          })),
        },
      },
    });
  }
}

/**
 * Terapkan perubahan stok (positif = dipakai, negatif = dikembalikan) dan catat
 * movement-nya. Pemotongan stok bersyarat `currentStock >= qty` di level DB,
 * jadi dua transaksi bersamaan tidak bisa membuat stok negatif.
 */
async function applyStock(tx: Tx, saleId: string, userId: string, deltas: Map<string, number>, notes?: string) {
  const ingredients = await tx.ingredient.findMany({ where: { id: { in: [...deltas.keys()] } } });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  for (const [ingredientId, delta] of deltas) {
    if (delta === 0) continue;
    const ing = byId.get(ingredientId);
    if (delta > 0) {
      const { count } = await tx.ingredient.updateMany({
        where: { id: ingredientId, currentStock: { gte: delta } },
        data: { currentStock: { decrement: delta } },
      });
      if (count !== 1) {
        throw new PosError(
          `Stok ${ing?.name ?? "bahan"} tidak cukup: butuh ${number(delta)} ${ing?.unit ?? ""}, tersedia ${number(ing?.currentStock ?? 0)} ${ing?.unit ?? ""}`.trim(),
        );
      }
    } else {
      await tx.ingredient.update({ where: { id: ingredientId }, data: { currentStock: { increment: -delta } } });
    }
    await tx.inventoryMovement.create({
      data: {
        ingredientId,
        type: delta > 0 ? "stock_out" : "stock_in",
        quantity: Math.abs(delta),
        unitCost: ing?.costPerUnit ?? 0,
        referenceType: "sale",
        referenceId: saleId,
        notes,
        createdBy: userId,
      },
    });
  }
}

export async function createSale(userId: string, items: PosItems, paymentMethod: PaymentMethod) {
  const lines = await prepareLines(items);
  const consumption = consumptionOf(lines);

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: { invoiceNumber: invoiceNumber(), userId, paymentMethod, ...saleTotals(lines) },
        });
        await writeLines(tx, sale.id, lines);
        await applyStock(tx, sale.id, userId, consumption);
        return sale;
      });
    } catch (e) {
      // Satu-satunya unique yang bisa bentrok di sini adalah invoiceNumber acak.
      if (attempt < 2 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

export async function voidSale(userId: string, saleId: string) {
  return prisma.$transaction(async (tx) => {
    // Update bersyarat: void ganda (klik dobel / dua tab) hanya lolos sekali.
    const { count } = await tx.sale.updateMany({
      where: { id: saleId, status: "COMPLETED" },
      data: { status: "VOIDED" },
    });
    if (count !== 1) throw new PosError("Transaksi tidak ditemukan atau sudah dibatalkan");
    const restock = new Map<string, number>();
    for (const [id, q] of await recordedConsumption(tx, saleId)) if (q > 0) restock.set(id, -q);
    await applyStock(tx, saleId, userId, restock, "Void transaksi");
  });
}

/** Ganti isi transaksi. Harga & HPP dihitung ulang dari data terkini; stok disesuaikan selisihnya saja. */
export async function editSale(userId: string, saleId: string, items: PosItems, paymentMethod: PaymentMethod) {
  const lines = await prepareLines(items);
  const next = consumptionOf(lines);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.sale.updateMany({
      where: { id: saleId, status: "COMPLETED" },
      data: { paymentMethod, ...saleTotals(lines) },
    });
    if (count !== 1) throw new PosError("Transaksi tidak ditemukan atau sudah dibatalkan");

    const prev = await recordedConsumption(tx, saleId);
    const deltas = new Map<string, number>();
    for (const id of new Set([...prev.keys(), ...next.keys()])) {
      deltas.set(id, roundQty((next.get(id) ?? 0) - (prev.get(id) ?? 0)));
    }

    await tx.saleItemTopping.deleteMany({ where: { saleItem: { saleId } } });
    await tx.saleItem.deleteMany({ where: { saleId } });
    await writeLines(tx, saleId, lines);
    await applyStock(tx, saleId, userId, deltas, "Edit transaksi");
  });
}
