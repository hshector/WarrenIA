import Link from "next/link";

import { DataBanners, FreshnessStamp } from "@/components/shell/freshness";
import { MobileNav, Sidebar } from "@/components/shell/nav";
import { RefreshButton } from "@/components/shell/refresh-button";
import { BrandMark } from "@/components/shell/brand";
import { IconSettings } from "@/components/ui/icons";
import { computeFreshness } from "@/lib/market/freshness";
import { loadMarket } from "@/lib/market/source";
import { appMode } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { latest, meta } = await loadMarket();
  const fresh = latest ? computeFreshness(latest.data_asof, meta?.calendar?.sessions) : null;
  const mode = appMode();
  return (
    <div className="flex min-h-dvh">
      <Sidebar
        footer={
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="t-meta leading-snug">Herramienta de análisis. No ejecuta operaciones ni constituye asesoramiento.</p>
            {mode === "local" && <p className="text-[11px] text-warn">Modo local (sin login)</p>}
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <DataBanners latest={latest} fresh={fresh} warnings={meta?.warnings} />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md md:px-8">
          <Link href="/" className="lg:hidden" aria-label="Inicio">
            <BrandMark size={22} />
          </Link>
          <div className="min-w-0 flex-1">
            <FreshnessStamp latest={latest} fresh={fresh} />
          </div>
          <RefreshButton />
          <Link href="/settings" aria-label="Datos y ajustes" className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink lg:hidden">
            <IconSettings size={17} />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-24 pt-6 md:px-8 lg:pb-12">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
