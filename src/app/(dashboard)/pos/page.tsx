import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { productInclude, type PosProduct } from "@/lib/types";
import { PosClient } from "./pos-client";

/** Produk tanpa resep base (mis. jasa) tidak dibatasi stok. */
const UNLIMITED = 999;

export default async function PosPage() {
  await requireUser();
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, include: productInclude, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { type: "product" }, orderBy: { name: "asc" } }),
  ]);

  // maxMakeable = porsi terbanyak yang bisa dibuat dari stok bahan resep base.
  // Topping opsional, jadi tidak ikut menghitung; topping yang nonaktif atau
  // stoknya kurang dari satu porsi disembunyikan agar kasir tidak bisa memilihnya.
  // Ini hanya petunjuk UI: server tetap memotong stok secara atomik.
  // Resep dengan qty <= 0 dianggap malformed: produk diblokir (maxMakeable=0) agar
  // stok tidak bisa dikurangi tanpa catatan. Perbaiki resepnya di halaman produk.
  const posProducts: PosProduct[] = products.map(({ recipes, ...p }) => {
    const maxMakeable = recipes.length
      ? Math.min(...recipes.map((r) => (r.quantity > 0 ? Math.floor(r.ingredient.currentStock / r.quantity) : 0)))
      : UNLIMITED;
    return {
      ...p,
      toppings: p.toppings.filter((t) => t.ingredient.isActive && t.ingredient.currentStock >= t.quantity),
      maxMakeable,
      outOfStock: maxMakeable === 0,
    };
  });

  return <PosClient products={posProducts} categories={categories} />;
}
