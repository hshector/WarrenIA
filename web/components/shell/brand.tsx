/** Brand mark: a rounded double U (W), drawn in the current text colour.
 *  Same path as scripts/icons.mjs, which generates the app icons from it. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M6 9v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V9" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
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
