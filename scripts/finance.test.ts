import { strict as assert } from "node:assert";
import {
  calcProductHpp,
  calcSaleItemTotals,
  calcSaleTotals,
  calcGrossProfit,
  calcNetProfit,
  calcMargin,
  calcUnitCost,
  calcBatchCost,
  calcAllocation,
  roundQty,
} from "../src/lib/finance";
import {
  parseWibDate,
  isDateKey,
  localDateKey,
  monthRange,
  previousRange,
  dateRange,
  periodFromParams,
} from "../src/lib/period";
import { pageParam } from "../src/lib/search-params";
import { rupiahShort, percentDelta, date, dateTime } from "../src/lib/format";
import { invoiceNumber } from "../src/lib/invoice";
import { posItemsSchema, expenseSchema, productSchema, ingredientSchema, allocationSchema } from "../src/lib/schemas";
import { toSafeError, AppError } from "../src/lib/safe-error";

assert.equal(calcProductHpp([{ quantity: 40, costPerUnit: 50 }]), 2000);
assert.equal(
  calcProductHpp([
    { quantity: 40, costPerUnit: 50 },
    { quantity: 100, costPerUnit: 25 },
    { quantity: 30, costPerUnit: 30 },
    { quantity: 50, costPerUnit: 40 },
    { quantity: 80, costPerUnit: 5 },
    { quantity: 1, costPerUnit: 700 },
  ]),
  8500,
);
assert.equal(calcProductHpp([]), 0);
assert.deepEqual(calcProductHpp([{ quantity: 0.33, costPerUnit: 1000 }]), 330);

assert.deepEqual(calcSaleItemTotals({ sellingPrice: 15000, hpp: 8500, quantity: 2 }), {
  subtotal: 30000,
  totalHpp: 17000,
  grossProfit: 13000,
});

assert.deepEqual(
  calcSaleTotals([
    { subtotal: 15000, totalHpp: 8500, grossProfit: 6500 },
    { subtotal: 10000, totalHpp: 6500, grossProfit: 3500 },
  ]),
  { subtotal: 25000, totalHpp: 15000, grossProfit: 10000 },
);

assert.equal(calcGrossProfit(25000, 15000), 10000);
assert.equal(calcNetProfit(10000, 3000), 7000);
assert.equal(calcMargin(10000, 25000), 40);
assert.equal(calcMargin(7000, 25000), 28);
assert.equal(calcMargin(100, 0), 0);
assert.equal(calcMargin(-100, 0), 0);
assert.equal(calcMargin(500, 10000), 5);
assert.equal(calcMargin(100, 10000), 1);
assert.equal(calcMargin(333, 10000), 3.33);
assert.equal(calcMargin(-5000, 10000), -50, "margin negatif untuk penjualan rugi");

const feb = parseWibDate("2026-02-10");
assert.equal(feb.toISOString(), "2026-02-09T17:00:00.000Z", "00:00 WIB = 17:00 UTC hari sebelumnya");
assert.equal(localDateKey(feb), "2026-02-10");
assert.equal(localDateKey(new Date("2026-02-10T16:59:59.999Z")), "2026-02-10");
assert.equal(localDateKey(new Date("2026-02-10T17:00:00.000Z")), "2026-02-11", "pergantian hari WIB");

assert.ok(isDateKey("2024-02-29"));
assert.ok(!isDateKey("2026-02-29"), "bukan tahun kabisat");
assert.ok(!isDateKey("2026-02-31"));
assert.ok(!isDateKey("2026-1-05"));
assert.ok(!isDateKey("abc"));

const r = monthRange("2026-02")!;
assert.equal(localDateKey(r.from), "2026-02-01");
assert.equal(localDateKey(r.to), "2026-02-28");
const leap = monthRange("2024-02")!;
assert.equal(localDateKey(leap.to), "2024-02-29");
const dec = monthRange("2026-12")!;
assert.equal(localDateKey(dec.from), "2026-12-01");
assert.equal(localDateKey(dec.to), "2026-12-31");
// Bulan dari URL tidak dipercaya: format rusak = tanpa filter, bukan crash 500.
assert.equal(monthRange("abc"), null);
assert.equal(monthRange("2026-13"), null);
assert.equal(monthRange(""), null);

