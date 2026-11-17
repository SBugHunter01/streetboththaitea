"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CupSoda,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { rupiah } from "@/lib/format";
import {
  actionCreateProduct,
  actionUpdateProduct,
  actionSetProductActive,
  actionDeleteProduct,
} from "@/lib/actions";
import type { ProductWithRelations } from "@/lib/types";
import type { IngredientModel, CategoryModel } from "@/generated/prisma/models";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { calcProductHpp } from "@/lib/finance";
import { cn } from "@/lib/utils";

interface RecipeRow {
  ingredientId: string;
  quantity: number;
}

interface ToppingRow {
  ingredientId: string;
  quantity: number;
  extraPrice: number;
}

interface ProductForm {
  sku: string;
  name: string;
  categoryId: string;
  sellingPrice: string;
  description: string;
  imageUrl: string;
}

export function ProductsClient({
  products,
  categories,
  ingredients,
  page,
  totalItems,
  pageSize,
}: {
  products: ProductWithRelations[];
  categories: CategoryModel[];
  ingredients: IngredientModel[];
  page: number;
  totalItems: number;
  pageSize: number;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductWithRelations | null>(null);
  const [form, setForm] = useState<ProductForm>({
    sku: "",
    name: "",
    categoryId: "",
    sellingPrice: "",
    description: "",
    imageUrl: "",
  });
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [toppings, setToppings] = useState<ToppingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductWithRelations | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  // Bahan nonaktif tidak bisa dipilih untuk resep baru, tapi tetap tampil jika sudah dipakai.
  const ingredientOptions = (selectedId: string) =>
    ingredients.filter((i) => i.isActive || i.id === selectedId);

  /** Guarded dialog state change: resets form & editing when dialog ditutup. */
  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setEditing(null);
      setForm({
        sku: "",
        name: "",
        categoryId: categories[0]?.id ?? "",
        sellingPrice: "",
        description: "",
        imageUrl: "",
      });
      setRecipes([]);
      setToppings([]);
    }
  }

  const hppPreview = useMemo(
    () =>
      calcProductHpp(
        recipes.map((r) => {
          const ing = ingredients.find((i) => i.id === r.ingredientId);
          return { quantity: r.quantity, costPerUnit: ing?.costPerUnit ?? 0 };
        }),
      ),
    [recipes, ingredients],
  );

  const profitPreview = Number(form.sellingPrice || 0) - hppPreview;
  const marginPreview =
    Number(form.sellingPrice || 0) > 0
      ? (profitPreview / Number(form.sellingPrice)) * 100
      : 0;

  function openCreate() {
    setEditing(null);
    setForm({
      sku: "",
      name: "",
      categoryId: categories[0]?.id ?? "",
      sellingPrice: "",
      description: "",
      imageUrl: "",
    });
    setRecipes([]);
    setToppings([]);
    setDialogOpen(true);
  }

  function openEdit(product: ProductWithRelations) {
    setEditing(product);
    setForm({
      sku: product.sku,
      name: product.name,
      categoryId: product.category.id,
      sellingPrice: String(product.sellingPrice),
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
    });
    setRecipes(
      product.recipes.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
      })),
    );
    setToppings(
      product.toppings?.map((t) => ({
        ingredientId: t.ingredientId,
        quantity: t.quantity,
        extraPrice: t.extraPrice,
      })) ?? [],
    );
    setDialogOpen(true);
  }

  async function save() {
    if (busy) return;
    if (!form.sku.trim() || !form.name.trim() || !form.categoryId || form.sellingPrice === "") {
      toast.error("Lengkapi data produk");
      return;
    }
    const validRecipes = recipes.filter((r) => r.ingredientId && r.quantity > 0);
    const validToppings = toppings.filter((t) => t.ingredientId && t.quantity > 0);

    const input = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      categoryId: form.categoryId,
      sellingPrice: Number(form.sellingPrice),
      description: form.description,
      imageUrl: form.imageUrl,
      recipes: validRecipes.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
      })),
      toppings: validToppings.map((t) => ({
        ingredientId: t.ingredientId,
        quantity: t.quantity,
        extraPrice: Number(t.extraPrice || 0),
      })),
    };
    setBusy(true);
    try {
      const res = editing
        ? await actionUpdateProduct(editing.id, input)
        : await actionCreateProduct(input);
      if (res.ok) {
        toast.success(editing ? "Produk diperbarui" : "Produk dibuat");
        handleDialogChange(false);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product: ProductWithRelations) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await actionSetProductActive(product.id, !product.isActive);
      if (res.ok) {
        toast.success(product.isActive ? "Produk dinonaktifkan" : "Produk diaktifkan");
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
      const res = await actionDeleteProduct(deleteTarget.id);
      if (res.ok) {
        toast.success("Produk dihapus");
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
      <PageHeader
        title="Produk"
        description="Kelola produk, resep, dan topping"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            Tambah Produk
          </Button>
        }
      />

      {products.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={CupSoda}
              title="Belum ada produk"
              description="Tambahkan produk pertama beserta resepnya, HPP dihitung otomatis."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const profit = p.sellingPrice - p.hpp;
            const margin = p.sellingPrice > 0 ? (profit / p.sellingPrice) * 100 : 0;
            return (
              <Card key={p.id} className={cn(!p.isActive && "opacity-60")}>
                <div className="flex aspect-16/9 items-center justify-center overflow-hidden bg-secondary/50">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <CupSoda className="size-8 text-muted-foreground/35" aria-hidden />
                  )}
                </div>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{p.name}</p>
                      {!p.isActive && <Badge variant="secondary">Nonaktif</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.sku} · {p.category.name} · {p.recipes.length} bahan
                      {p.toppings && p.toppings.length > 0 && ` · ${p.toppings.length} topping`}
                    </p>
                  </div>

                  <div className="tnum flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{rupiah(p.sellingPrice)}</span>
                    <span className="text-xs text-muted-foreground">HPP {rupiah(p.hpp)}</span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        profit >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {margin.toFixed(0)}% margin
                    </span>
                  </div>

                  <div className="flex gap-1 border-t pt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                      <Pencil />
                      Edit resep &amp; topping
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Aksi lain untuk ${p.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => toggleActive(p)}>
                          {p.isActive ? <ToggleRight /> : <ToggleLeft />}
                          {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(p)}>
                          <Trash2 />
                          Hapus produk
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} />

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Informasi Dasar
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="TTC-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat">Kategori</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) => setForm({ ...form, categoryId: v })}
                  >
                    <SelectTrigger id="cat">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nama Produk</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Thai Tea Original"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Harga Jual Base (Rp)</Label>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    value={form.sellingPrice}
                    onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                    placeholder="15000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="img">URL Gambar</Label>
                  <Input
                    id="img"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Deskripsi</Label>
                <Textarea
                  id="desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Deskripsi produk..."
                  rows={2}
                />
              </div>
            </div>

            {/* Resep Base */}
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Resep Base / Komposisi</p>
                  <p className="text-xs text-muted-foreground">Komposisi dasar sajian original.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRecipes((prev) => [...prev, { ingredientId: "", quantity: 1 }])}
                >
                  <Plus className="size-3.5" />
                  Tambah bahan
                </Button>
              </div>
              <div className="space-y-2">
                {recipes.map((r, idx) => {
                  const ing = ingredients.find((i) => i.id === r.ingredientId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={r.ingredientId}
                        onValueChange={(v) =>
                          setRecipes((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, ingredientId: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Pilih bahan" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientOptions(r.ingredientId).map((ing) => (
                            <SelectItem key={ing.id} value={ing.id}>
                              {ing.name} · {rupiah(ing.costPerUnit)}/{ing.unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0.001}
                        step="any"
                        value={r.quantity}
                        onChange={(e) =>
                          setRecipes((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x,
                            ),
                          )
                        }
                        className="tnum w-24"
                        aria-label="Jumlah bahan"
                      />
                      <span className="tnum w-12 text-xs text-muted-foreground">
                        {ing?.unit ?? "unit"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        onClick={() => setRecipes((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Hapus bahan"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                {recipes.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Belum ada bahan resep base. HPP dihitung otomatis dari resep.
                  </p>
                )}
              </div>
              <div className="tnum mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
                <span>
                  HPP Base: <strong>{rupiah(hppPreview)}</strong>
                </span>
                <span>
                  Laba Base:{" "}
                  <strong className={profitPreview >= 0 ? "text-success" : "text-destructive"}>
                    {rupiah(profitPreview)}
                  </strong>
                </span>
                <span>
                  Margin Base: <strong>{marginPreview.toFixed(1)}%</strong>
                </span>
              </div>
            </div>

            {/* Topping Add-on */}
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pilihan Topping Add-on</p>
                  <p className="text-xs text-muted-foreground">
                    Pilihan tambahan di kasir (misal sajian Premium: CreamCheese, Keju Serut, dll).
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setToppings((prev) => [...prev, { ingredientId: "", quantity: 10, extraPrice: 5000 }])}
                >
                  <Plus className="size-3.5" />
                  Tambah topping
                </Button>
              </div>
              <div className="space-y-2">
                {toppings.map((t, idx) => {
                  const ing = ingredients.find((i) => i.id === t.ingredientId);
                  const toppingHpp = ing ? Math.round(t.quantity * ing.costPerUnit) : 0;
                  return (
                    <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 rounded-lg bg-card/60 border">
                      <Select
                        value={t.ingredientId}
                        onValueChange={(v) =>
                          setToppings((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, ingredientId: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Pilih bahan topping" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientOptions(t.ingredientId).map((ing) => (
                            <SelectItem key={ing.id} value={ing.id}>
                              {ing.name} ({ing.unit}) · {rupiah(ing.costPerUnit)}/{ing.unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Input
                          type="number"
                          min={0.001}
                          step="any"
                          value={t.quantity}
                          onChange={(e) =>
                            setToppings((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, quantity: Number(e.target.value) || 0 } : x,
                              ),
                            )
                          }
                          className="tnum w-20"
                          placeholder="Porsi"
                          aria-label="Porsi topping"
                        />
                        <span className="tnum w-10 text-xs text-muted-foreground">
                          {ing?.unit ?? "unit"}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">+Rp</span>
                          <Input
                            type="number"
                            min={0}
                            value={t.extraPrice}
                            onChange={(e) =>
                              setToppings((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, extraPrice: Number(e.target.value) || 0 } : x,
                                ),
                              )
                            }
                            className="tnum w-24"
                            placeholder="Harga +Rp"
                            aria-label="Harga tambahan"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive shrink-0"
                          onClick={() => setToppings((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Hapus topping"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {ing && (
                        <div className="w-full text-[11px] text-muted-foreground px-1 flex justify-between">
                          <span>Biaya HPP Topping: {rupiah(toppingHpp)}</span>
                          <span>Margin: {rupiah(t.extraPrice - toppingHpp)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {toppings.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Belum ada topping. Kasir akan menyajikan menu original standar.
                  </p>
                )}
              </div>
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
        title="Hapus produk?"
        description={
          deleteTarget && (
            <>
              Produk <strong>{deleteTarget.name}</strong> akan dihapus permanen. Transaksi lama
              tetap tersimpan.
            </>
          )
        }
        busy={busy}
        onConfirm={remove}
      />
    </div>
  );
}
