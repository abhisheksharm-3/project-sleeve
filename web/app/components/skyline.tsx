/**
 * The night skyline: windows switch on one at a time, one flickers and one stays dark,
 * which teaches the three states before anyone reads a word. Deterministic, so the
 * prerendered page and the browser agree.
 *
 * Buildings keep a fixed size. The row wraps and is clipped to exactly one building's
 * height (every building sits in a slot that tall), so any building that does not fit drops out whole instead of being squeezed or
 * sliced at the edge, and the ones that fit spread to fill the width.
 */
const BUILDINGS = [
  { id: "b1", cols: 3, rows: 4 },
  { id: "b2", cols: 4, rows: 7 },
  { id: "b3", cols: 2, rows: 3 },
  { id: "b4", cols: 5, rows: 5 },
  { id: "b5", cols: 3, rows: 8 },
  { id: "b6", cols: 4, rows: 4 },
  { id: "b7", cols: 2, rows: 6 },
  { id: "b8", cols: 3, rows: 5 },
  { id: "b9", cols: 4, rows: 3 },
  { id: "b10", cols: 3, rows: 7 },
  { id: "b11", cols: 5, rows: 4 },
  { id: "b12", cols: 2, rows: 5 },
  { id: "b13", cols: 4, rows: 6 },
];

const FLICKER = "4-2-1";
const DARK = "1-5-2";
const UNLIT = new Set([
  "0-0-2",
  "3-1-4",
  "5-3-0",
  "6-0-1",
  "7-4-2",
  "1-0-3",
  "4-7-0",
  "9-2-1",
  "12-0-3",
]);

const WINDOW = 14;
const GAP = 8;
const PAD = 12;
const TALLEST = Math.max(...BUILDINGS.map((b) => b.rows));
/** Tallest building: its window rows and gaps, padding, and the 1px top border. */
const ROW_HEIGHT = TALLEST * 20 + (TALLEST - 1) * GAP + PAD * 2 + 1;

export function Skyline() {
  let order = 0;
  return (
    <div
      aria-hidden
      className="flex w-full flex-wrap items-end justify-between gap-x-3 overflow-hidden sm:gap-x-4"
      style={{ height: ROW_HEIGHT }}
    >
      {BUILDINGS.map((b, bi) => (
        <div
          key={b.id}
          className="flex shrink-0 flex-col justify-end"
          style={{ height: ROW_HEIGHT }}
        >
          <div
            className="rounded-t-lg border border-b-0 border-line bg-surface"
            style={{ padding: PAD }}
          >
            <div
              className="grid"
              style={{ gridTemplateColumns: `repeat(${b.cols}, ${WINDOW}px)`, gap: GAP }}
            >
              {Array.from({ length: b.cols * b.rows }, (_, i) => {
                const key = `${bi}-${Math.floor(i / b.cols)}-${i % b.cols}`;
                const look =
                  key === FLICKER
                    ? "window-lit flicker"
                    : key === DARK
                      ? "window-dark ring-1 ring-dead/70 ring-inset"
                      : UNLIT.has(key)
                        ? "window-dark"
                        : "window-lit switch-on";
                const delay = look.includes("switch-on") ? `${(order++ * 45) % 2600}ms` : undefined;
                return (
                  <span
                    key={key}
                    className={`h-5 rounded-[3px] ${look}`}
                    style={delay ? { animationDelay: delay } : undefined}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
