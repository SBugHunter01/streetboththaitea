-- Pembelian persediaan mengurangi dana rekening, tetapi biaya penjualan sudah diakui melalui HPP.
ALTER TABLE "Category" ADD COLUMN "isInventoryPurchase" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Category" SET "isInventoryPurchase" = true
WHERE "type" = 'expense' AND "name" IN ('Bahan Baku', 'Packaging');

-- Kategori gaji yang sudah ada sebelum fund_accounts menerima default operational.
UPDATE "Category" SET "account" = 'payroll'
WHERE "type" = 'expense' AND "name" = 'Gaji Karyawan';
