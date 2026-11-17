"use client";

import { useRouter } from "next/navigation";
import { CupSoda, LogOut, ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const today = () =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());

/**
 * Header tidak lagi mengulang nama halaman: setiap halaman sudah punya <h1>
 * sendiri, dan sidebar menandai item aktif. Yang tersisa di sini hanya hal
 * yang berlaku lintas halaman: tanggal, tema, dan akun.
 */
export function DashboardHeader({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5 sm:px-6">
      {/* Brand hanya di mobile, tempat sidebar tidak tampil. */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <CupSoda className="size-4" />
        </div>
        <span className="text-sm font-semibold">Streetboth</span>
      </div>
      <p className="hidden text-sm text-muted-foreground md:block">{today()}</p>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5 px-1.5">
              <Avatar size="sm">
                <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                {name}
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium text-foreground">{name}</p>
              <p className="truncate text-xs font-normal">{email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              // callbackURL better-auth hanya untuk logout provider OAuth; navigasi manual.
              onClick={() =>
                authClient.signOut({ fetchOptions: { onSuccess: () => router.replace("/login") } })
              }
            >
              <LogOut />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
