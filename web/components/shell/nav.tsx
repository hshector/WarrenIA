"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconOverview, IconPortfolio, IconRadar, IconSettings } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

export const NAV = [
  { href: "/", label: "Inicio", icon: IconOverview },
  { href: "/radar", label: "Radar", icon: IconRadar },
  { href: "/portfolio", label: "Cartera", icon: IconPortfolio },
  { href: "/settings", label: "Ajustes", icon: IconSettings },
];

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/radar") return path.startsWith("/radar") || path.startsWith("/research") || path.startsWith("/watchlist");
  return path === href || path.startsWith(href + "/");
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 rounded-full bg-surface-3/70 p-1 md:flex">
      {NAV.map(({ href, label }) => {
        const on = active(path, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={cx("rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors", on ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ink-2 hover:text-ink")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const on = active(path, href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("flex h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium", on ? "text-accent" : "text-ink-3")}>
            <Icon size={23} strokeWidth={on ? 2 : 1.6} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
