"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { actionUpdateAllocation } from "@/lib/actions";
import { FUND_ACCOUNT_LABEL } from "@/lib/format";
import type { AllocationPct } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const FIELDS = [
  { key: "operationalPct", label: FUND_ACCOUNT_LABEL.operational },
  { key: "payrollPct", label: FUND_ACCOUNT_LABEL.payroll },
  { key: "emergencyPct", label: FUND_ACCOUNT_LABEL.emergency },
] as const satisfies readonly { key: keyof AllocationPct; label: string }[];

const toForm = (pct: AllocationPct) => ({
  operationalPct: String(pct.operationalPct),
  payrollPct: String(pct.payrollPct),
  emergencyPct: String(pct.emergencyPct),
});

export function AllocationDialog({ pct }: { pct: AllocationPct }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => toForm(pct));
  const [busy, setBusy] = useState(false);
  const total = FIELDS.reduce((s, f) => s + (Number(form[f.key]) || 0), 0);
  const allWhole = FIELDS.every((f) => {
    const v = form[f.key];
    return v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
  });
  const valid = allWhole && total === 100;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setForm(toForm(pct));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await actionUpdateAllocation({
        operationalPct: Number(form.operationalPct),
        payrollPct: Number(form.payrollPct),
        emergencyPct: Number(form.emergencyPct),
      });
      if (res.ok) {
        toast.success("Persentase disimpan");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Settings2 />
        Atur Persentase
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Persentase Pembagian</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            HPP dicadangkan ke Operasional sebatas omzet yang tersedia. Hanya laba kotor positif yang dibagi.
            Persentase baru menghitung ulang semua periode laporan.
          </p>
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`alloc-${f.key}`}>{f.label}</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`alloc-${f.key}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="tnum w-20 text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
            <div
              className={cn(
                "tnum flex justify-between border-t pt-3 text-sm font-medium",
                !valid && "text-destructive",
              )}
            >
              <span>Total</span>
              <span>{total}%</span>
            </div>
            {!allWhole && (
              <p className="text-xs text-destructive">Isi bilangan bulat 0–100.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={save} disabled={busy || !valid}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
