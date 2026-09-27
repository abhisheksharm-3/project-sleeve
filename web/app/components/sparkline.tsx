/** Daily mean response time as a line; days without checks leave a gap rather than a zero. */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const range = max - min || 1;
  const step = 100 / (values.length - 1);
  const segments: string[][] = [[]];
  values.forEach((v, i) => {
    if (v === null) {
      if (segments[segments.length - 1].length) segments.push([]);
      return;
    }
    const y = 26 - ((v - min) / range) * 22;
    segments[segments.length - 1].push(`${(i * step).toFixed(2)},${y.toFixed(2)}`);
  });
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-7 w-full overflow-visible"
    >
      {segments
        .filter((s) => s.length > 1)
        .map((s) => (
          <polyline
            key={s[0]}
            points={s.join(" ")}
            fill="none"
            stroke="var(--color-alive)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
    </svg>
  );
}
