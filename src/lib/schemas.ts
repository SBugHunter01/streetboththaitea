import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { INGREDIENT_KINDS, MAX_ITEM_QTY } from "@/lib/constants";
import { isDateKey, localDateKey } from "@/lib/period";

// Pesan validasi dalam Bahasa Indonesia; toSafeError meneruskan pesan pertama.
z.config(z.locales.id());

export const paymentMethodSchema = z.enum(PaymentMethod);

export const idSchema = z.string().trim().min(1).max(64);

const MAX_QTY = 1_000_000_000;
const quantity = z.number().min(0.001).max(MAX_QTY);
const money = z.number().int().min(0).max(MAX_QTY);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const hasDuplicate = (ids: string[]) => new Set(ids).size !== ids.length;

export const posItemsSchema = z
  .array(
    z.object({
      productId: idSchema,
      quantity: z.number().int().min(1).max(MAX_ITEM_QTY),
      toppingIds: z.array(idSchema).max(20).optional().default([]),
    }),
  )
  .min(1)
  .max(50)
  .transform((items) => {
    // Satu baris per kombinasi (produk, set topping): baris kembar digabung
    // agar stok tidak dipotong dua kali untuk SaleItem yang identik.
    const merged = new Map<string, { productId: string; quantity: number; toppingIds: string[] }>();
    for (const i of items) {
      const toppingIds = [...new Set(i.toppingIds)].sort();
      const key = `${i.productId}::${toppingIds.join(",")}`;
      const prev = merged.get(key);
      if (prev) prev.quantity += i.quantity;
      else merged.set(key, { productId: i.productId, quantity: i.quantity, toppingIds });
    }
    return [...merged.values()];
  })
  .refine(
    (items) => items.every((i) => i.quantity <= MAX_ITEM_QTY),
    `Maksimal ${MAX_ITEM_QTY} per item`,
  );
export type PosItemInput = z.input<typeof posItemsSchema>;
export type PosItems = z.output<typeof posItemsSchema>;

export const productSchema = z
  .object({
    sku: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(100),
    categoryId: idSchema,
    sellingPrice: money,
    description: optionalText(500),
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "URL harus http(s)")
      .optional()
      .transform((v) => v || null),
    recipes: z.array(z.object({ ingredientId: idSchema, quantity })).max(100),
    toppings: z
      .array(z.object({ ingredientId: idSchema, quantity, extraPrice: money }))
      .max(50)
      .optional()
      .default([]),
  })
  .superRefine((v, ctx) => {
    const recipeIds = v.recipes.map((r) => r.ingredientId);
    const toppingIds = v.toppings.map((t) => t.ingredientId);
    if (hasDuplicate(recipeIds)) {
      ctx.addIssue({ code: "custom", message: "Bahan resep tidak boleh duplikat", path: ["recipes"] });
    }
    if (hasDuplicate(toppingIds)) {
      ctx.addIssue({ code: "custom", message: "Topping duplikat", path: ["toppings"] });
    }
    if (toppingIds.some((id) => recipeIds.includes(id))) {
      ctx.addIssue({
        code: "custom",
        message: "Topping tidak boleh sama dengan bahan resep base",
        path: ["toppings"],
      });
    }
  });
export type ProductInput = z.input<typeof productSchema>;
export type ProductData = z.output<typeof productSchema>;

export const ingredientSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    unit: z.string().trim().min(1).max(20),
    costPerUnit: money,
    minimumStock: z.number().min(0).max(MAX_QTY),
    // Hanya dipakai saat membuat bahan; perubahan stok berikutnya lewat stok masuk/penyesuaian.
    currentStock: z.number().min(0).max(MAX_QTY).optional(),
    packPrice: money.nullable().optional(),
    packSize: quantity.nullable().optional(),
    kind: z.enum(INGREDIENT_KINDS).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.packPrice == null) !== (v.packSize == null)) {
      ctx.addIssue({
        code: "custom",
        message: "Harga pack dan isi pack harus diisi bersamaan",
        path: ["packSize"],
      });
    }
  });
export type IngredientInput = z.infer<typeof ingredientSchema>;

// Override per komponen bersifat opsional; kosong = resep template apa adanya.
export const produceBatchSchema = z.object({
  templateId: idSchema,
  batches: z.number().int().min(1).max(100),
  overrides: z.array(z.object({ ingredientId: idSchema, quantity })).max(50).default([]),
});

// Tanggal pengeluaran harus tanggal kalender nyata dan tidak boleh melewati
// hari ini (WIB). Tanpa ini, "9999-01-01" atau "2026-02-31" bisa masuk dan
// merusak agregasi laporan per periode.
const expenseDateSchema = z
  .string()
  .refine(isDateKey, "Tanggal tidak valid")
  .refine((v) => v <= localDateKey(), "Tanggal pengeluaran tidak boleh di masa depan");

export const expenseSchema = z.object({
  categoryId: idSchema,
  amount: z.number().int().min(1).max(MAX_QTY),
  expenseDate: expenseDateSchema,
  description: optionalText(300),
  paymentMethod: paymentMethodSchema.default("OTHER"),
  notes: optionalText(500),
});
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseData = z.output<typeof expenseSchema>;

export const stockInSchema = z.object({
  ingredientId: idSchema,
  quantity,
  unitCost: money.optional(),
  notes: optionalText(500),
});

export const adjustStockSchema = z.object({
  ingredientId: idSchema,
  newStock: z.number().min(0).max(MAX_QTY),
  notes: optionalText(500),
});

export const movementQuerySchema = z.object({
  ingredientId: idSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const pct = z.number().int().min(0).max(100);
export const allocationSchema = z
  .object({ operationalPct: pct, payrollPct: pct, emergencyPct: pct })
  .refine((v) => v.operationalPct + v.payrollPct + v.emergencyPct === 100, "Total persentase harus 100%");
export type AllocationInput = z.infer<typeof allocationSchema>;
