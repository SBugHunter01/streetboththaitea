"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Undo2,
} from "lucide-react";
import { rupiah, number, dateTime, PAYMENT_LABEL } from "@/lib/format";
import { MAX_ITEM_QTY } from "@/lib/constants";
import { actionVoidSale, actionEditSale } from "@/lib/actions";
import type { SaleWithItems, CatalogProduct } from "@/lib/types";
import type { PaymentMethod, SaleStatus } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface EditRow {
  productId: string;
  quantity: number;
  toppingIds: string[];
}

export function TransactionsClient({
  sales,
  products,
  page,
  totalItems,
  pageSize,
  status,
}: {
  sales: SaleWithItems[];
  products: CatalogProduct[];
  page: number;
  totalItems: number;
  pageSize: number;
  status: SaleStatus;
}) {
  const [detail, setDetail] = useState<SaleWithItems | null>(null);
  const [editing, setEditing] = useState<SaleWithItems | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [busy, setBusy] = useState(false);
  const [voidTarget, setVoidTarget] = useState<SaleWithItems | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  function openEdit(sale: SaleWithItems) {
    setEditing(sale);
    setRows(
      sale.items.map((i) => ({
        productId: i.productId ?? "",
        quantity: i.quantity,
        toppingIds:
          i.toppings
            ?.map((t) => t.ingredientId)
            .filter((id): id is string => Boolean(id)) ?? [],
      })),
    );
    setPayment(sale.paymentMethod);
  }

  const editSubtotal = rows.reduce((sum, r) => {
    const product = products.find((p) => p.id === r.productId);
    if (!product) return sum;
    const extra = (product.toppings ?? [])
      .filter((t) => r.toppingIds.includes(t.ingredientId))
      .reduce((s, t) => s + t.extraPrice, 0);
    return sum + (product.sellingPrice + extra) * r.quantity;
  }, 0);

  async function voidSale() {
    if (!voidTarget) return;
    setBusy(true);
    const res = await actionVoidSale(voidTarget.id);
    setBusy(false);
    if (res.ok) {
      toast.success("Transaksi dibatalkan");
      setVoidTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (rows.length === 0) {
      toast.error("Transaksi harus memiliki minimal 1 item");
      return;
    }
    // Produk yang sudah dihapus/nonaktif tidak ada di katalog: lebih baik minta
    // kasir memilih ulang daripada diam-diam membuang barisnya.
    if (rows.some((r) => !products.some((p) => p.id === r.productId))) {
      toast.error("Pilih produk aktif untuk setiap baris, atau hapus barisnya");
      return;
    }
    // Gabung duplikat berdasarkan productId + topping-set agar tidak ada dua
    // SaleItem untuk produk identik yang sama-sama mengurangi stok.
    const merged = new Map<string, EditRow>();
    let mergedCount = 0;
    for (const r of rows) {
      const key = `${r.productId}|${[...r.toppingIds].sort().join(",")}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + r.quantity, MAX_ITEM_QTY);
        mergedCount++;
      } else {
        merged.set(key, { ...r });
      }
    }
    if (mergedCount > 0) {
      toast.info(`${mergedCount} baris duplikat digabung otomatis`);
    }
    setBusy(true);
    const res = await actionEditSale(editing.id, [...merged.values()], payment);
    setBusy(false);
    if (res.ok) {
      toast.success("Transaksi diperbarui");
      setEditing(null);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaksi"
        description="Riwayat penjualan"
        actions={
          <div role="group" aria-label="Filter status" className="flex gap-1.5">
            {[
              { label: "Selesai", href: "/transactions", value: "COMPLETED" },
              { label: "Dibatalkan", href: "/transactions?status=VOIDED", value: "VOIDED" },
            ].map((tab) => (
              <Link
                key={tab.value}
                href={tab.href}
                aria-current={status === tab.value ? "true" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  status === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        }
      />

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">No. Invoice</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead className="hidden sm:table-cell">Pembayaran</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={ReceiptText}
                      title={
                        status === "VOIDED"
                          ? "Tidak ada transaksi dibatalkan"
                          : "Belum ada transaksi"
                      }
                      description={
                        status === "VOIDED"
                          ? "Transaksi yang kamu batalkan akan tercatat di sini."
                          : "Transaksi dari kasir akan tampil di sini."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-4 font-medium">{s.invoiceNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{dateTime(s.createdAt)}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {PAYMENT_LABEL[s.paymentMethod]}
                  </TableCell>
                  <TableCell className="tnum text-right font-medium">{rupiah(s.total)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setDetail(s)}>
                        <Eye />
                        Detail
                      </Button>
                      {s.status === "COMPLETED" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Aksi lain untuk ${s.invoiceNumber}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openEdit(s)}>
                              <Pencil />
                              Edit transaksi
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setVoidTarget(s)}
                            >
                              <Undo2 />
                              Batalkan transaksi
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detail?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              {detail && dateTime(detail.createdAt)} ·{" "}
              {detail && PAYMENT_LABEL[detail.paymentMethod]}
              {detail?.status === "VOIDED" && " · dibatalkan"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="divide-y">
                {detail.items.map((i) => (
                  <div key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.productNameSnapshot}</p>
                      {i.toppings && i.toppings.length > 0 && (
                        <p className="truncate text-xs text-primary font-medium">
                          + {i.toppings.map((t) => t.ingredientName).join(", ")}
                        </p>
                      )}
                      <p className="tnum text-xs text-muted-foreground">
                        {number(i.quantity)} × {rupiah(i.sellingPrice)}
                      </p>
                    </div>
                    <p className="tnum shrink-0 font-medium">{rupiah(i.subtotal)}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="tnum flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">{rupiah(detail.total)}</span>
                </div>
                <div className="tnum flex justify-between">
                  <span className="text-muted-foreground">HPP</span>
                  <span>− {rupiah(detail.totalHpp)}</span>
                </div>
                <div className="tnum flex justify-between border-t pt-1.5 font-semibold">
                  <span>Laba</span>
                  <span className={detail.grossProfit >= 0 ? "text-success" : "text-destructive"}>
                    {rupiah(detail.grossProfit)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaksi</DialogTitle>
            <DialogDescription>
              {editing?.invoiceNumber} — stok bahan baku &amp; topping disesuaikan otomatis
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const product = products.find((p) => p.id === row.productId);
              return (
                <div key={idx} className="rounded-lg border p-2.5 space-y-2 bg-card">
                  <div className="flex items-center gap-2">
                    <Select
                      value={row.productId}
                      onValueChange={(v) =>
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, productId: v, toppingIds: [] } : r)),
                        )
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Pilih produk" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · {rupiah(p.sellingPrice)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_ITEM_QTY}
                      value={row.quantity}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, quantity: Math.min(MAX_ITEM_QTY, Math.max(1, Math.floor(Number(e.target.value)) || 1)) } : r,
                          ),
                        )
                      }
                      className="tnum w-20 text-center"
                      aria-label="Jumlah"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Hapus item ini"
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {product?.toppings && product.toppings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                      {product.toppings.map((t) => {
                        const checked = row.toppingIds.includes(t.ingredientId);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setRows((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        toppingIds: checked
                                          ? r.toppingIds.filter((id) => id !== t.ingredientId)
                                          : [...r.toppingIds, t.ingredientId],
                                      }
                                    : r,
                                ),
                              )
                            }
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full border transition-colors",
                              checked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground hover:text-foreground",
                            )}
                          >
                            + {t.ingredient.name} (+{rupiah(t.extraPrice)})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, { productId: "", quantity: 1, toppingIds: [] }])}
            >
              <Plus className="size-3.5" />
              Tambah item
            </Button>
            <div className="tnum flex justify-between pt-2 text-sm font-semibold">
              <span>Subtotal</span>
              <span>{rupiah(editSubtotal)}</span>
            </div>
            <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!voidTarget}
        onOpenChange={(open) => !open && setVoidTarget(null)}
        title="Batalkan transaksi?"
        description={
          voidTarget && (
            <>
              Transaksi <strong>{voidTarget.invoiceNumber}</strong> akan dibatalkan dan stok bahan
              baku dikembalikan. Tindakan ini tidak dapat dibatalkan.
            </>
          )
        }
        confirmLabel="Batalkan Transaksi"
        busy={busy}
        onConfirm={voidSale}
      />
    </div>
  );
}
