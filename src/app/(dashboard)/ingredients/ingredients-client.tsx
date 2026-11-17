"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  History,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ArrowDownToLine,
  SlidersHorizontal,
  MoreHorizontal,
  Flame,
} from "lucide-react";
import { rupiah, number, dateTime, MOVEMENT_LABEL, INGREDIENT_KIND_LABEL } from "@/lib/format";
import { INGREDIENT_KINDS, isIngredientKind, type IngredientKind } from "@/lib/constants";
import {
  actionCreateIngredient,
  actionUpdateIngredient,
  actionSetIngredientActive,
  actionDeleteIngredient,
  actionStockIn,
  actionAdjustStock,
  actionProduceBatch,
} from "@/lib/actions";
import { calcUnitCost } from "@/lib/finance";
import type { MovementListItem, BatchTemplateWithComponents } from "@/lib/types";
import type { IngredientModel } from "@/generated/prisma/models";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface IngredientForm {
  name: string;
  unit: string;
  costPerUnit: string;
  minimumStock: string;
  currentStock: string;
  packPrice: string;
  packSize: string;
  kind: IngredientKind;
}

const emptyForm = (): IngredientForm => ({
  name: "",
  unit: "gram",
  costPerUnit: "",
  minimumStock: "",
  currentStock: "",
  packPrice: "",
  packSize: "",
  kind: "bahan_baku",
});

