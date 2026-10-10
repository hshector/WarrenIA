import type { ReactNode } from "react";

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pb-5 pt-1 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="t-title text-ink">{title}</h1>
        {sub && <div className="mt-1 t-body">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
