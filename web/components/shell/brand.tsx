export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <radialGradient id="wm-n" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffc08f" />
          <stop offset="0.55" stopColor="#f2611d" />
          <stop offset="1" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#wm-n)" />
      <ellipse cx="16" cy="16" rx="11" ry="4.6" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.5" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="3.6" fill="#fff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-ink">
      <BrandMark />
      <span className="text-[17px] font-bold tracking-[-0.02em]">WarrenIA</span>
    </span>
  );
}
