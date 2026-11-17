-- Selaraskan database dengan schema.prisma:
-- 1. Sale: hapus DEFAULT 'OTHER' pada paymentMethod (drift dari migrasi
--    hardening; tanpa ini `prisma migrate dev` berikutnya membangun ulang Sale
--    dan diam-diam membuang semua CHECK). CHECK grossProfit >= 0 dihapus karena
--    penjualan rugi (HPP > harga jual) harus tetap tercatat, bukan memblokir kasir.
-- 2. User.role default 'cashier', sama dengan konfigurasi better-auth: akun yang
--    dibuat tanpa role eksplisit tidak boleh otomatis menjadi admin.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "totalHpp" INTEGER NOT NULL,
    "grossProfit" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_status_valid" CHECK ("status" IN ('COMPLETED', 'VOIDED')),
    CONSTRAINT "sale_payment_valid" CHECK ("paymentMethod" IN ('CASH', 'QRIS', 'TRANSFER', 'OTHER')),
    CONSTRAINT "sale_amounts_nonneg" CHECK ("subtotal" >= 0 AND "total" >= 0 AND "totalHpp" >= 0)
);
INSERT INTO "new_Sale" ("id", "invoiceNumber", "userId", "subtotal", "total", "totalHpp", "grossProfit", "paymentMethod", "status", "createdAt", "updatedAt")
SELECT "id", "invoiceNumber", "userId", "subtotal", "total", "totalHpp", "grossProfit", "paymentMethod", "status", "createdAt", "updatedAt" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX "Sale_status_createdAt_idx" ON "Sale"("status", "createdAt");

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("id", "name", "email", "emailVerified", "image", "role", "createdAt", "updatedAt")
SELECT "id", "name", "email", "emailVerified", "image", "role", "createdAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
