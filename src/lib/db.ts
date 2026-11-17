import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL wajib di-set di production");
}

// Fallback dev: kunci path DB ke project root yang diturunkan dari lokasi file ini,
// bukan process.cwd(). Menjalankan `next dev` dari subfolder lain tidak akan
// diam-diam memakai file SQLite berbeda. Gunakan fileURLToPath agar path Windows
// dengan spasi / drive letter tidak rusak.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEV_DB_URL = `file:${path.join(PROJECT_ROOT, "prisma", "dev.db")}`;

function createClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? DEV_DB_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;