// searchParams rusak tidak boleh membuat halaman crash.
assert.equal(pageParam(undefined), 1);
assert.equal(pageParam("abc"), 1);
assert.equal(pageParam("-3"), 1);
assert.equal(pageParam("2.7"), 2, "halaman pecahan dibulatkan ke bawah");
assert.equal(pageParam(["3", "4"]), 1);
assert.equal(periodFromParams({ period: "xyz" }).period, "month");
assert.equal(periodFromParams({ period: "toString" }).period, "month", "bukan key prototype");
const badCustom = periodFromParams({ period: "custom", from: "zzz", to: "2026-99-99" });
assert.ok(!isNaN(badCustom.from.getTime()) && !isNaN(badCustom.to.getTime()), "tanggal kustom rusak jatuh ke hari ini");
const swapped = periodFromParams({ period: "custom", from: "2026-03-10", to: "2026-03-01" });
assert.equal(localDateKey(swapped.from), "2026-03-01", "rentang terbalik ditukar");
assert.equal(localDateKey(swapped.to), "2026-03-10");

// Tampilan tanggal selalu WIB, apa pun zona waktu server.
assert.equal(date(new Date("2026-02-10T18:00:00Z")), date(new Date("2026-02-11T05:00:00Z")), "01:00 WIB tgl 11");
assert.match(dateTime(new Date("2026-02-10T18:30:00Z")), /01[.:]30/, "jam ditampilkan dalam WIB");

// Nomor invoice mengikuti tanggal WIB: 18:00 UTC tgl 19 = 01:00 WIB tgl 20.
assert.match(invoiceNumber(new Date("2026-08-19T05:00:00Z")), /^INV-20260819-\d{6}$/);
assert.match(invoiceNumber(new Date("2026-08-19T18:00:00Z")), /^INV-20260820-\d{6}$/);
// 6 digit acak (1 juta slot per hari). Tabrakan tetap mungkin secara statistik
// pada sampel besar — retry P2002 di createSale yang menanganinya — tapi laju
// tabrakan harus sangat rendah. Dengan 4 digit lama (9.000 slot), 1.000 sampel
// hampir pasti punya puluhan duplikat.
const numbers = Array.from({ length: 1000 }, () => invoiceNumber());
assert.ok(
  new Set(numbers).size >= 995,
  `invoiceNumber terlalu sering bertabrakan: ${new Set(numbers).size}/1000 unik`,
);

assert.equal(roundQty(0.1 + 0.2), 0.3, "noise floating-point stok dibuang");
assert.equal(roundQty(40 * 3), 120);

// previousRange: rentang pembanding harus sama panjang dan berakhir tepat
// sebelum periode sekarang, tanpa hari yang tumpang tindih atau terlewat.
const feb2026 = monthRange("2026-02")!;
const beforeFeb = previousRange(feb2026);
assert.equal(localDateKey(beforeFeb.to), "2026-01-31");
assert.equal(localDateKey(beforeFeb.from), "2026-01-04");
assert.ok(beforeFeb.to < feb2026.from, "periode pembanding tidak boleh tumpang tindih");
assert.equal(
  Math.round(feb2026.to.getTime() - feb2026.from.getTime()),
  Math.round(beforeFeb.to.getTime() - beforeFeb.from.getTime()),
  "panjang periode pembanding harus sama",
);

// "Hari ini" dibanding "kemarin", bukan sebagian hari ini.
const todayRange = dateRange("today");
const yesterdayCmp = previousRange(todayRange);
assert.equal(
  localDateKey(yesterdayCmp.from),
  localDateKey(dateRange("yesterday").from),
);

