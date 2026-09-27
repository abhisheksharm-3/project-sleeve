/**
 * The landing hero: a night skyline whose windows switch on one at a time. One window
 * flickers and one stays dark, which teaches the three states before anyone reads a word.
 * Deterministic, so the prerendered page and the browser agree.
 */
const BUILDINGS = [
  { cols: 3, rows: 4, offset: 40 },
  { cols: 4, rows: 7, offset: 0 },
  { cols: 2, rows: 3, offset: 70 },
  { cols: 5, rows: 5, offset: 20 },
  { cols: 3, rows: 8, offset: 0 },
  { cols: 4, rows: 4, offset: 50 },
  { cols: 2, rows: 6, offset: 10 },
  { cols: 3, rows: 5, offset: 30 },
  { cols: 4, rows: 3, offset: 80 },
  { cols: 3, rows: 7, offset: 0 },
  { cols: 5, rows: 4, offset: 45 },
  { cols: 2, rows: 5, offset: 25 },
  { cols: 4, rows: 6, offset: 5 },
];

const FLICKER = "4-2-1";
const DARK = "1-5-2";
const UNLIT = new Set(["0-0-2", "3-1-4", "5-3-0", "6-0-1", "7-4-2", "1-0-3", "4-7-0"]);

export function Skyline() {
  let order = 0;
  return (
    <div aria-hidden className="flex items-end justify-between gap-3 overflow-hidden sm:gap-4">
      {BUILDINGS.map((b, bi) => (
        <div
          key={`${b.cols}-${b.rows}-${b.offset}`}
          className={`shrink-0 rounded-t-lg border border-b-0 border-line bg-surface p-3 ${bi > 4 ? "hidden md:block" : ""} ${bi > 8 ? "md:hidden xl:block" : ""}`}
          style={{ marginTop: b.offset }}
        >
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${b.cols}, 14px)` }}>
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
                  className={`h-5 w-3.5 rounded-[3px] ${look}`}
                  style={delay ? { animationDelay: delay } : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
