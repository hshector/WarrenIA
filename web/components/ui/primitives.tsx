import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BTN: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-2 font-medium",
  secondary: "bg-surface-2 text-ink border border-line-2 hover:bg-surface-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "text-neg border border-line-2 hover:bg-neg-soft",
};

export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-ctl)] transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[13.5px]",
        BTN[variant],
        className,
      )}
    />
  );
}

export function ButtonLink({ href, variant = "secondary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-2 h-9 px-3.5 text-[13.5px] rounded-[var(--radius-ctl)] transition-colors", BTN[variant], className)}>
      {children}
    </Link>
  );
}

export function Panel({ title, meta, actions, children, className, pad = true, id }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={cx("min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>}
            {meta && <p className="t-meta mt-0.5">{meta}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(pad && "px-4 pb-4 md:px-5", !title && !actions && pad && "pt-4")}>{children}</div>
    </section>
  );
}

export function Badge({ tone = "neutral", children, className, title }: { tone?: "neutral" | "accent" | "pos" | "neg" | "warn" | "info"; children: ReactNode; className?: string; title?: string }) {
  const t = {
    neutral: "bg-surface-2 text-ink-2 border-line-2",
    accent: "bg-accent-soft text-accent border-accent-line",
    pos: "bg-pos-soft text-pos border-transparent",
    neg: "bg-neg-soft text-neg border-transparent",
    warn: "bg-warn-soft text-warn border-transparent",
    info: "bg-info-soft text-info border-transparent",
  }[tone];
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 h-5 px-1.5 rounded-[5px] border text-[11px] font-medium whitespace-nowrap", t, className)}>
      {children}
    </span>
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        className?.match(/(^|\s)w-/) ? "" : "w-full",
        "h-9 rounded-[var(--radius-ctl)] border border-line-2 bg-canvas-2 px-3 text-[13.5px] text-ink placeholder:text-ink-3 outline-none focus:border-accent-line focus:ring-2 focus:ring-accent-soft",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cx(
        "h-9 rounded-[var(--radius-ctl)] border border-line-2 bg-canvas-2 pl-2.5 pr-7 text-[13px] text-ink outline-none focus:border-accent-line appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8a8a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="t-label">{label}</span>
      {children}
      {hint && <span className="t-meta">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md", ariaLabel }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: "sm" | "md"; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex rounded-[var(--radius-ctl)] border border-line-2 bg-canvas-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[6px] px-2.5 transition-colors",
            size === "sm" ? "h-7 text-[12px]" : "h-8 text-[13px]",
            value === o.value ? "bg-surface-3 text-ink shadow-[inset_0_0_0_1px_var(--line-2)]" : "text-ink-3 hover:text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-panel)] border border-dashed border-line-2 px-5 py-6">
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children && <div className="t-body max-w-prose">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "neg" | "accent"; title?: string; children: ReactNode }) {
  const t = { info: "border-info/30 bg-info-soft", warn: "border-warn/30 bg-warn-soft", neg: "border-neg/30 bg-neg-soft", accent: "border-accent-line bg-accent-soft" }[tone];
  const c = { info: "text-info", warn: "text-warn", neg: "text-neg", accent: "text-accent" }[tone];
  return (
    <div className={cx("rounded-[10px] border px-3.5 py-2.5 text-[13px]", t)}>
      {title && <p className={cx("font-medium", c)}>{title}</p>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="t-label">{label}</span>
      <span className="num text-[17px] font-semibold tracking-[-0.01em] text-ink">{value}</span>
      {sub && <span className="t-meta num">{sub}</span>}
    </div>
  );
}
