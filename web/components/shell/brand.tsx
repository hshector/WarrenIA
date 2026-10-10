// Brand mark: a body on an inclined orbit — the product tracks trajectories.
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="wm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb877" />
          <stop offset="0.5" stopColor="#f0883a" />
          <stop offset="1" stopColor="#c9561f" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="16" rx="13" ry="6.2" fill="none" stroke="currentColor" strokeOpacity="0.38" strokeWidth="1.4" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="5.2" fill="url(#wm-g)" />
      <circle cx="26.6" cy="10.4" r="1.9" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 text-ink">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        Warren<span className="text-gradient-accent">IA</span>
      </span>
    </span>
  );
}
