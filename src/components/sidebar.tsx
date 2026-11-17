"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CupSoda } from "lucide-react";
import { navItems, NAV_SECTION_LABEL, isActiveNav, type NavSection } from "@/components/nav-items";
import { cn } from "@/lib/utils";

const SECTIONS: NavSection[] = ["menu", "manajemen", "analisis"];

/**
 * Rail samping memakai permukaan yang sama dengan halaman dan dipisahkan garis,
 * bukan panel gelap. Lompatan tone gelap di mode terang memecah layar jadi dua
 * dan membuat isi terasa lebih sempit dari yang sebenarnya.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-background md:flex">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
          <CupSoda className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Streetboth</p>
          <p className="truncate text-xs text-muted-foreground">ThaiTea Cheesy</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-4">
        {SECTIONS.map((section) => (
          <div key={section} className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70">
              {NAV_SECTION_LABEL[section]}
            </p>
            {navItems
              .filter((item) => item.section === section)
              .map((item) => {
                const active = isActiveNav(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