assert.equal(rupiahShort(0), "0");
assert.equal(rupiahShort(950), "950");
assert.equal(rupiahShort(1200), "1,2 rb");
assert.equal(rupiahShort(15000), "15 rb");
assert.equal(rupiahShort(1_200_000), "1,2 jt");
assert.equal(rupiahShort(24_000_000), "24 jt");
assert.equal(rupiahShort(-1_500_000), "-1,5 jt");

// Basis nol: persen tidak terdefinisi, jangan tampilkan angka menyesatkan.
assert.equal(percentDelta(500, 0), null);
assert.equal(percentDelta(150, 100), 50);
assert.equal(percentDelta(50, 100), -50);
// Basis negatif (periode lalu merugi): magnitudo dipakai supaya arah tandanya
// tetap benar — rugi mengecil harus terbaca sebagai perbaikan.
assert.equal(percentDelta(-50, -100), 50);

// Unit costing tests
assert.equal(calcUnitCost(66000, 500), 132); // Thai Tea Rp66.000 / 500g = 132/g
assert.equal(calcUnitCost(133200, 500), 266); // Matcha Rp133.200 / 500g = 266/g
assert.equal(calcUnitCost(38850, 50), 777); // Cup 22 oz Rp38.850 / 50pcs = 777/pcs
assert.equal(calcUnitCost(5550, 50), 111); // Tutup Cup Rp5.550 / 50pcs = 111/pcs

// Batch costing tests (Biang Teh: 500g Thai Tea @132 -> 37.500ml, air masuk operasional)
// Total biaya = 500 * 132 = 66.000. 66.000 / 37.500 = 1.76 -> round = 2 / ml
assert.equal(
  calcBatchCost(
    [
      { quantity: 500, costPerUnit: 132 },
    ],
    37500,
  ),
  2,
);
// Recipe with 150ml Biang Teh @2/ml = 300
assert.equal(calcProductHpp([{ quantity: 150, costPerUnit: 2 }]), 300);

// --- Validasi input (trust boundary server action) ---

// Baris POS kembar digabung; total per baris tetap dibatasi 99.
const merged = posItemsSchema.parse([
  { productId: "p1", quantity: 2, toppingIds: ["b", "a"] },
  { productId: "p1", quantity: 3, toppingIds: ["a", "b", "a"] },
  { productId: "p1", quantity: 1 },
]);
assert.deepEqual(merged, [
  { productId: "p1", quantity: 5, toppingIds: ["a", "b"] },
  { productId: "p1", quantity: 1, toppingIds: [] },
]);
assert.equal(
  posItemsSchema.safeParse([{ productId: "p1", quantity: 60 }, { productId: "p1", quantity: 60 }]).success,
  false,
  "penggabungan tidak boleh diam-diam memotong jumlah di atas 99",
);
assert.equal(posItemsSchema.safeParse([{ productId: "p1", quantity: 1.5 }]).success, false, "jumlah harus bulat");
assert.equal(posItemsSchema.safeParse([]).success, false, "minimal 1 item");

// Tanggal pengeluaran: hari ini (WIB) boleh, besok tidak.
const expenseBase = { categoryId: "x", amount: 1000 };
const tomorrow = localDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
assert.ok(expenseSchema.safeParse({ ...expenseBase, expenseDate: localDateKey() }).success, "hari ini valid");
assert.equal(
  expenseSchema.safeParse({ ...expenseBase, expenseDate: tomorrow }).success,
  false,
  "besok ditolak (dulu lolos karena off-by-one)",
);
assert.equal(expenseSchema.safeParse({ ...expenseBase, expenseDate: "2026-02-31" }).success, false);
assert.equal(expenseSchema.parse({ ...expenseBase, expenseDate: "2026-01-15" }).paymentMethod, "OTHER");
assert.equal(expenseSchema.parse({ ...expenseBase, expenseDate: "2026-01-15", description: "  " }).description, null);

