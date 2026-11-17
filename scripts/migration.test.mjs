import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import Database from "better-sqlite3";

const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migrations = readdirSync(migrationRoot).filter((name) => /^\d/.test(name)).sort();
const fix = "20261104060000_inventory_purchase_and_payroll_backfill";
const sql = (name) => readFileSync(new URL(`${name}/migration.sql`, migrationRoot), "utf8");
const db = new Database(":memory:");
try {
  for (const name of migrations.filter((m) => m < "20261104022658_fund_accounts")) db.exec(sql(name));
  const insert = db.prepare('INSERT INTO "Category" (id, name, type, updatedAt) VALUES (?, ?, ?, ?)');
  for (const [id, name, type] of [
    ["salary", "Gaji Karyawan", "expense"],
    ["materials", "Bahan Baku", "expense"],
    ["packaging", "Packaging", "expense"],
    ["equipment", "Peralatan", "expense"],
    ["gas", "Gas", "expense"],
    ["product", "Bahan Baku", "product"],
  ]) insert.run(id, name, type, "2026-01-01T00:00:00.000+00:00");
  for (const name of migrations.filter((m) => m >= "20261104022658_fund_accounts" && m < fix)) db.exec(sql(name));
  assert.equal(db.prepare('SELECT account FROM "Category" WHERE id = ?').get("salary").account, "operational");
  for (const name of migrations.filter((m) => m >= fix)) db.exec(sql(name));
  const get = (id) => db.prepare('SELECT account, isInventoryPurchase FROM "Category" WHERE id = ?').get(id);
  assert.deepEqual(get("salary"), { account: "payroll", isInventoryPurchase: 0 });
  assert.deepEqual(get("materials"), { account: "operational", isInventoryPurchase: 1 });
  assert.deepEqual(get("packaging"), { account: "operational", isInventoryPurchase: 1 });
  assert.deepEqual(get("equipment"), { account: "emergency", isInventoryPurchase: 0 });
  assert.deepEqual(get("gas"), { account: "operational", isInventoryPurchase: 0 });
  assert.deepEqual(get("product"), { account: "operational", isInventoryPurchase: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "Category"').get().n, 6);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.throws(() => db.prepare('UPDATE "Category" SET account = ? WHERE id = ?').run("invalid", "salary"), /CHECK/);
  assert.throws(() => db.prepare('INSERT INTO "AllocationSetting" (operationalPct,payrollPct,emergencyPct,updatedAt) VALUES (40,40,40,?)').run("2026-01-01"), /CHECK/);
  console.log("migration tests passed");
} finally {
  db.close();
}
