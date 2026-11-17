-- Migration: fund_accounts
-- Pembagian tiga rekening (Operasional, Profit & Payroll, Emergency & Growth).
-- Category.account memakai ADD COLUMN, bukan rebuild tabel, agar data dan
-- relasi FK Product/Expense ke Category tidak disentuh.

CREATE TABLE "AllocationSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "operationalPct" INTEGER NOT NULL,
    "payrollPct" INTEGER NOT NULL,
    "emergencyPct" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "allocation_pct_valid" CHECK (
        "operationalPct" >= 0 AND "payrollPct" >= 0 AND "emergencyPct" >= 0
        AND "operationalPct" + "payrollPct" + "emergencyPct" = 100
    )
);

ALTER TABLE "Category" ADD COLUMN "account" TEXT NOT NULL DEFAULT 'operational'
    CONSTRAINT "category_account_valid" CHECK ("account" IN ('operational', 'payroll', 'emergency'));

-- Kategori pengeluaran bawaan yang termasuk belanja aset/perbaikan.
UPDATE "Category" SET "account" = 'emergency'
WHERE "type" = 'expense' AND "name" IN ('Peralatan', 'Maintenance');
