// Seed awal: kategori, akun admin, bahan baku, template batch, produk & resep.
// Idempotent dan non-destruktif: hanya membuat data yang belum ada. Data yang
// sudah ada (stok, harga, resep hasil edit di aplikasi) tidak pernah ditimpa.
import "dotenv/config";
import { generateRandomString, hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { calcProductHpp } from "../src/lib/finance";

// account: rekening alokasi yang dibebani pengeluaran kategori ini.
const EXPENSE_CATEGORIES = [
  { name: "Bahan Baku", account: "operational", isInventoryPurchase: true },
  { name: "Packaging", account: "operational", isInventoryPurchase: true },
  { name: "Operasional", account: "operational" },
  { name: "Transportasi", account: "operational" },
  { name: "Listrik", account: "operational" },
  { name: "Gas", account: "operational" },
  { name: "Peralatan", account: "emergency" },
  { name: "Maintenance", account: "emergency" },
  { name: "Gaji Karyawan", account: "payroll" },
  { name: "Other", account: "operational" },
] as const;

const PRODUCT_CATEGORIES = ["Minuman", "Makanan"];

const INGREDIENTS = [
  { name: "Thai Tea", unit: "gram", packPrice: 66000, packSize: 500, costPerUnit: 132, kind: "bahan_baku", currentStock: 2000, minimumStock: 500 },
  { name: "Matcha", unit: "gram", packPrice: 133200, packSize: 500, costPerUnit: 266, kind: "bahan_baku", currentStock: 1000, minimumStock: 500 },
  { name: "Chocolate", unit: "gram", packPrice: 38850, packSize: 800, costPerUnit: 49, kind: "bahan_baku", currentStock: 2400, minimumStock: 500 },
  { name: "SKM Sachet", unit: "sachet", packPrice: 55500, packSize: 20, costPerUnit: 2775, kind: "bahan_baku", currentStock: 100, minimumStock: 20 },
  { name: "Susu UHT", unit: "ml", packPrice: 212395, packSize: 1000, costPerUnit: 212, kind: "bahan_baku", currentStock: 5000, minimumStock: 1000 },
  { name: "Keju Serut", unit: "gram", packPrice: 119596, packSize: 2000, costPerUnit: 60, kind: "topping", currentStock: 2000, minimumStock: 500 },
  { name: "CreamCheese", unit: "gram", packPrice: 168720, packSize: 1000, costPerUnit: 169, kind: "topping", currentStock: 1000, minimumStock: 200 },
  { name: "Gula Aren", unit: "gram", packPrice: 147630, packSize: 1000, costPerUnit: 148, kind: "topping", currentStock: 1000, minimumStock: 200 },
  { name: "Bubble Boba", unit: "gram", packPrice: 33300, packSize: 1000, costPerUnit: 33, kind: "topping", currentStock: 1000, minimumStock: 200 },
  { name: "Cup 22 oz", unit: "pcs", packPrice: 38850, packSize: 50, costPerUnit: 777, kind: "packaging", currentStock: 500, minimumStock: 100 },
  { name: "Tutup Cup", unit: "pcs", packPrice: 5550, packSize: 50, costPerUnit: 111, kind: "packaging", currentStock: 500, minimumStock: 100 },
  { name: "Biang Teh", unit: "ml", packPrice: null, packSize: null, costPerUnit: 2, kind: "olahan", currentStock: 37500, minimumStock: 5000 },
  { name: "Topping Boba", unit: "gram", packPrice: null, packSize: null, costPerUnit: 100, kind: "olahan", currentStock: 0, minimumStock: 200 },
];

// Air & es batu masuk biaya operasional (pengeluaran), bukan bahan resep.
const BATCH_TEMPLATES = [
  { name: "Biang Teh 37.5L", output: "Biang Teh", outputQuantity: 37500, components: [["Thai Tea", 500]] },
  { name: "Topping Boba 140g", output: "Topping Boba", outputQuantity: 140, components: [["Gula Aren", 100], ["Bubble Boba", 50]] },
] as const;

const DEFAULT_TOPPINGS = [
  ["CreamCheese", 10, 5000],
  ["Keju Serut", 20, 5000],
  ["Topping Boba", 20, 3000],
] as const;

const PRODUCTS = [
  {
    sku: "TT-01",
    name: "Thai Tea",
    sellingPrice: 15000,
    description: "Thai Tea racikan biang teh asli 150ml dengan 1 sachet SKM, cup & tutup",
    recipe: [["Biang Teh", 150], ["SKM Sachet", 1], ["Cup 22 oz", 1], ["Tutup Cup", 1]],
  },
  {
    sku: "MC-01",
    name: "Matcha",
    sellingPrice: 18000,
    description: "Bubuk Matcha 8gr, Susu UHT 100ml, 1 sachet SKM, cup & tutup",
    recipe: [["Matcha", 8], ["Susu UHT", 100], ["SKM Sachet", 1], ["Cup 22 oz", 1], ["Tutup Cup", 1]],
  },
  {
    sku: "CH-01",
    name: "Chocolate",
    sellingPrice: 16000,
    description: "Chocolate Powder 40gr, Susu UHT 8ml, cup & tutup",
    recipe: [["Chocolate", 40], ["Susu UHT", 8], ["Cup 22 oz", 1], ["Tutup Cup", 1]],
  },
] as const;

async function seedCategories(prisma: PrismaClient) {
  const rows = [
    ...EXPENSE_CATEGORIES.map((c) => ({ ...c, type: "expense" as const })),
    ...PRODUCT_CATEGORIES.map((name) => ({ name, type: "product" as const, account: "operational" as const })),
  ];
  for (const row of rows) {
    const { name, type } = row;
    const existing = await prisma.category.findFirst({ where: { name, type } });
    if (!existing) await prisma.category.create({ data: row });
  }
}

async function seedAdmin(prisma: PrismaClient) {
  const email = (process.env.ADMIN_EMAIL ?? "admin@streetboth.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD wajib diisi di .env dengan minimal 8 karakter untuk seed admin.",
    );
  }

  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { id: generateRandomString(32), name: "Admin", email, emailVerified: true, role: "admin" },
    }));
  const hasCredential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (hasCredential) return;
  await prisma.account.create({
    data: {
      id: generateRandomString(32),
      issuer: "local:credential",
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(password),
    },
  });
}

