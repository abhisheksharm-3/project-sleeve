/** Fourteen nights, oldest first: a lit window for a clean night, dim for a patchy one. */
import type { Day } from "@/lib/load-health";

export function NightStrip({ days, now }: { days: Day[]; now: number }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return (
    <span className="flex items-end gap-1" role="img" aria-label="check results, last 14 days">
      {Array.from({ length: 14 }, (_, i) => {
        const date = new Date(now - (13 - i) * 86_400_000).toISOString().slice(0, 10);
        const d = byDay.get(date);
        const look = !d
          ? "window-dark"
          : d.ok === d.pings
            ? "window-lit"
            : d.ok === 0
              ? "bg-dead"
              : "window-dim";
        const title = d ? `${date}: ${d.ok} of ${d.pings} checks succeeded` : `${date}: no checks`;
        return <span key={date} title={title} className={`h-3.5 w-2.5 rounded-[2px] ${look}`} />;
      })}
    </span>
  );
}
