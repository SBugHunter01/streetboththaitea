-- Migration: hardening_constraints_indexes
-- Tambah: indexes untuk query panas, UNIQUE pada Ingredient.name + BatchTemplate.name,
-- FK relations User ↔ Sale/Expense (rebuild), CHECK constraints untuk non-negatif values.

-- Indexes (tanpa ALTER, langsung CREATE)
CREATE INDEX IF NOT EXISTS "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX IF NOT EXISTS "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX IF NOT EXISTS "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_productId_idx" ON "SaleItem"("productId");
CREATE INDEX IF NOT EXISTS "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX IF NOT EXISTS "Expense_userId_idx" ON "Expense"("userId");
CREATE INDEX IF NOT EXISTS "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");
CREATE INDEX IF NOT EXISTS "InventoryMovement_ingredientId_createdAt_idx" ON "InventoryMovement"("ingredientId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_ingredientId_referenceId_idx" ON "InventoryMovement"("ingredientId", "referenceId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Product_isActive_name_idx" ON "Product"("isActive", "name");
CREATE INDEX IF NOT EXISTS "Ingredient_isActive_name_idx" ON "Ingredient"("isActive", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Ingredient_name_key" ON "Ingredient"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "BatchTemplate_name_key" ON "BatchTemplate"("name");

-- Ponytail: SQLite tidak mendukung ALTER TABLE ADD CONSTRAINT untuk FK dan CHECK.
-- Rebuild Sale dan Expense untuk relasi User + CHECK constraints.
-- Tabel lain (Product, Ingredient, SaleItem) cukup ALTER TABLE ADD COLUMN CHECK via parseable raw SQL.

-- Rebuild Sale
PRAGMA foreign_keys=off;

CREATE TABLE "Sale_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "totalHpp" INTEGER NOT NULL,
    "grossProfit" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'OTHER',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_status_valid" CHECK ("status" IN ('COMPLETED', 'VOIDED')),
    CONSTRAINT "sale_payment_valid" CHECK ("paymentMethod" IN ('CASH', 'QRIS', 'TRANSFER', 'OTHER')),
    CONSTRAINT "sale_amounts_nonneg" CHECK ("subtotal" >= 0 AND "total" >= 0 AND "totalHpp" >= 0 AND "grossProfit" >= 0)
);

INSERT INTO "Sale_new" SELECT * FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "Sale_new" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");

-- Rebuild Expense
CREATE TABLE "Expense_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "paymentMethod" TEXT NOT NULL DEFAULT 'OTHER',
    "expenseDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "expense_amount_pos" CHECK ("amount" > 0)
);

INSERT INTO "Expense_new" SELECT * FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "Expense_new" RENAME TO "Expense";
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_userId_idx" ON "Expense"("userId");
CREATE INDEX "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");

PRAGMA foreign_keys=on;
