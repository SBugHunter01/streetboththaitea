import Link from "next/link";
import { ArrowRight, CheckCircle2, Package2, ReceiptText } from "lucide-react";
import { requireUser } from "@/lib/auth-guard";
import { previousRange, PERIOD_LABEL, periodFromParams } from "@/lib/period";
import { sp } from "@/lib/search-params";
import { rupiah, dateTime, number, PAYMENT_LABEL, percentDelta, signedPercent } from "@/lib/format";
import { profitSummary, salesSummary, dailySeries } from "@/lib/services/report";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/chart-card";
import { PeriodFilter } from "@/components/period-filter";
import { PerformanceChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  await requireUser();
  const p = await searchParams;
  const { period, ...range } = periodFromParams({ period: sp(p.period), from: sp(p.from), to: sp(p.to) });
  const prev = previousRange(range);

  const [profit, sales, series, prevProfit, recentSales, lowStock] = await Promise.all([
    profitSummary(range.from, range.to),
    salesSummary(range.from, range.to),
    dailySeries(range.from, range.to),
    profitSummary(prev.from, prev.to),
    prisma.sale.findMany({
      where: { status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
        total: true,
        paymentMethod: true,
      },
    }),
    // shortcut: filter di JS karena field-ref `prisma.ingredient.fields.minimumStock`
    // belum didukung adapter better-sqlite3; ganti ke filter DB bila bahan > ~1000 baris.
    // Diurutkan dari rasio stok/minimum terkecil = paling kritis, bukan angka stok mentah
    // (unit tiap bahan berbeda: 5 sachet vs 5000 ml).
    prisma.ingredient
      .findMany({ where: { isActive: true } })
      .then((rows) =>
        rows
          .filter((i) => i.currentStock < i.minimumStock)
          .sort((a, b) => a.currentStock / a.minimumStock - b.currentStock / b.minimumStock)
          .slice(0, 6),
      ),
  ]);

  const periodLabel = PERIOD_LABEL[period];
  const topSales = sales.topProducts.slice(0, 5);
  const maxTopQty = Math.max(1, ...topSales.map((t) => t.quantity));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        actions={<PeriodFilter />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Ringkasan laba-rugi sebagai baris bertumpuk, bukan empat kotak
            terpisah: pemilik membacanya sebagai satu perhitungan berurutan
            (pendapatan → HPP → laba kotor → beban → laba bersih). */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ringkasan Laba Rugi</CardTitle>
            <CardDescription>{periodLabel} · dibanding periode sebelumnya</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {[
              {
                label: "Pendapatan",
                value: profit.revenue,
                prev: prevProfit.revenue,
                negative: false,
              },
              {
                label: "HPP",
                value: profit.hpp,
                prev: prevProfit.hpp,
                negative: true,
              },
              {
                label: "Laba Kotor",
                value: profit.grossProfit,
                prev: prevProfit.grossProfit,
                negative: false,
                total: true,
                hint: `margin ${profit.grossMargin.toFixed(1)}%`,
              },
              {
                label: "Biaya Operasional",
                value: profit.operatingExpenses,
                prev: prevProfit.operatingExpenses,
                negative: true,
              },
              {
                label: "Laba Bersih",
                value: profit.netProfit,
                prev: prevProfit.netProfit,
                negative: false,
                total: true,
                hint: `margin ${profit.netMargin.toFixed(1)}%`,
              },
            ].map((row) => {
              const delta = percentDelta(row.value, row.prev);
              const good = delta === null ? null : row.negative ? delta <= 0 : delta >= 0;
              return (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "text-sm",
                        row.total
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="ml-2 text-xs text-muted-foreground/80">
                        {row.hint}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2.5">
                    {delta !== null && (
                      <span
                        className={cn(
                          "tnum text-xs",
                          good ? "text-success" : "text-destructive",
                        )}
                      >
                        {signedPercent(delta)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "tnum text-right",
                        row.total
                          ? "text-base font-semibold tracking-tight"
                          : "text-sm font-medium",
                      )}
                    >
                      {row.negative && "− "}
                      {rupiah(row.negative ? Math.abs(row.value) : row.value)}
                    </span>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard title="Transaksi" value={number(sales.totalTransactions)} />
          <StatCard title="Rata-rata / Transaksi" value={rupiah(sales.averageOrderValue)} />
        </div>
      </div>

      <ChartCard
        title="Arus Pendapatan &amp; Biaya"
        subtitle={periodLabel}
      >
        <PerformanceChart data={series} />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Transaksi Terbaru</CardTitle>
            <SectionLink href="/transactions">Semua transaksi</SectionLink>
          </CardHeader>
          <CardContent className="px-0">
            {recentSales.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="Belum ada transaksi"
                description="Transaksi dari kasir akan tampil di sini."
                className="py-10"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">No. Invoice</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead className="hidden sm:table-cell">Pembayaran</TableHead>
                    <TableHead className="pr-4 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 font-medium">{s.invoiceNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateTime(s.createdAt)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {PAYMENT_LABEL[s.paymentMethod]}
                      </TableCell>
                      <TableCell className="tnum pr-4 text-right font-medium">
                        {rupiah(s.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Produk Terlaris</CardTitle>
              <SectionLink href="/reports">Laporan</SectionLink>
            </CardHeader>
            <CardContent className="space-y-3">
              {topSales.length === 0 && (
                <EmptyState icon={Package2} title="Belum ada penjualan" className="py-6" />
              )}
              {topSales.map((product, i) => (
                <div key={product.name} className="space-y-1.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="tnum w-3 shrink-0 text-xs font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <p className="tnum shrink-0 text-sm font-medium">
                      {rupiah(product.revenue)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 pl-5.5">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(3, (product.quantity / maxTopQty) * 100)}%` }}
                      />
                    </div>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {number(product.quantity)} pcs
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Stok Menipis</CardTitle>
              <SectionLink href="/ingredients">Kelola stok</SectionLink>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowStock.length === 0 && (
                <EmptyState
                  icon={CheckCircle2}
                  title="Semua stok aman"
                  description="Tidak ada bahan di bawah batas minimum."
                  className="py-6"
                />
              )}
              {lowStock.map((ing) => {
                const pct = Math.min(100, (ing.currentStock / ing.minimumStock) * 100);
                const critical = pct <= 35;
                return (
                  <div key={ing.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">{ing.name}</p>
                      <p
                        className={cn(
                          "tnum shrink-0 text-sm font-medium",
                          critical ? "text-destructive" : "text-warning-accent",
                        )}
                      >
                        {number(ing.currentStock)} {ing.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            critical ? "bg-destructive" : "bg-warning",
                          )}
                          style={{ width: `${Math.max(3, pct)}%` }}
                        />
                      </div>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">
                        min {number(ing.minimumStock)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
