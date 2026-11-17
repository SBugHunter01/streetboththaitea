"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { rupiah, number, date, PAYMENT_LABEL, FUND_ACCOUNT_LABEL } from "@/lib/format";
import { localDateKey } from "@/lib/period";
import { actionCreateExpense, actionUpdateExpense, actionDeleteExpense } from "@/lib/actions";
import type { ExpenseWithCategory } from "@/lib/types";
import type { CategoryModel } from "@/generated/prisma/models";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExpenseForm {
  categoryId: string;
  amount: string;
  expenseDate: string;
  description: string;
  paymentMethod: PaymentMethod;
  notes: string;
}

const emptyForm = (categoryId = ""): ExpenseForm => ({
  categoryId,
  amount: "",
  expenseDate: localDateKey(),
  description: "",
  paymentMethod: "OTHER",
  notes: "",
});

export function ExpensesClient({
  expenses,
  categories,
  page,
  totalItems,
  pageSize,
  categoryId,
  month,
  totalAmount,
}: {
  expenses: ExpenseWithCategory[];
  categories: CategoryModel[];
  page: number;
  totalItems: number;
  pageSize: number;
  categoryId: string;
  month: string;
  totalAmount: number;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseWithCategory | null>(null);
  const [form, setForm] = useState<ExpenseForm>(() => emptyForm());
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseWithCategory | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const filtered = categoryId !== "all" || !!month;

  function applyFilter(key: "category" | "month", value: string) {
    const nextCategory = key === "category" ? value : categoryId;
    const nextMonth = key === "month" ? value : month;
    const search = new URLSearchParams();
    if (nextCategory !== "all") search.set("category", nextCategory);
    if (nextMonth) search.set("month", nextMonth);
    router.replace(`/expenses?${search.toString()}`);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(categories[0]?.id));
    setDialogOpen(true);
  }

  /** Guarded close: reset form saat dialog tertutup. */
  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setEditing(null);
      setForm(emptyForm(categories[0]?.id));
    }
  }

  function openEdit(expense: ExpenseWithCategory) {
    setEditing(expense);
    setForm({
      categoryId: expense.category.id,
      amount: String(expense.amount),
      expenseDate: localDateKey(new Date(expense.expenseDate)),
      description: expense.description ?? "",
      paymentMethod: expense.paymentMethod,
      notes: expense.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (busy) return;
    if (!form.categoryId || !form.amount || !form.expenseDate || Number(form.amount) <= 0) {
      toast.error("Lengkapi data pengeluaran");
      return;
    }
    setBusy(true);
    try {
      const input = {
        categoryId: form.categoryId,
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        description: form.description,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
      };
      const res = editing
        ? await actionUpdateExpense(editing.id, input)
        : await actionCreateExpense(input);
      if (res.ok) {
        toast.success(editing ? "Pengeluaran diperbarui" : "Pengeluaran dicatat");
        handleDialogChange(false);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      const res = await actionDeleteExpense(deleteTarget.id);
      if (res.ok) {
        toast.success("Pengeluaran dihapus");
        setDeleteTarget(null);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Total pindah ke deskripsi header: angka itu menjawab "berapa
          pengeluaran periode ini", jadi tempatnya di judul, bukan di kartu
          mengapung yang bersaing dengan kontrol filter. */}
      <PageHeader
        title="Pengeluaran"
        description={`${rupiah(totalAmount)} · ${number(totalItems)} catatan${
          filtered ? " (terfilter)" : ""
        }`}
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Tambah Pengeluaran
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={categoryId} onValueChange={(v) => applyFilter("category", v)}>
          <SelectTrigger className="w-45" aria-label="Filter kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="month"
          value={month}
          onChange={(e) => applyFilter("month", e.target.value)}
          className="w-40"
          aria-label="Filter bulan"
        />
        {filtered && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/expenses">Reset filter</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="px-0">
          {expenses.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={filtered ? "Tidak ada pengeluaran cocok" : "Belum ada pengeluaran"}
              description={
                filtered
                  ? "Coba ganti kategori atau bulan yang dipilih."
                  : "Catat pengeluaran untuk menghitung laba bersih secara akurat."
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="hidden md:table-cell">Deskripsi</TableHead>
                    <TableHead className="hidden sm:table-cell">Pembayaran</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-4 text-muted-foreground">
                        {date(e.expenseDate)}
                      </TableCell>
                      <TableCell className="font-medium">{e.category.name}</TableCell>
                      <TableCell className="hidden max-w-55 truncate text-muted-foreground md:table-cell">
                        {e.description || "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {PAYMENT_LABEL[e.paymentMethod]}
                      </TableCell>
                      <TableCell className="tnum text-right font-medium">
                        {rupiah(e.amount)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(e)}
                            aria-label={`Edit pengeluaran ${date(e.expenseDate)}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(e)}
                            aria-label={`Hapus pengeluaran ${date(e.expenseDate)}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4">
                <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Pengeluaran" : "Tambah Pengeluaran"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="exp-cat">Kategori</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm({ ...form, categoryId: v })}
              >
                <SelectTrigger id="exp-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {FUND_ACCOUNT_LABEL[c.account]}{c.isInventoryPurchase && " · Persediaan"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Jumlah (Rp)</Label>
                <Input
                  id="exp-amount"
                  type="number"
                  min={1}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="50000"
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Tanggal</Label>
                <Input
                  id="exp-date"
                  type="date"
                  max={localDateKey()}
                  value={form.expenseDate}
                  onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-pay">Metode Pembayaran</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) => setForm({ ...form, paymentMethod: v as PaymentMethod })}
              >
                <SelectTrigger id="exp-pay">
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
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Deskripsi</Label>
              <Input
                id="exp-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Beli cup, sedotan..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-notes">Catatan</Label>
              <Textarea
                id="exp-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Opsional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogChange(false)}>
              Batal
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus pengeluaran?"
        description={
          deleteTarget && (
            <>
              Pengeluaran <strong>{rupiah(deleteTarget.amount)}</strong> akan dihapus dan tidak
              lagi dihitung dalam laporan.
            </>
          )
        }
        busy={busy}
        onConfirm={remove}
      />
    </div>
  );
}