const productBase = { sku: "A", name: "A", categoryId: "c", sellingPrice: 1000 };
assert.ok(productSchema.safeParse({ ...productBase, recipes: [] }).success);
assert.equal(
  productSchema.safeParse({ ...productBase, recipes: [{ ingredientId: "i", quantity: 1 }, { ingredientId: "i", quantity: 2 }] }).success,
  false,
  "bahan resep duplikat ditolak",
);
assert.equal(
  productSchema.safeParse({
    ...productBase,
    recipes: [{ ingredientId: "i", quantity: 1 }],
    toppings: [{ ingredientId: "i", quantity: 1, extraPrice: 0 }],
  }).success,
  false,
  "topping tidak boleh sama dengan resep base",
);
assert.equal(productSchema.safeParse({ ...productBase, recipes: [], imageUrl: "javascript:alert(1)" }).success, false);

const ingBase = { name: "X", unit: "g", costPerUnit: 1, minimumStock: 0 };
assert.ok(ingredientSchema.safeParse(ingBase).success);
assert.equal(ingredientSchema.safeParse({ ...ingBase, packPrice: 1000 }).success, false, "pack harus berpasangan");
assert.equal(ingredientSchema.safeParse({ ...ingBase, kind: "random" }).success, false);

// Alokasi tiga rekening: HPP ke Operasional, sisa laba kotor dibagi persen; total selalu = omzet.
const pct404020 = { operationalPct: 40, payrollPct: 40, emergencyPct: 20 };
assert.deepEqual(calcAllocation(100000, 40000, pct404020), { operational: 64000, payroll: 24000, emergency: 12000 });
const odd = calcAllocation(10001, 0, { operationalPct: 33, payrollPct: 33, emergencyPct: 34 });
assert.equal(odd.operational + odd.payroll + odd.emergency, 10001, "pembulatan tidak menghilangkan rupiah");
assert.deepEqual(
  calcAllocation(1, 0, { operationalPct: 0, payrollPct: 50, emergencyPct: 50 }),
  { operational: 0, payroll: 1, emergency: 0 },
  "satu rupiah tidak boleh dibagikan dua kali",
);
for (let operationalPct = 0; operationalPct <= 100; operationalPct++) {
  for (let payrollPct = 0; payrollPct <= 100 - operationalPct; payrollPct++) {
    const pct = { operationalPct, payrollPct, emergencyPct: 100 - operationalPct - payrollPct };
    for (let profit = 0; profit <= 100; profit++) {
      const hpp = 100;
      const revenue = hpp + profit;
      const allocated = calcAllocation(revenue, hpp, pct);
      assert.ok(Object.values(allocated).every((n) => Number.isInteger(n) && n >= 0), "jatah bulat dan tidak negatif");
      assert.ok(allocated.operational >= hpp, "pembulatan tidak mengambil cadangan HPP");
      assert.equal(allocated.operational + allocated.payroll + allocated.emergency, revenue, "total jatah = omzet");
    }
  }
}
assert.deepEqual(calcAllocation(10000, 12000, pct404020), { operational: 10000, payroll: 0, emergency: 0 }, "rugi: tidak ada laba dibagi");
assert.deepEqual(calcAllocation(0, 0, pct404020), { operational: 0, payroll: 0, emergency: 0 });
assert.ok(allocationSchema.safeParse(pct404020).success);
assert.equal(allocationSchema.safeParse({ operationalPct: 50, payrollPct: 30, emergencyPct: 30 }).success, false, "total harus 100");
assert.equal(allocationSchema.safeParse({ operationalPct: 110, payrollPct: -10, emergencyPct: 0 }).success, false);
assert.equal(allocationSchema.safeParse({ operationalPct: 40.5, payrollPct: 39.5, emergencyPct: 20 }).success, false);

// Pesan error ke klien: pesan bisnis diteruskan, detail internal disembunyikan.
assert.equal(toSafeError(new AppError("Stok habis")), "Stok habis");
const zodErr = posItemsSchema.safeParse([]);
assert.ok(!zodErr.success && toSafeError(zodErr.error).startsWith("Input tidak valid"));
const origError = console.error;
console.error = () => {};
assert.equal(toSafeError(new Error("SQLITE_CONSTRAINT: secret table detail")), "Terjadi kesalahan. Coba lagi.");
console.error = origError;

console.log("finance tests passed");