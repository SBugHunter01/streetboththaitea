import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { pageParam } from "@/lib/search-params";
import { productInclude } from "@/lib/types";
import { ProductsClient } from "./products-client";

const PAGE_SIZE = 12;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireUser();
  const total = await prisma.product.count();
  const page = Math.min(pageParam((await searchParams).page), Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const [products, categories, ingredients] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: productInclude,
    }),
    prisma.category.findMany({ where: { type: "product" }, orderBy: { name: "asc" } }),
    // Termasuk yang nonaktif agar resep lama yang memakainya tetap tampil benar;
    // pilihan bahan baru di form hanya menampilkan yang aktif.
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <ProductsClient
      products={products}
      categories={categories}
      ingredients={ingredients}
      page={page}
      totalItems={total}
      pageSize={PAGE_SIZE}
    />
  );
}
