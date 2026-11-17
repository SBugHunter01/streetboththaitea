"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { navItems, isActiveNav } from "@/components/nav-items";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * 4 tab utama + 1 overflow. Tujuh tab sejajar memberi lebar target ~53px di
 * layar 375px dan memotong label; empat memberi ~75px, cukup untuk target
 * sentuh yang nyaman dan label utuh.
 */
const PRIMARY = ["/dashboard", "/pos", "/transactions", "/reports"];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const primary = PRIMARY.map((href) => navItems.find((i) => i.href === href)!);
  const overflow = navItems.filter((i) => !PRIMARY.includes(i.href));
  const overflowActive = overflow.some((i) => isActiveNav(pathname, i.href));

  return (
    <>
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isActiveNav(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />
                )}
                <item.icon className="size-5" />
                {item.shortLabel}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={cn(
              "relative flex min-h-12 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
              overflowActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            {overflowActive && (
              <span className="absolute top-0 h-0.5 w-10 rounded-full bg-primary" />
            )}
            <MoreHorizontal className="size-5" />
            Lainnya
          </button>
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader>
            <SheetTitle>Manajemen</SheetTitle>
          </SheetHeader>
          <div className="grid gap-1 px-4">
            {overflow.map((item) => {
              const active = isActiveNav(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
