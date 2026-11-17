// Konstanta domain yang dipakai server dan client. Sengaja tanpa dependency:
// client component yang mengimpor schemas.ts akan ikut membundel zod + locale.

export const MAX_ITEM_QTY = 99;

export const INGREDIENT_KINDS = ["bahan_baku", "topping", "packaging", "olahan"] as const;
export type IngredientKind = (typeof INGREDIENT_KINDS)[number];

export const isIngredientKind = (v: unknown): v is IngredientKind =>
  (INGREDIENT_KINDS as readonly unknown[]).includes(v);

// Persen pembagian sisa laba kotor bila admin belum menyimpan pengaturan.
export const DEFAULT_ALLOCATION = { operationalPct: 40, payrollPct: 40, emergencyPct: 20 };
