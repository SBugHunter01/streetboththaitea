import { percentDelta, signedPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Satu metrik: label 12px, angka besar, delta sebagai pil.
 * Delta hanya muncul kalau ada pembanding — angka tanpa konteks lebih jujur
 * daripada panah dekoratif yang selalu hijau.
 */
export function StatCard({
  title,
  value,
  hint,
  current,
  previous,
  invertDelta = false,
  emphasis = false,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  /** Angka mentah untuk hitung delta. Wajib berpasangan dengan `previous`. */
  current?: number;
  previous?: number;
  /** Untuk metrik biaya: naik = buruk. */
  invertDelta?: boolean;
  emphasis?: boolean;
  className?: string;
}) {
  const delta =
    current !== undefined && previous !== undefined
      ? percentDelta(current, previous)
      : null;
  const good = delta === null ? null : invertDelta ? delta <= 0 : delta >= 0;

  return (
    <Card className={cn(emphasis && "border-primary/30 bg-accent/40", className)}>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="space-y-2">
          <p className="metric">{value}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {delta !== null && (
              <span
                className={cn(
                  "tnum inline-flex items-center rounded-full px-1.5 py-0.5 font-medium",
                  good
                    ? "bg-success/12 text-success"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {signedPercent(delta)}
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
