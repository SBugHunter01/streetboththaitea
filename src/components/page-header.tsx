import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Judul halaman adalah satu-satunya teks besar di layar. Deskripsi duduk
 * tepat di bawahnya sebagai meta 13px, bukan baris kedua yang bersaing.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && (
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
