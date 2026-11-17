"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export function Pagination({ page, totalPages, totalItems, pageSize }: PaginationProps) {
  const params = useSearchParams();
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  function href(next: number) {
    const search = new URLSearchParams(params.toString());
    search.set("page", String(next));
    const qs = search.toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <div className="flex items-center justify-between gap-2 pt-4">
      <p className="text-sm text-muted-foreground">
        Menampilkan {start}–{end} dari {totalItems}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page - 1)} aria-label="Halaman sebelumnya">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled aria-label="Halaman sebelumnya">
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <span className="px-2 text-sm text-muted-foreground">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={href(page + 1)} aria-label="Halaman berikutnya">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled aria-label="Halaman berikutnya">
            <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}