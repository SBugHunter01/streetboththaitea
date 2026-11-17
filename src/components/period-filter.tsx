"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PERIOD_LABEL, type PeriodKey } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Satu baris chip untuk semua preset. Versi sebelumnya punya grup tombol DAN
 * dropdown yang keduanya menampilkan periode aktif, jadi state yang sama
 * ditampilkan dua kali dan bisa terlihat saling bertentangan.
 */
const PRESETS: PeriodKey[] = ["today", "yesterday", "7d", "month", "prevMonth"];

export function PeriodFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("period");
  const period: PeriodKey = raw && Object.hasOwn(PERIOD_LABEL, raw) ? (raw as PeriodKey) : "month";
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [open, setOpen] = useState(false);

  function navigate(nextPeriod: PeriodKey) {
    const search = new URLSearchParams();
    if (nextPeriod === "custom") {
      if (!from || !to) return;
      search.set("from", from);
      search.set("to", to);
    }
    search.set("period", nextPeriod);
    setOpen(false);
    router.replace(`?${search.toString()}`);
  }

  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div
      role="group"
      aria-label="Periode laporan"
      className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 py-0.5"
    >
      {PRESETS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => navigate(key)}
          aria-pressed={period === key}
          className={chip(period === key)}
        >
          {PERIOD_LABEL[key]}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-pressed={period === "custom"} className={chip(period === "custom")}>
            {period === "custom" ? "Kustom ✓" : "Kustom"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="grid gap-1.5">
            <Label htmlFor="period-from">Dari tanggal</Label>
            <Input
              id="period-from"
              type="date"
              max={to || undefined}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="period-to">Sampai tanggal</Label>
            <Input
              id="period-to"
              type="date"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!from || !to} onClick={() => navigate("custom")}>
            Terapkan
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
