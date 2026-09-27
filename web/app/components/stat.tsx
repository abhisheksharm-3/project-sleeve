/** One figure in a page's stat strip: a label, the number, and an optional line under it. */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="truncate text-sm text-muted">{note}</dd>}
    </div>
  );
}

/** Mean response time in words: "791ms", "1.3s", or a dash before any check. */
export function latencyText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