async function seedIngredientsAndProducts(prisma: PrismaClient) {
  const minumanCat = await prisma.category.findFirst({ where: { name: "Minuman", type: "product" } });
  if (!minumanCat) return;

  const ingredients = new Map<string, { id: string; costPerUnit: number }>();
  for (const item of INGREDIENTS) {
    const ing =
      (await prisma.ingredient.findUnique({ where: { name: item.name } })) ??
      (await prisma.ingredient.create({ data: item }));
    ingredients.set(item.name, ing);
  }
  const ingredient = (name: string) => {
    const ing = ingredients.get(name);
    if (!ing) throw new Error(`Bahan seed tidak ditemukan: ${name}`);
    return ing;
  };

  for (const tpl of BATCH_TEMPLATES) {
    if (await prisma.batchTemplate.findUnique({ where: { name: tpl.name } })) continue;
    await prisma.batchTemplate.create({
      data: {
        name: tpl.name,
        outputIngredientId: ingredient(tpl.output).id,
        outputQuantity: tpl.outputQuantity,
        components: {
          create: tpl.components.map(([name, quantity]) => ({ ingredientId: ingredient(name).id, quantity })),
        },
      },
    });
  }

  for (const p of PRODUCTS) {
    if (await prisma.product.findUnique({ where: { sku: p.sku } })) continue;
    const recipes = p.recipe.map(([name, quantity]) => ({ ingredientId: ingredient(name).id, quantity }));
    await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        categoryId: minumanCat.id,
        sellingPrice: p.sellingPrice,
        description: p.description,
        hpp: calcProductHpp(p.recipe.map(([name, quantity]) => ({ quantity, costPerUnit: ingredient(name).costPerUnit }))),
        recipes: { create: recipes },
        toppings: {
          create: DEFAULT_TOPPINGS.map(([name, quantity, extraPrice]) => ({
            ingredientId: ingredient(name).id,
            quantity,
            extraPrice,
          })),
        },
      },
    });
  }
}

async function main() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  });
  const prisma = new PrismaClient({ adapter });
  try {
    await seedCategories(prisma);
    await seedAdmin(prisma);
    await seedIngredientsAndProducts(prisma);
    console.log("Seed selesai: kategori, admin, bahan baku, batch template & produk siap.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