export function IngredientsClient({
  ingredients,
  templates = [],
  page,
  totalItems,
  pageSize,
}: {
  ingredients: IngredientModel[];
  templates?: BatchTemplateWithComponents[];
  page: number;
  totalItems: number;
  pageSize: number;
}) {
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<IngredientModel | null>(null);
  const [form, setForm] = useState<IngredientForm>(emptyForm);
  const [stockAction, setStockAction] = useState<"in" | "adjust" | null>(null);
  const [stockTarget, setStockTarget] = useState<IngredientModel | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockCost, setStockCost] = useState("");
  const [stockNotes, setStockNotes] = useState("");
  const [history, setHistory] = useState<IngredientModel | null>(null);
  const [movements, setMovements] = useState<MovementListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IngredientModel | null>(null);

  // Batch production dialog state
  const [produceOpen, setProduceOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [batchCount, setBatchCount] = useState<string>("1");
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [componentInputs, setComponentInputs] = useState<Record<string, string>>({});

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const autoUnitCost = useMemo(() => {
    if (form.packPrice === "" || form.packSize === "") return null;
    const p = Number(form.packPrice);
    const s = Number(form.packSize);
    if (!isNaN(p) && !isNaN(s) && p >= 0 && s > 0) {
      try {
        return calcUnitCost(p, s);
      } catch {
        return null;
      }
    }
    return null;
  }, [form.packPrice, form.packSize]);

  function openCreate() {
    setDialog("create");
    setEditing(null);
    setForm(emptyForm());
  }

  function openEdit(ing: IngredientModel) {
    setDialog("edit");
    setEditing(ing);
    setForm({
      name: ing.name,
      unit: ing.unit,
      costPerUnit: String(ing.costPerUnit),
      minimumStock: String(ing.minimumStock),
      currentStock: "",
      packPrice: ing.packPrice != null ? String(ing.packPrice) : "",
      packSize: ing.packSize != null ? String(ing.packSize) : "",
      kind: isIngredientKind(ing.kind) ? ing.kind : "bahan_baku",
    });
  }

  async function save() {
    if (busy) return;
    if (!form.name.trim() || !form.unit.trim()) {
      toast.error("Lengkapi nama dan satuan bahan");
      return;
    }
    const packPriceNum = form.packPrice !== "" ? Number(form.packPrice) : null;
    const packSizeNum = form.packSize !== "" ? Number(form.packSize) : null;

    if ((packPriceNum != null && packSizeNum == null) || (packPriceNum == null && packSizeNum != null)) {
      toast.error("Harga pack dan isi pack harus diisi bersamaan");
      return;
    }

    if (autoUnitCost === null && (form.costPerUnit === "" || isNaN(Number(form.costPerUnit)) || Number(form.costPerUnit) < 0)) {
      toast.error("Lengkapi harga satuan bahan");
      return;
    }

    const effectiveCost = autoUnitCost ?? Number(form.costPerUnit);

    const input = {
      name: form.name.trim(),
      unit: form.unit.trim(),
      costPerUnit: effectiveCost,
      minimumStock: Number(form.minimumStock || 0),
      packPrice: packPriceNum,
      packSize: packSizeNum,
      kind: form.kind,
      ...(dialog === "create" && form.currentStock !== ""
        ? { currentStock: Number(form.currentStock) }
        : {}),
    };
    setBusy(true);
    try {
      const res =
        dialog === "edit" && editing
          ? await actionUpdateIngredient(editing.id, input)
          : await actionCreateIngredient(input);
      if (res.ok) {
        toast.success(dialog === "edit" ? "Bahan diperbarui" : "Bahan ditambahkan");
        setDialog(null);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function openStockIn(ing: IngredientModel) {
    setStockAction("in");
    setStockTarget(ing);
    setStockQty("");
    setStockCost("");
    setStockNotes("");
  }

  function openAdjust(ing: IngredientModel) {
    setStockAction("adjust");
    setStockTarget(ing);
    setStockQty(String(ing.currentStock));
    setStockNotes("");
  }

  async function submitStock() {
    if (busy || !stockTarget) return;
    const qty = Number(stockQty);
    // Stok masuk harus > 0; penyesuaian boleh 0 (stok habis / dibuang).
    if (stockQty.trim() === "" || !Number.isFinite(qty) || qty < 0 || (stockAction === "in" && qty === 0)) {
      toast.error("Masukkan jumlah yang valid");
      return;
    }
    setBusy(true);
    try {
      const res =
        stockAction === "in"
          ? await actionStockIn(
              stockTarget.id,
              Number(stockQty),
              stockCost !== "" ? Number(stockCost) : undefined,
              stockNotes,
            )
          : await actionAdjustStock(stockTarget.id, Number(stockQty), stockNotes);
      if (res.ok) {
        toast.success(stockAction === "in" ? "Stok masuk dicatat" : "Stok disesuaikan");
        setStockAction(null);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(ing: IngredientModel) {
    setHistory(ing);
    setMovements([]);
    const res = await fetch(`/api/movements?ingredientId=${encodeURIComponent(ing.id)}`);
    if (res.ok) setMovements(await res.json());
    else toast.error("Gagal memuat riwayat stok");
  }

  async function toggleActive(ing: IngredientModel) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await actionSetIngredientActive(ing.id, !ing.isActive);
      if (res.ok) toast.success(ing.isActive ? "Bahan dinonaktifkan" : "Bahan diaktifkan");
      else toast.error(res.error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      const res = await actionDeleteIngredient(deleteTarget.id);
      if (res.ok) {
        toast.success("Bahan dihapus");
        setDeleteTarget(null);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) ?? templates[0];
  const batchesNum = Math.max(1, Number(batchCount) || 1);

  /** Estimasi output jika manual override: ratio min dari override. */
  const estimatedOutput = useMemo(() => {
    if (!activeTemplate || !manualMode) return null;
    let ratio = 1;
    let hasOverride = false;
    for (const c of activeTemplate.components) {
      const inp = componentInputs[c.ingredientId];
      if (inp !== undefined && inp !== "" && !isNaN(Number(inp))) {
        const val = Number(inp);
        if (val > 0 && val !== c.quantity) {
          const r = val / c.quantity;
          if (r < ratio) ratio = r;
          hasOverride = true;
        }
      }
    }
    if (!hasOverride) return null;
    return Math.round(activeTemplate.outputQuantity * ratio * 100) / 100;
  }, [activeTemplate, manualMode, componentInputs]);

  /** Build override payload (hanya untuk komponen yang diubah). */
  function buildOverrides(): { ingredientId: string; quantity: number }[] {
    if (!activeTemplate || !manualMode) return [];
    const out: { ingredientId: string; quantity: number }[] = [];
    for (const c of activeTemplate.components) {
      const inp = componentInputs[c.ingredientId];
      if (inp !== undefined && inp !== "") {
        const val = Number(inp);
        if (!isNaN(val) && val > 0 && val !== c.quantity) {
          out.push({ ingredientId: c.ingredientId, quantity: val });
        }
      }
    }
    return out;
  }

  function handleTemplateChange(tplId: string) {
    setSelectedTemplateId(tplId);
    setComponentInputs({});
    setManualMode(false);
  }

  function resetProduceDialog() {
    setProduceOpen(false);
    setManualMode(false);
    setComponentInputs({});
    setBatchCount("1");
  }

  async function submitProduce() {
    if (!activeTemplate || busy) return;
    const overrides = buildOverrides();
    if (overrides.length === 0 && manualMode) {
      toast.error("Masukkan jumlah minimal 1 komponen override");
      return;
    }
    setBusy(true);
    try {
      const res = await actionProduceBatch(activeTemplate.id, batchesNum, overrides);
      if (res.ok) {
        toast.success(`Produksi ${activeTemplate.name} berhasil`);
        resetProduceDialog();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const lowStock = (ing: IngredientModel) => ing.currentStock < ing.minimumStock;

  const menuActions = (ing: IngredientModel) => [
    { label: "Penyesuaian stok", icon: SlidersHorizontal, fn: () => openAdjust(ing), danger: false },
    { label: "Riwayat stok", icon: History, fn: () => openHistory(ing), danger: false },
    { label: "Edit bahan", icon: Pencil, fn: () => openEdit(ing), danger: false },
    {
      label: ing.isActive ? "Nonaktifkan" : "Aktifkan",
      icon: ing.isActive ? ToggleRight : ToggleLeft,
      fn: () => toggleActive(ing),
      danger: false,
    },
    { label: "Hapus bahan", icon: Trash2, fn: () => setDeleteTarget(ing), danger: true },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bahan Baku"
        description="Inventori, unit costing &amp; produksi olahan"
        actions={
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <Button variant="outline" onClick={() => setProduceOpen(true)}>
                <Flame className="size-4" />
                Produksi Batch
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Tambah Bahan
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="px-0">
          {ingredients.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Belum ada bahan baku"
              description="Tambahkan bahan baku pertama untuk menghitung HPP produk."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Nama</TableHead>
                    <TableHead className="hidden sm:table-cell">Kategori</TableHead>
                    <TableHead className="hidden md:table-cell">Harga satuan / Pack</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="pr-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ing) => (
                    <TableRow key={ing.id} className={cn(!ing.isActive && "opacity-55")}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{ing.name}</p>
                          {!ing.isActive && (
                            <Badge variant="secondary">Nonaktif</Badge>
                          )}
                        </div>
                        <p className="tnum text-xs text-muted-foreground">
                          Minimum {number(ing.minimumStock)} {ing.unit}
                        </p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs font-normal">
                          {isIngredientKind(ing.kind) ? INGREDIENT_KIND_LABEL[ing.kind] : (ing.kind ?? INGREDIENT_KIND_LABEL.bahan_baku)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tnum hidden text-muted-foreground md:table-cell">
                        <div>
                          <span className="font-medium text-foreground">{rupiah(ing.costPerUnit)}</span> / {ing.unit}
                        </div>
                        {ing.packPrice != null && ing.packSize != null && (
                          <span className="text-xs text-muted-foreground">
                            Pack: {rupiah(ing.packPrice)} / {number(ing.packSize)} {ing.unit}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "tnum font-medium",
                            lowStock(ing) && "text-destructive",
                          )}
                        >
                          {number(ing.currentStock)} {ing.unit}
                        </span>
                        {lowStock(ing) && (
                          <span className="block text-xs text-destructive">
                            di bawah minimum
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => openStockIn(ing)}>
                            <ArrowDownToLine />
                            Stok masuk
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Aksi lain untuk ${ing.name}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {menuActions(ing).map((a) => (
                                <DropdownMenuItem
                                  key={a.label}
                                  onClick={a.fn}
                                  variant={a.danger ? "destructive" : "default"}
                                >
                                  <a.icon />
                                  {a.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Dialog Create / Edit Ingredient */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog === "edit" ? "Edit Bahan" : "Tambah Bahan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ing-name">Nama Bahan</Label>
              <Input
                id="ing-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Thai Tea"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ing-kind">Kategori</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as IngredientKind })}
                >
                  <SelectTrigger id="ing-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INGREDIENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {INGREDIENT_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ing-unit">Satuan</Label>
                <Input
                  id="ing-unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="gram, ml, pcs"
                />
              </div>
            </div>

            {/* Pack auto-costing inputs */}
            <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Unit Costing dari Kemasan (Opsional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ing-pack-price">Harga Pack (Rp)</Label>
                  <Input
                    id="ing-pack-price"
                    type="number"
                    min={0}
                    value={form.packPrice}
                    onChange={(e) => setForm({ ...form, packPrice: e.target.value })}
                    placeholder="66000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ing-pack-size">Isi Pack ({form.unit || "unit"})</Label>
                  <Input
                    id="ing-pack-size"
                    type="number"
                    min={0.001}
                    step="any"
                    value={form.packSize}
                    onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                    placeholder="500"
                  />
                </div>
              </div>
              {autoUnitCost !== null ? (
                <p className="text-xs text-success font-medium">
                  Biaya otomatis: {rupiah(autoUnitCost)} / {form.unit || "unit"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Isi harga &amp; kapasitas pack untuk otomatis menghitung harga satuan.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ing-cost">Harga Satuan Manual (Rp)</Label>
              <Input
                id="ing-cost"
                type="number"
                min={0}
                disabled={autoUnitCost !== null}
                value={autoUnitCost !== null ? String(autoUnitCost) : form.costPerUnit}
                onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
                placeholder="100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ing-min">Minimum stok</Label>
                <Input
                  id="ing-min"
                  type="number"
                  min={0}
                  value={form.minimumStock}
                  onChange={(e) => setForm({ ...form, minimumStock: e.target.value })}
                  placeholder="500"
                />
              </div>
              {dialog === "create" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ing-stock">Stok awal</Label>
                  <Input
                    id="ing-stock"
                    type="number"
                    min={0}
                    value={form.currentStock}
                    onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Produce Batch */}
      {templates.length > 0 && (
        <Dialog open={produceOpen} onOpenChange={(open) => (open ? setProduceOpen(true) : resetProduceDialog())}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Produksi Bahan Olahan (Batch)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-select">Pilih Template Olahan</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={handleTemplateChange}
                >
                  <SelectTrigger id="tpl-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} (Hasil: {number(t.outputQuantity)} {t.outputIngredient.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="batch-count">Jumlah Batch</Label>
                <Input
                  id="batch-count"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={batchCount}
                  onChange={(e) => setBatchCount(e.target.value)}
                  className="tnum"
                />
              </div>

              {/* Toggle Mode Manual */}
              <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 cursor-pointer">
                <div>
                  <p className="text-sm font-medium">Mode Manual per Gram</p>
                  <p className="text-xs text-muted-foreground">
                    Isi jumlah bahan sendiri (override template). Hasil dihitung otomatis.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={manualMode}
                  onChange={(e) => {
                    setManualMode(e.target.checked);
                    if (!e.target.checked) setComponentInputs({});
                  }}
                  className="size-4 accent-primary"
                  aria-label="Aktifkan mode manual per gram"
                />
              </label>

              {activeTemplate && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">
                    Kebutuhan Bahan (Untuk {batchesNum} Batch):
                  </p>
                  <div className="divide-y text-xs">
                    {activeTemplate.components.map((c) => {
                      const overrideVal = componentInputs[c.ingredientId];
                      const effectiveQty =
                        manualMode && overrideVal !== "" && overrideVal !== undefined && !isNaN(Number(overrideVal))
                          ? Number(overrideVal)
                          : c.quantity;
                      const needed = effectiveQty * batchesNum;
                      const hasEnough = c.ingredient.currentStock >= needed;
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <span className="font-medium">{c.ingredient.name}</span>
                            <span className="text-muted-foreground"> ({c.ingredient.unit})</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {manualMode ? (
                              <Input
                                type="number"
                                min={0.001}
                                step="any"
                                value={overrideVal ?? String(c.quantity)}
                                onChange={(e) =>
                                  setComponentInputs((prev) => ({
                                    ...prev,
                                    [c.ingredientId]: e.target.value,
                                  }))
                                }
                                className="tnum h-8 w-24 text-right"
                                aria-label={`Jumlah ${c.ingredient.name}`}
                              />
                            ) : (
                              <span className="tnum font-semibold w-24 text-right">
                                {number(c.quantity)}
                              </span>
                            )}
                            <div className="w-24 text-right">
                              <span className={cn("tnum font-semibold", !hasEnough && "text-destructive")}>
                                Butuh {number(needed)}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                Ada: {number(c.ingredient.currentStock)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t pt-2 mt-2 space-y-1 text-xs">
                    {manualMode && estimatedOutput !== null && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Hasil (template asli):</span>
                        <span className="tnum">
                          {number(activeTemplate.outputQuantity * batchesNum)} {activeTemplate.outputIngredient.unit}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-success">
                      <span>Hasil Olahan {estimatedOutput !== null ? "(diperkirakan)" : ""}:</span>
                      <span className="tnum">
                        +{number((estimatedOutput ?? activeTemplate.outputQuantity) * batchesNum)} {activeTemplate.outputIngredient.unit} ({activeTemplate.outputIngredient.name})
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={resetProduceDialog}>
                Batal
              </Button>
              <Button onClick={submitProduce} disabled={busy || !activeTemplate}>
                {busy ? "Memproses..." : "Produksi Sekarang"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog Stok Masuk / Adjust */}
      <Dialog open={stockAction !== null} onOpenChange={(open) => !open && setStockAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stockAction === "in" ? "Stok Masuk" : "Penyesuaian Stok"} — {stockTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
              <Boxes className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Stok saat ini:</span>
              <strong className="tnum">
                {number(stockTarget?.currentStock ?? 0)} {stockTarget?.unit}
              </strong>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock-qty">
                {stockAction === "in" ? `Jumlah masuk (${stockTarget?.unit ?? ""})` : `Stok baru (${stockTarget?.unit ?? ""})`}
              </Label>
              <Input
                id="stock-qty"
                type="number"
                min={0}
                step="any"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="tnum"
              />
            </div>
            {stockAction === "in" && (
              <div className="space-y-1.5">
                <Label htmlFor="stock-cost">
                  Harga per satuan (Rp) — kosongkan jika tetap
                </Label>
                <Input
                  id="stock-cost"
                  type="number"
                  min={0}
                  value={stockCost}
                  onChange={(e) => setStockCost(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="stock-notes">Catatan</Label>
              <Input
                id="stock-notes"
                value={stockNotes}
                onChange={(e) => setStockNotes(e.target.value)}
                placeholder="Opsional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockAction(null)}>
              Batal
            </Button>
            <Button onClick={submitStock} disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Riwayat Stok */}
      <Dialog open={!!history} onOpenChange={(open) => !open && setHistory(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Riwayat Stok — {history?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {movements.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada pergerakan stok
              </p>
            )}
            {movements.map((m) => {
              const isOut =
                m.type === "stock_out" || (m.type === "adjustment" && m.quantity < 0);
              return (
                <div key={m.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full",
                        isOut
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/12 text-success",
                      )}
                    >
                      <ArrowDownToLine
                        className={cn("size-3.5", isOut && "rotate-180")}
                        aria-hidden
                      />
                    </span>
                    <div>
                      <p className="font-medium">{MOVEMENT_LABEL[m.type] ?? m.type}</p>
                      <p className="tnum text-xs text-muted-foreground">
                        {dateTime(m.createdAt)}
                        {m.notes ? ` · ${m.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "tnum font-medium",
                      isOut ? "text-destructive" : "text-success",
                    )}
                  >
                    {m.type === "adjustment"
                      ? `${m.quantity >= 0 ? "+" : ""}${number(m.quantity)}`
                      : m.type === "stock_in"
                        ? `+${number(m.quantity)}`
                        : `-${number(m.quantity)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus bahan?"
        description={
          deleteTarget && (
            <>
              Bahan <strong>{deleteTarget.name}</strong> akan dihapus permanen dari inventori.
            </>
          )
        }
        busy={busy}
        onConfirm={remove}
      />
    </div>
  );
}
