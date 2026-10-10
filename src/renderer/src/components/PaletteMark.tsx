/** The Open Palette mark: a command bar holding three pigment wells. */
export function PaletteMark({ size = 16 }: { size?: number }) {
  return (
    <svg className="palette-mark" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="4" width="14" height="8" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="8" r="1.25" fill="var(--pigment-blue)" />
      <circle cx="8" cy="8" r="1.25" fill="var(--pigment-pink)" />
      <circle cx="11" cy="8" r="1.25" fill="var(--pigment-yellow)" />
    </svg>
  );
}
