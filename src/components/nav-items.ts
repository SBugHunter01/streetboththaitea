import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Boxes,
  Wallet,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export type NavSection = "menu" | "manajemen" | "analisis";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  section: NavSection;
}

export const NAV_SECTION_LABEL: Record<NavSection, string> = {
  menu: "Menu Utama",
  manajemen: "Manajemen",
  analisis: "Analisis",
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Beranda", icon: LayoutDashboard, section: "menu" },
  { href: "/pos", label: "Kasir", shortLabel: "Kasir", icon: ShoppingCart, section: "menu" },
  { href: "/transactions", label: "Transaksi", shortLabel: "Transaksi", icon: ReceiptText, section: "manajemen" },
  { href: "/products", label: "Produk", shortLabel: "Produk", icon: Package, section: "manajemen" },
  { href: "/ingredients", label: "Bahan Baku", shortLabel: "Bahan", icon: Boxes, section: "manajemen" },
  { href: "/expenses", label: "Pengeluaran", shortLabel: "Beban", icon: Wallet, section: "manajemen" },
  { href: "/reports", label: "Laporan", shortLabel: "Laporan", icon: BarChart3, section: "analisis" },
];

export const isActiveNav = (pathname: string, href: string) =>
  pathname === href || (href !== "/dashboard" && pathname.startsWith(href));