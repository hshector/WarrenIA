"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { IconOverview, IconPortfolio, IconRadar, IconResearch, IconSettings, IconWatch } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";

import { Wordmark } from "./brand";

export const NAV = [
  { href: "/", label: "Overview", icon: IconOverview },
  { href: "/radar", label: "Momentum Radar", short: "Radar", icon: IconRadar },
  { href: "/research", label: "Research", icon: IconResearch },
  { href: "/portfolio", label: "Portfolio", icon: IconPortfolio },
  { href: "/watchlist", label: "Watchlist", icon: IconWatch },
  { href: "/settings", label: "Datos y ajustes", short: "Ajustes", icon: IconSettings },
];

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Sidebar({ footer }: { footer?: React.ReactNode }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-canvas-2/70 px-3 py-4 lg:flex">
      <Link href="/" className="px-2.5 pb-6 pt-1">
        <Wordmark />
      </Link>
      <nav className="flex flex-col gap-0.5" aria-label="Principal">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = active(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "group relative flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[13.5px] transition-colors",
                on ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
              )}
            >
              {on && <span className="absolute -left-3 top-2 bottom-2 w-[2px] rounded-full bg-accent" />}
              <Icon size={17} className={on ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2.5">{footer}</div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = NAV.filter((n) => n.href !== "/settings");
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {items.map(({ href, label, short, icon: Icon }) => {
        const on = active(path, href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cx("flex h-14 flex-col items-center justify-center gap-1 text-[10.5px]", on ? "text-ink" : "text-ink-3")}>
            <Icon size={19} className={on ? "text-accent" : undefined} />
            {short ?? label}
          </Link>
        );
      })}
    </nav>
  );
}
