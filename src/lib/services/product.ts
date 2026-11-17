import { prisma } from "@/lib/db";
import { calcProductHpp } from "@/lib/finance";
import { AppError } from "@/lib/safe-error";
import type { ProductData } from "@/lib/schemas";

export class ProductError extends AppError {}

/** Validasi relasi produk ke DB dan hitung HPP dari resep. */
async function resolveProduct(input: ProductData, id?: string) {
  const [skuOwner, category, ingredients] = await Promise.all([
    prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } }),
    prisma.category.findUnique({ where: { id: input.categoryId } }),
    prisma.ingredient.findMany({
      where: { id: { in: [...input.recipes, ...input.toppings].map((r) => r.ingredientId) } },
    }),
  ]);
  if (skuOwner && skuOwner.id !== id) throw new ProductError("SKU sudah digunakan");
  if (category?.type !== "product") throw new ProductError("Kategori tidak valid");

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  for (const t of input.toppings) {
    const ing = byId.get(t.ingredientId);
    if (!ing) throw new ProductError("Bahan topping tidak ditemukan");
    if (!ing.isActive) throw new ProductError(`Bahan topping ${ing.name} nonaktif`);
  }
  const hpp = calcProductHpp(
    input.recipes.map((r) => {
      const ing = byId.get(r.ingredientId);
      if (!ing) throw new ProductError("Bahan baku tidak ditemukan");
      return { quantity: r.quantity, costPerUnit: ing.costPerUnit };
    }),
  );

  return {
    sku: input.sku,
    name: input.name,
    categoryId: input.categoryId,
    sellingPrice: input.sellingPrice,
    description: input.description,
    imageUrl: input.imageUrl,
    hpp,
    recipes: { create: input.recipes },
    toppings: { create: input.toppings },
  };
}

export async function createProduct(input: ProductData) {
  return prisma.product.create({ data: await resolveProduct(input) });
}

/** Ganti data, resep, dan topping produk. Status aktif tidak ikut berubah. */
export async function updateProduct(id: string, input: ProductData) {
  const data = await resolveProduct(input, id);
  return prisma.$transaction(async (tx) => {
    await tx.productRecipe.deleteMany({ where: { productId: id } });
    await tx.productTopping.deleteMany({ where: { productId: id } });
    return tx.product.update({ where: { id }, data });
  });
}

export async function setProductActive(id: string, isActive: boolean) {
  return prisma.product.update({ where: { id }, data: { isActive } });
}

/** Riwayat penjualan tetap utuh: SaleItem menyimpan snapshot nama, productId menjadi null. */
export async function deleteProduct(id: string) {
  return prisma.product.delete({ where: { id } });
}
