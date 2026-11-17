import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { pageParam, sp } from "@/lib/search-params";
import { catalogProductSelect, saleWithItemsInclude } from "@/lib/types";
import { TransactionsClient } from "./transactions-client";

const PAGE_SIZE = 15;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  await requireUser();
  const p = await searchParams;
  const status = sp(p.status) === "VOIDED" ? "VOIDED" : "COMPLETED";

  const [total, products] = await Promise.all([
    prisma.sale.count({ where: { status } }),
    prisma.product.findMany({ where: { isActive: true }, select: catalogProductSelect, orderBy: { name: "asc" } }),
  ]);
  const page = Math.min(pageParam(p.page), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const sales = await prisma.sale.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: saleWithItemsInclude,
  });

  return (
    <TransactionsClient
      sales={sales}
      products={products}
      page={page}
      totalItems={total}
      pageSize={PAGE_SIZE}
      status={status}
    />
  );
}
