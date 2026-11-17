import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const DB_FILE = path.join(process.cwd(), "prisma", "smoke-test.db");
process.env.DATABASE_URL = "file:./prisma/smoke-test.db";

async function main() {
  if (existsSync(DB_FILE)) rmSync(DB_FILE);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "ignore",
  });

  const [{ prisma }, pos, ingService] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/services/pos"),
    import("../src/lib/services/ingredient"),
  ]);
  const { createSale, voidSale, editSale, PosError } = pos;
  const { produceBatch, BatchError, createIngredient } = ingService;

  const user = await prisma.user.create({
    data: { id: "smoke-user", name: "Smoke", email: "smoke@test.local", emailVerified: false },
  });
  const category = await prisma.category.create({
    data: { id: "smoke-cat", name: "Test", type: "product" },
  });
  const ingredient = await prisma.ingredient.create({
    data: {
      id: "smoke-ing",
      name: "Susu",
      unit: "ml",
      costPerUnit: 100,
      currentStock: 5000,
      minimumStock: 100,
      isActive: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      id: "smoke-prod",
      sku: "SMOKE1",
      name: "Thai Tea",
      sellingPrice: 15000,
      hpp: 4000,
      categoryId: category.id,
      isActive: true,
    },
  });
  await prisma.productRecipe.create({
    data: { id: "smoke-rec", productId: product.id, ingredientId: ingredient.id, quantity: 40 },
  });

  const stockBefore = ingredient.currentStock;
  const sale = await createSale(user.id, [{ productId: product.id, quantity: 2, toppingIds: [] }], "CASH");
  assert.equal(sale.total, product.sellingPrice * 2);
  assert.equal(sale.grossProfit, (product.sellingPrice - product.hpp) * 2);
  assert.match(sale.invoiceNumber, /^INV-\d{8}-\d{6}$/, "format invoiceNumber benar");
  assert.equal(sale.status, "COMPLETED");

  let ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, stockBefore - 40 * 2, "stok berkurang sesuai resep");

  const movements = await prisma.inventoryMovement.findMany({
    where: { referenceType: "sale", referenceId: sale.id, type: "stock_out" },
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].unitCost, ingredient.costPerUnit, "unitCost movement = biaya per unit bahan");

  await assert.rejects(
    createSale(user.id, [{ productId: product.id, quantity: 99999, toppingIds: [] }], "CASH"),
    PosError,
    "stok tidak cukup harus ditolak",
  );

  await prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
  await assert.rejects(
    createSale(user.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH"),
    PosError,
    "produk nonaktif harus ditolak",
  );
  await prisma.product.update({ where: { id: product.id }, data: { isActive: true } });

  await voidSale(user.id, sale.id);
  ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, stockBefore, "stok kembali setelah void");
  const voided = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
  assert.equal(voided.status, "VOIDED");

  // Void ganda (klik dobel / dua tab) hanya boleh berhasil sekali, stok tidak dikembalikan dua kali.
  await assert.rejects(voidSale(user.id, sale.id), PosError, "void kedua ditolak");
  ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, stockBefore, "stok tidak bertambah dua kali");
  await assert.rejects(
    editSale(user.id, sale.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH"),
    PosError,
    "transaksi void tidak bisa diedit",
  );

  // Penjualan rugi (HPP > harga jual) tetap tercatat, tidak memblokir kasir.
  await prisma.ingredient.update({ where: { id: ingredient.id }, data: { costPerUnit: 1000 } });
  const lossSale = await createSale(user.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH");
  assert.equal(lossSale.totalHpp, 40 * 1000, "HPP dihitung dari biaya bahan terkini");
  assert.equal(lossSale.grossProfit, product.sellingPrice - 40 * 1000, "laba negatif tersimpan");
  await voidSale(user.id, lossSale.id);
  await prisma.ingredient.update({ where: { id: ingredient.id }, data: { costPerUnit: ingredient.costPerUnit } });

  const sale2 = await createSale(user.id, [{ productId: product.id, quantity: 3, toppingIds: [] }], "QRIS");
  await editSale(user.id, sale2.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH");
  const updated = await prisma.sale.findUniqueOrThrow({ where: { id: sale2.id } });
  assert.equal(updated.total, product.sellingPrice);
  assert.equal(updated.paymentMethod, "CASH");
  ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, stockBefore - 40 * 1, "stok sesuai hasil edit");

  // Laporan pemakaian bahan: konsumsi bersih transaksi selesai (3 lalu diedit jadi 1 = 40ml).
  const report = await import("../src/lib/services/report");
  const { dateRange } = await import("../src/lib/period");
  const today = dateRange("today");
  const usage = await report.ingredientUsage(today.from, today.to);
  assert.equal(usage.find((u) => u.name === "Susu")?.quantity, 40, "pemakaian = konsumsi bersih transaksi selesai");
  const sales = await report.salesSummary(today.from, today.to);
  assert.equal(sales.totalTransactions, 1, "hanya transaksi selesai yang dihitung");
  assert.equal(sales.itemsSold, 1);
  assert.equal(sales.revenue, product.sellingPrice);

  // Oversell: dua penjualan bersamaan yang masing-masing pas dengan stok sisa
  // tidak boleh dua-duanya berhasil, dan stok tidak boleh jadi negatif.
  await prisma.ingredient.update({
    where: { id: ingredient.id },
    data: { currentStock: 40 },
  });
  const results = await Promise.allSettled([
    createSale(user.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH"),
    createSale(user.id, [{ productId: product.id, quantity: 1, toppingIds: [] }], "CASH"),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(fulfilled, 1, "hanya satu dari dua penjualan bersamaan yang boleh lolos");
  ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, 0, "stok habis, tidak negatif");

  // Guard oversell diuji langsung: kalau stok turun setelah pembacaan awal
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const { count } = await tx.ingredient.updateMany({
        where: { id: ingredient.id, currentStock: { gte: 40 } },
        data: { currentStock: { decrement: 40 } },
      });
      assert.equal(count, 0, "decrement bersyarat menolak stok yang tidak cukup");
      throw new Error("rollback");
    }),
    /rollback/,
  );
  ing = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
  assert.equal(ing.currentStock, 0, "stok tetap 0, tidak negatif");

  // --- UNIT COSTING, BATCH PRODUCTION & TOPPINGS TESTS ---

  // 1. Test Unit Costing auto calculate from packPrice/packSize
  const thaiTeaPowder = await createIngredient({
    name: "Thai Tea Powder",
    unit: "gram",
    costPerUnit: 0,
    minimumStock: 100,
    currentStock: 1000,
    packPrice: 66000,
    packSize: 500,
    kind: "bahan_baku",
  });
  assert.equal(thaiTeaPowder.costPerUnit, 132, "unitCost auto calculated: 66000/500 = 132");

  const biangTeh = await createIngredient({
    name: "Biang Teh Olahan",
    unit: "ml",
    costPerUnit: 0,
    minimumStock: 500,
    currentStock: 0,
    kind: "olahan",
  });

  // 2. Test Batch Template & Batch Production (Air masuk pengeluaran/overhead, batch hanya butuh bubuk)
  const batchTemplate = await prisma.batchTemplate.create({
    data: {
      name: "Biang Teh Batch 37.5L",
      outputIngredientId: biangTeh.id,
      outputQuantity: 37500,
      components: {
        create: [
          { ingredientId: thaiTeaPowder.id, quantity: 500 },
        ],
      },
    },
  });

  // Produce 1 batch
  await produceBatch(user.id, batchTemplate.id, 1);

  const thaiAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: thaiTeaPowder.id } });
  const biangAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: biangTeh.id } });

  assert.equal(thaiAfter.currentStock, 500, "stok bubuk thai tea berkurang 500g");
  assert.equal(biangAfter.currentStock, 37500, "stok biang teh bertambah 37500ml");
  assert.equal(biangAfter.costPerUnit, 2, "biang teh costPerUnit terupdate otomatis menjadi 2/ml");

  const prodMovements = await prisma.inventoryMovement.findMany({
    where: { referenceType: "production", referenceId: batchTemplate.id },
  });
  assert.equal(prodMovements.length, 2, "ada 2 pergerakan stok produksi (1 out, 1 in)");

  // 2b. Test Manual Override (custom batch): Thai Tea 300g (60%) → Biang 22.500ml
  await prisma.ingredient.update({ where: { id: thaiTeaPowder.id }, data: { currentStock: 1000 } });
  await prisma.ingredient.update({ where: { id: biangTeh.id }, data: { currentStock: 0 } });
  await produceBatch(user.id, batchTemplate.id, 1, [
    { ingredientId: thaiTeaPowder.id, quantity: 300 },
  ]);
  const thaiAfterCustom = await prisma.ingredient.findUniqueOrThrow({ where: { id: thaiTeaPowder.id } });
  const biangAfterCustom = await prisma.ingredient.findUniqueOrThrow({ where: { id: biangTeh.id } });
  assert.equal(thaiAfterCustom.currentStock, 700, "manual override: 300g berkurang");
  assert.equal(biangAfterCustom.currentStock, 22500, "manual override: output proporsional 22.500ml");
  assert.equal(biangAfterCustom.costPerUnit, 2, "HPP output tetap 2/ml (costPerUnit sama)");

  // Restore stok untuk test selanjutnya
  await prisma.ingredient.update({ where: { id: thaiTeaPowder.id }, data: { currentStock: 1000 } });
  await prisma.ingredient.update({ where: { id: biangTeh.id }, data: { currentStock: 37500 } });

  // Validation: override duplikat ditolak
  await assert.rejects(
    produceBatch(user.id, batchTemplate.id, 1, [
      { ingredientId: thaiTeaPowder.id, quantity: 300 },
      { ingredientId: thaiTeaPowder.id, quantity: 400 },
    ]),
    BatchError,
    "override duplikat harus ditolak",
  );
  // Validation: override dengan bahan di luar template ditolak
  await assert.rejects(
    produceBatch(user.id, batchTemplate.id, 1, [
      { ingredientId: "non-template-id", quantity: 100 },
    ]),
    BatchError,
    "override bahan non-template harus ditolak",
  );

  // 2c. Test Boba Olahan (Gula Aren 100g + Bubble Boba 50g → 140g Topping Boba)
  const gulaAren = await prisma.ingredient.create({
    data: {
      name: "Gula Aren",
      unit: "gram",
      costPerUnit: 148,
      currentStock: 1000,
      minimumStock: 100,
      kind: "topping",
    },
  });
  const bubbleBoba = await prisma.ingredient.create({
    data: {
      name: "Bubble Boba",
      unit: "gram",
      costPerUnit: 33,
      currentStock: 1000,
      minimumStock: 100,
      kind: "topping",
    },
  });
  const bobaOlahan = await prisma.ingredient.create({
    data: {
      name: "Boba Olahan",
      unit: "gram",
      costPerUnit: 0,
      currentStock: 0,
      minimumStock: 100,
      kind: "olahan",
    },
  });
  const bobaTpl = await prisma.batchTemplate.create({
    data: {
      name: "Boba Olahan 140g",
      outputIngredientId: bobaOlahan.id,
      outputQuantity: 140,
      components: {
        create: [
          { ingredientId: gulaAren.id, quantity: 100 },
          { ingredientId: bubbleBoba.id, quantity: 50 },
        ],
      },
    },
  });
  await produceBatch(user.id, bobaTpl.id, 1);
  const bobaAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: bobaOlahan.id } });
  assert.equal(bobaAfter.currentStock, 140, "boba olahan 140g diproduksi");
  // HPP: (100×148 + 50×33) / 140 = (14800 + 1650) / 140 = 117.5 → 118/g
  const expectedBopaHpp = Math.round((100 * 148 + 50 * 33) / 140);
  assert.equal(bobaAfter.costPerUnit, expectedBopaHpp, `hpp boba ${(100 * 148 + 50 * 33) / 140} → ${expectedBopaHpp}`);

  // Override gula aren 60g (60%): output ~84g
  await prisma.ingredient.update({ where: { id: gulaAren.id }, data: { currentStock: 1000 } });
  await prisma.ingredient.update({ where: { id: bubbleBoba.id }, data: { currentStock: 1000 } });
  await prisma.ingredient.update({ where: { id: bobaOlahan.id }, data: { currentStock: 0 } });
  await produceBatch(user.id, bobaTpl.id, 1, [
    { ingredientId: gulaAren.id, quantity: 60 },
  ]);
  const bobaCustom = await prisma.ingredient.findUniqueOrThrow({ where: { id: bobaOlahan.id } });
  assert.equal(bobaCustom.currentStock, 84, "boba override 60% → 84g");
  // HPP boba custom: (60×148 + 50×33) / 84 = (8880 + 1650) / 84 = 125.36 → 125
  const bobaCustomHpp = Math.round((60 * 148 + 50 * 33) / 84);
  assert.equal(bobaCustom.costPerUnit, bobaCustomHpp, "HPP boba custom recompute");

  // 3. Test Product with Toppings (Base + Add-on)
  const creamCheese = await createIngredient({
    name: "CreamCheese",
    unit: "gram",
    costPerUnit: 0,
    minimumStock: 100,
    currentStock: 1000,
    packPrice: 168720,
    packSize: 1000,
    kind: "topping",
  });
  assert.equal(creamCheese.costPerUnit, 169, "CreamCheese cost 169/g");

  const thaiTeaDrink = await prisma.product.create({
    data: {
      sku: "TT-DRINK-1",
      name: "Thai Tea Cup",
      sellingPrice: 15000,
      hpp: 150 * 2, // 150ml Biang @ 2 = 300
      categoryId: category.id,
      recipes: {
        create: [{ ingredientId: biangTeh.id, quantity: 150 }],
      },
      toppings: {
        create: [{ ingredientId: creamCheese.id, quantity: 10, extraPrice: 5000 }],
      },
    },
  });

  // Jual 1 cup dengan Topping CreamCheese 10g (+Rp 5.000)
  // Expected price: 15000 + 5000 = 20000
  // Expected hpp: 300 + (10 * 169) = 1990
  const toppingSale = await createSale(
    user.id,
    [{ productId: thaiTeaDrink.id, quantity: 1, toppingIds: [creamCheese.id] }],
    "CASH",
  );
  assert.equal(toppingSale.total, 20000, "Total penjualan = base + topping");
  assert.equal(toppingSale.totalHpp, 1990, "Total HPP = base HPP + topping HPP");

  const biangAfterSale = await prisma.ingredient.findUniqueOrThrow({ where: { id: biangTeh.id } });
  const ccAfterSale = await prisma.ingredient.findUniqueOrThrow({ where: { id: creamCheese.id } });
  assert.equal(biangAfterSale.currentStock, 37500 - 150, "Stok biang berkurang 150ml");
  assert.equal(ccAfterSale.currentStock, 1000 - 10, "Stok CreamCheese berkurang 10g");

  const saleItemToppings = await prisma.saleItemTopping.findMany({
    where: { ingredientId: creamCheese.id },
  });
  assert.equal(saleItemToppings.length, 1, "SaleItemTopping tersimpan untuk audit");
  assert.equal(saleItemToppings[0].extraPrice, 5000);
  assert.equal(saleItemToppings[0].quantity, 10);
  assert.equal(saleItemToppings[0].unitCost, 169);

  // Void sale dengan topping -> cek kedua stok kembali
  await voidSale(user.id, toppingSale.id);
  const biangVoid = await prisma.ingredient.findUniqueOrThrow({ where: { id: biangTeh.id } });
  const ccVoid = await prisma.ingredient.findUniqueOrThrow({ where: { id: creamCheese.id } });
  assert.equal(biangVoid.currentStock, 37500, "Stok biang kembali setelah void");
  assert.equal(ccVoid.currentStock, 1000, "Stok cream cheese kembali setelah void");

  // --- HPP RECOMPUTE CHAIN INVARIANT ---
  // Update costPerUnit bahan harus otomatis update Product.hpp (tidak statis).
  const pin = await ingService.createIngredient({
    name: "Susu Pin",
    unit: "ml",
    costPerUnit: 100,
    minimumStock: 100,
    currentStock: 5000,
  });
  const pinProd = await prisma.product.create({
    data: {
      sku: "PIN-PROD",
      name: "Pin Product",
      sellingPrice: 12000,
      hpp: 0,
      categoryId: category.id,
      recipes: { create: [{ ingredientId: pin.id, quantity: 40 }] },
    },
    include: { recipes: true },
  });
  // Recompute on update: hpp = 40 * 100 = 4000
  const productService = await import("../src/lib/services/product");
  const { productSchema } = await import("../src/lib/schemas");
  const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: pinProd.id }, include: { recipes: { include: { ingredient: true } } } });
  // Edit produk nonaktif tidak boleh mengaktifkannya kembali.
  await prisma.product.update({ where: { id: pinProd.id }, data: { isActive: false } });
  await productService.updateProduct(
    pinProd.id,
    productSchema.parse({
      sku: "PIN-PROD",
      name: "Pin Product",
      categoryId: category.id,
      sellingPrice: 12000,
      description: "",
      imageUrl: "",
      recipes: refreshed.recipes.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity })),
      toppings: [],
    }),
  );
  const afterCreate = await prisma.product.findUniqueOrThrow({ where: { id: pinProd.id } });
  assert.equal(afterCreate.hpp, 4000, "HPP product recomputed on recipe update");
  assert.equal(afterCreate.isActive, false, "edit tidak mengubah status aktif");

  // Kategori produk harus bertipe product.
  const expenseCat = await prisma.category.create({ data: { name: "Listrik", type: "expense" } });
  await assert.rejects(
    productService.updateProduct(pinProd.id, productSchema.parse({ sku: "PIN-PROD", name: "Pin Product", categoryId: expenseCat.id, sellingPrice: 1, recipes: [] })),
    productService.ProductError,
    "kategori pengeluaran ditolak untuk produk",
  );

  // Update ingredient cost → product hpp ikut berubah; bahan nonaktif tetap nonaktif.
  await ingService.setIngredientActive(pin.id, false);
  await ingService.updateIngredient(pin.id, {
    name: "Susu Pin",
    unit: "ml",
    costPerUnit: 150,
    minimumStock: 100,
  });
  const afterCostChange = await prisma.product.findUniqueOrThrow({ where: { id: pinProd.id } });
  assert.equal(afterCostChange.hpp, 6000, "HPP product recomputed on ingredient cost update (40ml * 150 = 6000)");
  const pinAfter = await prisma.ingredient.findUniqueOrThrow({ where: { id: pin.id } });
  assert.equal(pinAfter.isActive, false, "edit bahan tidak mengaktifkannya kembali");

  // Penyesuaian stok ke 0 (bahan habis/dibuang) harus bisa dicatat.
  await ingService.adjustStock(user.id, pin.id, 0, "Basi");
  assert.equal((await prisma.ingredient.findUniqueOrThrow({ where: { id: pin.id } })).currentStock, 0);

  // Alokasi rekening: pengeluaran dibebankan ke rekening kategorinya, persen tersimpan.
  const { allocationSummary, updateAllocation, getAllocation } = await import("../src/lib/services/allocation");
  assert.deepEqual(await getAllocation(), { operationalPct: 40, payrollPct: 40, emergencyPct: 20 }, "default 40/40/20");
  const salaryCat = await prisma.category.create({ data: { name: "Gaji Karyawan", type: "expense", account: "payroll" } });
  const opsCat = await prisma.category.create({ data: { name: "Gas", type: "expense" } });
  const day = new Date();
  await prisma.expense.createMany({
    data: [
      { categoryId: salaryCat.id, userId: user.id, amount: 300000, expenseDate: day },
      { categoryId: opsCat.id, userId: user.id, amount: 5000, expenseDate: day },
    ],
  });
  const allocFrom = new Date(day.getTime() - 3600_000);
  const allocTo = new Date(day.getTime() + 3600_000);
  const alloc = await allocationSummary(allocFrom, allocTo);
  const acc = Object.fromEntries(alloc.accounts.map((a) => [a.account, a]));
  assert.equal(
    alloc.accounts.reduce((s, a) => s + a.allocated, 0),
    alloc.revenue,
    "total jatah rekening = omzet",
  );
  assert.equal(acc.payroll.spent, 300000, "gaji memotong Profit & Payroll");
  assert.equal(acc.operational.spent, 5000, "kategori default memotong Operasional");
  assert.equal(acc.emergency.spent, 0);
  assert.equal(acc.payroll.balance, acc.payroll.allocated - 300000);
  await updateAllocation({ operationalPct: 50, payrollPct: 30, emergencyPct: 20 });
  assert.equal((await allocationSummary(allocFrom, allocTo)).pct.payrollPct, 30, "persen tersimpan");
  await assert.rejects(
    prisma.allocationSetting.update({ where: { id: "default" }, data: { payrollPct: 90 } }),
    "CHECK DB menolak total persen != 100",
  );

  // Pembelian persediaan tetap kas keluar, bukan beban kedua setelah HPP.
  const { profitSummary, expenseSummary, dailySeries } = await import("../src/lib/services/report");
  const { createExpense } = await import("../src/lib/services/expense");
  const { expenseSchema } = await import("../src/lib/schemas");
  const { localDateKey, startOfDayWib, endOfDayWib } = await import("../src/lib/period");
  const reportFrom = startOfDayWib();
  const reportTo = endOfDayWib();
  const beforeReport = await profitSummary(reportFrom, reportTo);
  const beforeCash = await expenseSummary(reportFrom, reportTo);
  const beforeAllocation = await allocationSummary(reportFrom, reportTo);
  const materials = await prisma.category.create({
    data: { name: "Bahan Baku", type: "expense", isInventoryPurchase: true },
  });
  const inventoryExpense = await createExpense(user.id, expenseSchema.parse({
    categoryId: materials.id, amount: 100000, expenseDate: localDateKey(), paymentMethod: "CASH",
  }));
  const afterInventory = await profitSummary(reportFrom, reportTo);
  assert.equal(afterInventory.netProfit, beforeReport.netProfit, "pembelian stok tidak mengurangi laba dua kali");
  assert.equal(afterInventory.operatingExpenses, beforeReport.operatingExpenses);
  assert.equal((await expenseSummary(reportFrom, reportTo)).total, beforeCash.total + 100000, "pembelian tetap kas keluar");
  const afterAllocation = await allocationSummary(reportFrom, reportTo);
  assert.equal(
    afterAllocation.accounts.find((a) => a.account === "operational")!.spent,
    beforeAllocation.accounts.find((a) => a.account === "operational")!.spent + 100000,
    "pembelian tetap memotong rekening Operasional",
  );
  const expense = await createExpense(user.id, expenseSchema.parse({
    categoryId: expenseCat.id, amount: 20000, expenseDate: localDateKey(), paymentMethod: "CASH",
  }));
  assert.equal((await profitSummary(reportFrom, reportTo)).netProfit, beforeReport.netProfit - 20000, "beban usaha tetap mengurangi laba");
  const series = await dailySeries(reportFrom, reportTo);
  assert.equal(series.reduce((s, d) => s + d.netProfit, 0), beforeReport.netProfit - 20000, "grafik dan ringkasan laba memakai klasifikasi sama");
  assert.equal(series.reduce((s, d) => s + d.expense, 0), beforeCash.total + 120000, "grafik Pengeluaran tetap menunjukkan arus kas");
  await prisma.expense.deleteMany({ where: { id: { in: [inventoryExpense.id, expense.id] } } });

  await prisma.$disconnect();
  rmSync(DB_FILE);
  console.log("smoke tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
