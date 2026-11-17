import { requireUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { pageParam } from "@/lib/search-params";
import { batchTemplateInclude } from "@/lib/types";
import { IngredientsClient } from "./ingredients-client";

const PAGE_SIZE = 15;

export default async function IngredientsPage({ searchParams }: PageProps<"/ingredients">) {
  await requireUser();
  const total = await prisma.ingredient.count();
  const page = Math.min(pageParam((await searchParams).page), Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const [ingredients, templates] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.batchTemplate.findMany({ include: batchTemplateInclude, orderBy: { name: "asc" } }),
  ]);

  return (
    <IngredientsClient
      ingredients={ingredients}
      templates={templates}
      page={page}
      totalItems={total}
      pageSize={PAGE_SIZE}
    />
  );
}
