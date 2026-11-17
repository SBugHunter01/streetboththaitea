import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  if (!process.env.APP_URL) throw new Error("APP_URL wajib di-set di production");
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET wajib di-set di production");
}

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // MVP hanya punya satu akun admin yang dibuat lewat seed. Endpoint
    // sign-up publik harus mati, kalau tidak siapa pun bisa mendaftar.
    disableSignUp: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 5,
  },
  user: {
    additionalFields: {
      // Default "cashier" (sama dengan default kolom DB) supaya akun baru yang
      // dibuat di luar seed tidak otomatis menjadi admin, sehingga
      // requireAdmin() bermakna. Admin pertama dibuat lewat seed.
      role: {
        type: "string",
        required: false,
        defaultValue: "cashier",
        input: false,
      },
    },
  },
  trustedOrigins: [appUrl],
});

export type User = typeof auth.$Infer.Session.user;
