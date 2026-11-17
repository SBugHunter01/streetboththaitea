import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { movementQuerySchema } from "@/lib/schemas";
import { movementListSelect } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Riwayat stok adalah data biaya internal, sejajar dengan aksi mutasi
    // gudang, jadi dibatasi ke admin dan bukan ke sembarang sesi yang valid.
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const parsed = movementQuerySchema.safeParse({
      ingredientId: request.nextUrl.searchParams.get("ingredientId") ?? "",
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    const movements = await prisma.inventoryMovement.findMany({
      where: { ingredientId: parsed.data.ingredientId },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      select: movementListSelect,
    });
    return NextResponse.json(movements, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/movements]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
