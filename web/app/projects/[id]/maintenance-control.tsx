/** Start or end a backend's maintenance window, from its row on the project page. */
import { endMaintenance, startMaintenance } from "@/app/projects/actions";

const LENGTHS = [
  { hours: 1, label: "1 hour" },
  { hours: 3, label: "3 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

export function MaintenanceControl({ targetId, active }: { targetId: string; active: boolean }) {
  const action = "text-sm text-muted transition-colors hover:text-alive";
  if (active)
    return (
      <form action={endMaintenance}>
        <input type="hidden" name="target_id" value={targetId} />
        <button type="submit" className={action}>
          End maintenance
        </button>
      </form>
    );
  return (
    <details className="relative">
      <summary className={`${action} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        Maintenance
      </summary>
      <form
        action={startMaintenance}
        className="absolute right-0 z-10 mt-3 w-72 space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xl shadow-black"
      >
        <input type="hidden" name="target_id" value={targetId} />
        <p className="text-sm leading-relaxed text-muted">
          Hold alerts and show planned maintenance on status pages. Checks keep running.
        </p>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">For</span>
          <select
            name="hours"
            defaultValue="3"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
          >
            {LENGTHS.map((l) => (
              <option key={l.hours} value={l.hours}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Note, optional</span>
          <input
            name="note"
            maxLength={200}
            placeholder="Moving to a new region"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-alive px-4 py-2 text-sm font-semibold text-ink hover:bg-warn"
        >
          Start maintenance
        </button>
      </form>
    </details>
  );
}
