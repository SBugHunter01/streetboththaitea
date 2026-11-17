"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = resolvedTheme === "dark";

  // Tema tersimpan hanya diketahui browser; pertahankan ruang tombol saat render server dan hidrasi awal.
  if (!mounted) return <Button variant="ghost" size="icon" disabled aria-label="Memuat tema" />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={dark ? "Aktifkan tema terang" : "Aktifkan tema gelap"}
          onClick={() => setTheme(dark ? "light" : "dark")}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? "Tema terang" : "Tema gelap"}</TooltipContent>
    </Tooltip>
  );
}