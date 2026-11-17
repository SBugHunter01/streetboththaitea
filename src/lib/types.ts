import type { Prisma } from "@/generated/prisma/client";

// Bentuk data yang dikirim server page ke client component. Didefinisikan
// lewat `include` yang sama dengan query-nya agar tipe dan query tidak bisa berbeda.

const withIngredient = { include: { ingredient: true } } as const;

export const productInclude = {
  category: true,
  recipes: withIngredient,
  toppings: withIngredient,
} satisfies Prisma.ProductInclude;
export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export type PosProduct = Omit<ProductWithRelations, "recipes"> & { maxMakeable: number; outOfStock: boolean };

export const catalogProductSelect = {
  id: true,
  name: true,
  sellingPrice: true,
  toppings: withIngredient,
} satisfies Prisma.ProductSelect;
export type CatalogProduct = Prisma.ProductGetPayload<{ select: typeof catalogProductSelect }>;

export const batchTemplateInclude = {
  outputIngredient: true,
  components: withIngredient,
} satisfies Prisma.BatchTemplateInclude;
export type BatchTemplateWithComponents = Prisma.BatchTemplateGetPayload<{ include: typeof batchTemplateInclude }>;

export type ExpenseWithCategory = Prisma.ExpenseGetPayload<{ include: { category: true } }>;

export const saleWithItemsInclude = { items: { include: { toppings: true } } } satisfies Prisma.SaleInclude;
export type SaleWithItems = Prisma.SaleGetPayload<{ include: typeof saleWithItemsInclude }>;

export const movementListSelect = {
  id: true,
  type: true,
  quantity: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.InventoryMovementSelect;
export type MovementListItem = Prisma.InventoryMovementGetPayload<{ select: typeof movementListSelect }>;
