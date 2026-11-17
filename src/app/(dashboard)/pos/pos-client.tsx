"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  CupSoda,
  Ellipsis,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  Landmark,
  Sparkles,
} from "lucide-react";
import { rupiah, number, PAYMENT_LABEL } from "@/lib/format";
import { actionCreateSale } from "@/lib/actions";
import { MAX_ITEM_QTY } from "@/lib/constants";
import type { PosProduct } from "@/lib/types";
import type { CategoryModel } from "@/generated/prisma/models";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CartItem {
  id: string; // key: productId::sortedToppingIds
  productId: string;
  quantity: number;
  toppingIds: string[];
}

const PAYMENT_OPTIONS = [
  { key: "CASH", label: PAYMENT_LABEL.CASH, icon: Banknote },
  { key: "QRIS", label: PAYMENT_LABEL.QRIS, icon: QrCode },
  { key: "TRANSFER", label: PAYMENT_LABEL.TRANSFER, icon: Landmark },
  { key: "OTHER", label: PAYMENT_LABEL.OTHER, icon: Ellipsis },
] as const;

type Payment = (typeof PAYMENT_OPTIONS)[number]["key"];

export function PosClient({
  products,
  categories,
}: {
  products: PosProduct[];
  categories: CategoryModel[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [payment, setPayment] = useState<Payment>("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Topping selector modal
  const [toppingProduct, setToppingProduct] = useState<PosProduct | null>(null);
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "all" || p.category.id === category) &&
        (q === "" || p.name.toLowerCase().includes(q)),
    );
  }, [products, query, category]);

  const cartItems = useMemo(
    () =>
      cart
        .map((c) => {
          const product = products.find((p) => p.id === c.productId);
          if (!product) return null;
          const chosenToppings = (product.toppings ?? []).filter((t) =>
            c.toppingIds.includes(t.ingredientId),
          );
          const extraPrice = chosenToppings.reduce((sum, t) => sum + t.extraPrice, 0);
          const unitPrice = product.sellingPrice + extraPrice;
          return {
            ...c,
            product,
            chosenToppings,
            unitPrice,
            totalPrice: unitPrice * c.quantity,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    [cart, products],
  );

  const subtotal = cartItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const itemCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  // Satu produk bisa muncul di beberapa baris (topping berbeda); batas stok berlaku untuk totalnya.
  const qtyInCart = (productId: string, exceptLineId?: string) =>
    cart.filter((i) => i.productId === productId && i.id !== exceptLineId).reduce((s, i) => s + i.quantity, 0);

  function handleProductClick(product: PosProduct) {
    if (product.outOfStock) {
      toast.error(`${product.name} stok habis`);
      return;
    }
    if (qtyInCart(product.id) >= product.maxMakeable) {
      toast.error(`Stok tidak cukup (maks ${product.maxMakeable})`);
      return;
    }
    if (product.toppings && product.toppings.length > 0) {
      setToppingProduct(product);
      setSelectedToppings([]);
    } else {
      addItem(product.id, []);
    }
  }

  function addItem(productId: string, toppingIds: string[]) {
    const sorted = [...toppingIds].sort();
    const lineId = `${productId}::${sorted.join(",")}`;
    setCart((prev) => {
      const found = prev.find((i) => i.id === lineId);
      if (found) {
        if (found.quantity >= MAX_ITEM_QTY) {
          toast.info(`Maks ${MAX_ITEM_QTY} per baris`);
          return prev;
        }
        return prev.map((i) => (i.id === lineId ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: lineId, productId, quantity: 1, toppingIds: sorted }];
    });
  }

  function setQuantity(lineId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(lineId);
      return;
    }
    const target = cart.find((i) => i.id === lineId);
    if (!target) return;
    const product = products.find((p) => p.id === target.productId);
    if (!product) return;
    if (quantity + qtyInCart(product.id, lineId) > product.maxMakeable) {
      toast.error(`Stok tidak cukup (maks ${product.maxMakeable})`);
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.id === lineId ? { ...i, quantity: Math.min(quantity, MAX_ITEM_QTY) } : i)),
    );
  }

  function removeFromCart(lineId: string) {
    setCart((prev) => prev.filter((i) => i.id !== lineId));
  }

  function toggleTopping(ingredientId: string) {
    setSelectedToppings((prev) =>
      prev.includes(ingredientId)
        ? prev.filter((id) => id !== ingredientId)
        : [...prev, ingredientId],
    );
  }

  function confirmToppingSelection() {
    if (!toppingProduct) return;
    addItem(toppingProduct.id, selectedToppings);
    setToppingProduct(null);
    setSelectedToppings([]);
  }

  async function checkout() {
    if (cartItems.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await actionCreateSale(
        cartItems.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          toppingIds: i.toppingIds,
        })),
        payment,
      );
      if (res.ok) {
        toast.success("Transaksi berhasil disimpan");
        setCart([]);
        setPayment("CASH");
        setCartOpen(false);
        searchRef.current?.focus();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cartBody = (
    <>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto lg:max-h-[42vh]">
        {cartItems.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Ketuk produk untuk menambahkannya.
          </p>
        )}
        {cartItems.map((i) => (
          <div key={i.id} className="flex items-center gap-2 py-1.5 border-b pb-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.product.name}</p>
              {i.chosenToppings.length > 0 ? (
                <p className="truncate text-xs text-primary font-medium">
                  + {i.chosenToppings.map((t) => t.ingredient.name).join(", ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Original</p>
              )}
              <p className="tnum text-xs text-muted-foreground">
                {rupiah(i.unitPrice)} × {i.quantity} = {rupiah(i.totalPrice)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setQuantity(i.id, i.quantity - 1)}
                aria-label={`Kurangi ${i.product.name}`}
              >
                <Minus />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ITEM_QTY}
                value={i.quantity}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") return;
                  const n = parseInt(val, 10);
                  if (!isNaN(n) && n > 0) {
                    setQuantity(i.id, Math.min(n, MAX_ITEM_QTY));
                  }
                }}
                className="tnum h-7 w-11 px-1 text-center"
                aria-label={`Jumlah ${i.product.name}`}
              />
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setQuantity(i.id, i.quantity + 1)}
                aria-label={`Tambah ${i.product.name}`}
              >
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeFromCart(i.id)}
                aria-label={`Hapus ${i.product.name}`}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t pt-3">
        <div className="tnum flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            Total {itemCount > 0 && `· ${number(itemCount)} item`}
          </span>
          <span className="text-xl font-semibold tracking-tight">{rupiah(subtotal)}</span>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
          Metode pembayaran
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {PAYMENT_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPayment(key)}
              aria-pressed={payment === key}
              className={cn(
                "flex min-h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                payment === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <Button
        size="lg"
        className="mt-3 h-11 w-full text-sm"
        onClick={checkout}
        disabled={cartItems.length === 0 || submitting}
      >
        {submitting ? "Menyimpan..." : `Bayar ${rupiah(subtotal)}`}
      </Button>
    </>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <PageHeader title="Kasir" />

        <div className="space-y-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk"
              className="h-9 pl-8.5"
              aria-label="Cari produk"
            />
          </div>

          <div
            role="group"
            aria-label="Filter kategori"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
          >
            {[{ id: "all", name: "Semua" }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  category === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const hasToppings = p.toppings && p.toppings.length > 0;
            const disabled = p.outOfStock || submitting;
            const cartTotalQty = qtyInCart(p.id);
            const lowStock = !p.outOfStock && p.maxMakeable <= 5;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                aria-disabled={disabled}
                onClick={() => handleProductClick(p)}
                aria-label={`Tambah ${p.name}, ${rupiah(p.sellingPrice)}${p.outOfStock ? " (stok habis)" : ""}`}
                className={cn(
                  "group relative overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-foreground/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className="flex aspect-4/3 items-center justify-center overflow-hidden bg-secondary/60">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <CupSoda className="size-7 text-muted-foreground/35" aria-hidden />
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  {/* Nama produk harus utuh: kasir memilih dari nama, bukan
                      dari ikon. Badge turun ke baris harga agar tidak memakan
                      lebar nama. */}
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
                  <div className="flex items-center justify-between gap-1">
                    <p className="tnum text-sm font-semibold text-primary">
                      {rupiah(p.sellingPrice)}
                    </p>
                    {hasToppings && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] shrink-0">
                        <Sparkles className="size-2.5 mr-0.5" />
                        Topping
                      </Badge>
                    )}
                    {p.outOfStock && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px] shrink-0">
                        Habis
                      </Badge>
                    )}
                    {lowStock && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] shrink-0">
                        Sisa {p.maxMakeable}
                      </Badge>
                    )}
                    {!p.outOfStock && !lowStock && cartTotalQty >= p.maxMakeable && p.maxMakeable < 100 && (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px] shrink-0">
                        Maks
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={Search}
                title="Produk tidak ditemukan"
                description="Coba kata kunci lain atau pilih kategori berbeda."
              />
            </div>
          )}
        </div>
      </div>

      {/* Desktop Cart */}
      <Card className="hidden h-fit lg:sticky lg:top-20 lg:block">
        <CardContent>
          <h2 className="mb-2.5">Keranjang</h2>
          {cartBody}
        </CardContent>
      </Card>

      {/* Mobile Cart Button */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3rem+env(safe-area-inset-bottom))] z-30 border-t bg-card/95 p-3 backdrop-blur md:bottom-0 lg:hidden">
          <Button size="lg" className="h-11 w-full justify-between text-sm" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              {number(itemCount)} item
            </span>
            <span className="tnum">{rupiah(subtotal)}</span>
          </Button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl lg:hidden">
          <SheetHeader>
            <SheetTitle>Keranjang</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{cartBody}</div>
        </SheetContent>
      </Sheet>

      {/* Topping Selection Dialog */}
      <Dialog
        open={toppingProduct !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToppingProduct(null);
            // Bersihkan pilihan topping agar produk berikutnya tidak mewarisi sisa.
            setSelectedToppings([]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Sajian / Topping</DialogTitle>
          </DialogHeader>
          {toppingProduct && (
            <div className="space-y-4">
              <div className="flex justify-between items-baseline border-b pb-2">
                <span className="font-semibold">{toppingProduct.name}</span>
                <span className="font-medium text-primary">{rupiah(toppingProduct.sellingPrice)}</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Topping Add-on (Sajian Premium)
                </p>
                <div className="divide-y rounded-lg border bg-card">
                  {toppingProduct.toppings.map((t) => {
                    const isSelected = selectedToppings.includes(t.ingredientId);
                    return (
                      <label
                        key={t.id}
                        className={cn(
                          "flex items-center justify-between p-3 cursor-pointer transition-colors text-sm hover:bg-muted/50",
                          isSelected && "bg-primary/5",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTopping(t.ingredientId)}
                            className="size-4 rounded border-primary accent-primary"
                          />
                          <div>
                            <p className="font-medium">{t.ingredient.name}</p>
                            <p className="text-xs text-muted-foreground">{number(t.quantity)} {t.ingredient.unit}</p>
                          </div>
                        </div>
                        <span className="font-medium text-primary text-xs">+ {rupiah(t.extraPrice)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg bg-secondary/60 p-3 text-sm flex justify-between items-center">
                <span>Total per sajian:</span>
                <strong className="text-base text-primary">
                  {rupiah(
                    toppingProduct.sellingPrice +
                      (toppingProduct.toppings ?? [])
                        .filter((t) => selectedToppings.includes(t.ingredientId))
                        .reduce((s, t) => s + t.extraPrice, 0),
                  )}
                </strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setToppingProduct(null)}>
              Batal
            </Button>
            <Button onClick={confirmToppingSelection}>
              Tambah ke Keranjang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
