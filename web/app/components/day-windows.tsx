/**
 * A backend's history as a row of windows, one per day, oldest on the left: lit when every
 * check passed, dim when some failed, red when all did, dark when nothing ran.
 */
import type { DayCell, DayState } from "@/lib/uptime";

const LOOK: Record<DayState, string> = {
  up: "bg-alive",
  partial: "bg-alive/40",
  down: "bg-dead",
  none: "bg-unlit",
};

const WORDS: Record<DayState, string> = {
  up: "every check passed",
  partial: "some checks failed",
  down: "every check failed",
  none: "no checks ran",
};

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** `mobileDays` trims the row to the most recent days below the sm breakpoint. */
export function DayWindows({
  cells,
  mobileDays = cells.length,
  className = "h-7",
}: {
  cells: DayCell[];
  mobileDays?: number;
  className?: string;
}) {
  const hiddenBefore = cells.length - mobileDays;
  return (
    <ul className={`flex gap-[2px] ${className}`}>
      {cells.map((c, i) => (
        <li
          key={c.day}
          title={`${dayLabel(c.day)}: ${c.uptime === null ? WORDS[c.state] : `${c.uptime}% passed`}`}
          className={`min-w-0 flex-1 rounded-[2px] ${LOOK[c.state]} ${i < hiddenBefore ? "max-sm:hidden" : ""}`}
        >
          <span className="sr-only">
            {dayLabel(c.day)}: {WORDS[c.state]}
          </span>
        </li>
      ))}
    </ul>
  );
}
