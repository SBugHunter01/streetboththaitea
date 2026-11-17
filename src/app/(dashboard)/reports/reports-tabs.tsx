"use client";

import { Package2, Wallet, Utensils } from "lucide-react";
import { rupiah, number, FUND_ACCOUNT_LABEL } from "@/lib/format";
import type {
  SalesSummary,
  ExpenseSummary,
  ProfitSummary,
  IngredientUsageItem,
} from "@/lib/services/report";
import type { AllocationSummary } from "@/lib/services/allocation";
import { AllocationDialog } from "./allocation-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PROFIT_ROWS = [
  { key: "revenue", label: "Pendapatan", negative: false, total: false },
  { key: "hpp", label: "HPP", negative: true, total: false },
  { key: "grossProfit", label: "Laba Kotor", negative: false, total: true },
  { key: "operatingExpenses", label: "Biaya Operasional", negative: true, total: false },
  { key: "netProfit", label: "Laba Bersih", negative: false, total: true },
] as const satisfies readonly {
  key: keyof ProfitSummary;
  label: string;
  negative: boolean;
  total: boolean;
}[];

/** Daftar peringkat berpalang. Dipakai tab Pengeluaran dan Pemakaian Bahan. */
function BarList({
  items,
  max,
  color,
}: {
  items: { name: string; value: number; display: string }[];
  max: number;
  color: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.name} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{item.name}</span>
            <span className="tnum shrink-0">{item.display}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", color)}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsTabs({
  sales,
  expenses,
  profit,
  usage,
  allocation,
  canEditAllocation,
}: {
  sales: SalesSummary;
  expenses: ExpenseSummary;
  profit: ProfitSummary;
  usage: IngredientUsageItem[];
  allocation: AllocationSummary;
  canEditAllocation: boolean;
}) {
  const maxExpense = Math.max(1, ...expenses.byCategory.map((c) => c.amount));
  const maxUsage = Math.max(1, ...usage.map((u) => u.quantity));

  return (
    <Tabs defaultValue="profit">
      {/* h-auto: di layar sempit tab terbagi dua baris; tinggi tetap h-8 membuat baris kedua menimpa konten. */}
      <TabsList className="flex-wrap group-data-horizontal/tabs:h-auto">
        <TabsTrigger value="profit">Laba Rugi</TabsTrigger>
        <TabsTrigger value="sales">Penjualan</TabsTrigger>
        <TabsTrigger value="expense">Pengeluaran</TabsTrigger>
        <TabsTrigger value="usage">Pemakaian Bahan</TabsTrigger>
        <TabsTrigger value="accounts">Rekening</TabsTrigger>
      </TabsList>

      <TabsContent value="profit" className="mt-4">
        {/* Laba rugi dibaca sebagai perhitungan berurutan, jadi disusun
            sebagai satu daftar tanpa kotak bersarang. Baris pengurang diberi
            tanda minus eksplisit agar hasil akhirnya bisa ditelusuri. */}
        <Card>
          <CardHeader>
            <CardTitle>Laba Rugi</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="mx-auto max-w-md text-sm">
              {PROFIT_ROWS.map((row) => {
                const value = profit[row.key];
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "tnum flex items-baseline justify-between gap-4 py-2",
                      row.total && "border-t font-semibold",
                      row.key === "netProfit" && "text-base",
                    )}
                  >
                    <dt className={cn(!row.total && "text-muted-foreground")}>{row.label}</dt>
                    <dd
                      className={cn(
                        row.total && (value >= 0 ? "text-success" : "text-destructive"),
                      )}
                    >
                      {row.negative && "− "}
                      {rupiah(row.negative ? Math.abs(value) : value)}
                    </dd>
                  </div>
                );
              })}
              <div className="flex justify-between gap-4 border-t pt-2.5 text-xs text-muted-foreground">
                <span>Margin kotor {profit.grossMargin.toFixed(1)}%</span>
                <span>Margin bersih {profit.netMargin.toFixed(1)}%</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Pembelian persediaan bukan beban tambahan; bahan terjual sudah dihitung melalui HPP.
              </p>
            </dl>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sales" className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Transaksi" value={number(sales.totalTransactions)} />
          <StatCard title="Item Terjual" value={number(sales.itemsSold)} />
          <StatCard title="Omzet" value={rupiah(sales.revenue)} />
          <StatCard title="Rata-rata / Transaksi" value={rupiah(sales.averageOrderValue)} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Produk Terlaris</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {sales.topProducts.length === 0 ? (
              <EmptyState
                icon={Package2}
                title="Belum ada penjualan"
                description="Tidak ada penjualan pada periode ini."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Produk</TableHead>
                    <TableHead className="text-right">Terjual</TableHead>
                    <TableHead className="pr-4 text-right">Omzet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.topProducts.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="pl-4 font-medium">{p.name}</TableCell>
                      <TableCell className="tnum text-right">{number(p.quantity)}</TableCell>
                      <TableCell className="tnum pr-4 text-right">{rupiah(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="expense" className="mt-4">
        <Card>
          <CardHeader className="flex-row items-baseline justify-between gap-3 space-y-0">
            <CardTitle>Pengeluaran per Kategori</CardTitle>
            <span className="tnum shrink-0 text-sm font-medium">
              {rupiah(expenses.total)}
            </span>
          </CardHeader>
          <CardContent>
            {expenses.byCategory.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Tidak ada pengeluaran"
                description="Tidak ada pengeluaran pada periode ini."
              />
            ) : (
              <BarList
                items={expenses.byCategory.map((c) => ({
                  name: c.name,
                  value: c.amount,
                  display: rupiah(c.amount),
                }))}
                max={maxExpense}
                color="bg-chart-3"
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="usage" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Pemakaian Bahan Baku</CardTitle>
            <p className="text-xs text-muted-foreground">
              Dari transaksi selesai dan produksi batch pada periode ini.
            </p>
          </CardHeader>
          <CardContent>
            {usage.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title="Tidak ada pemakaian"
                description="Tidak ada pemakaian bahan pada periode ini."
              />
            ) : (
              <BarList
                items={usage.map((u) => ({
                  name: u.name,
                  value: u.quantity,
                  display: `${number(u.quantity)} ${u.unit}`,
                }))}
                max={maxUsage}
                color="bg-chart-2"
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="accounts" className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {allocation.grossProfit < 0 ? (
              <>
                Rugi kotor {rupiah(Math.abs(allocation.grossProfit))}. Seluruh omzet{" "}
                {rupiah(allocation.revenue)} masuk Operasional; HPP {rupiah(allocation.hpp)} belum tertutup{" "}
                {rupiah(-allocation.grossProfit)}. Tidak ada laba untuk dibagi.
              </>
            ) : (
              <>
                HPP {rupiah(allocation.hpp)} masuk Operasional. Laba kotor{" "}
                {rupiah(allocation.grossProfit)} dibagi{" "}
                {allocation.pct.operationalPct}% / {allocation.pct.payrollPct}% /{" "}
                {allocation.pct.emergencyPct}%.
              </>
            )}
          </p>
          {canEditAllocation && <AllocationDialog pct={allocation.pct} />}
        </div>
        <p className="text-xs text-muted-foreground">
          Laporan alokasi periode ini, bukan saldo bank. Persentase terbaru berlaku untuk semua periode.
          Pembelian persediaan tetap mengurangi dana rekening, tetapi tidak dihitung lagi sebagai beban laba rugi.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {allocation.accounts.map((a) => (
            <Card key={a.account}>
              <CardHeader>
                <CardTitle>{FUND_ACCOUNT_LABEL[a.account]}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="text-sm">
                  <div className="tnum flex justify-between gap-4 py-1.5">
                    <dt className="text-muted-foreground">Jatah</dt>
                    <dd>{rupiah(a.allocated)}</dd>
                  </div>
                  <div className="tnum flex justify-between gap-4 py-1.5">
                    <dt className="text-muted-foreground">Terpakai</dt>
                    <dd>− {rupiah(a.spent)}</dd>
                  </div>
                  <div className="tnum flex justify-between gap-4 border-t pt-2 font-semibold">
                    <dt>Sisa</dt>
                    <dd className={a.balance >= 0 ? "text-success" : "text-destructive"}>
                      {a.balance < 0 && "− "}
                      {rupiah(Math.abs(a.balance))}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}