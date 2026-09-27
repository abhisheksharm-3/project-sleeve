/** README images as SVG: the one-line badge and a status page's 90-day bars. No server fonts. */

const CHAR_WIDTH = 6.6;
const PAD = 10;

export function escapeXml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

export function badgeSvg(label: string, value: string, color: string): string {
  const lw = Math.round(label.length * CHAR_WIDTH + PAD * 2);
  const vw = Math.round(value.length * CHAR_WIDTH + PAD * 2);
  const w = lw + vw;
  const [l, v] = [escapeXml(label), escapeXml(value)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${v}"><title>${l}: ${v}</title><rect width="${lw}" height="20" rx="3" fill="#0d0d0f"/><rect x="${lw}" width="${vw}" height="20" rx="3" fill="${color}"/><rect x="${lw}" width="4" height="20" fill="${color}"/><g font-family="Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14" fill="#e9e4d8">${l}</text><text x="${lw + vw / 2}" y="14" fill="#000000">${v}</text></g></svg>`;
}

export type BarsRow = {
  label: string;
  cells: ("up" | "partial" | "down" | "none")[];
  uptime: string;
};

const CELL: Record<BarsRow["cells"][number], string> = {
  up: "#f4b860",
  partial: "#6b5433",
  down: "#e26d5a",
  none: "#1d1d22",
};

/** At most eight rows, labels cut to fit; the page itself holds the rest. */
export function barsSvg(title: string, state: string, stateColor: string, rows: BarsRow[]): string {
  const W = 720;
  const PADDING = 24;
  const ROW = 58;
  const shown = rows.slice(0, 8);
  const H = 100 + shown.length * ROW + (rows.length > shown.length ? 24 : 0);
  const inner = W - PADDING * 2;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const body = shown
    .map((r, i) => {
      const y = 100 + i * ROW;
      const gap = 2;
      const cw = (inner - gap * (r.cells.length - 1)) / Math.max(1, r.cells.length);
      const cells = r.cells
        .map(
          (c, j) =>
            `<rect x="${(PADDING + j * (cw + gap)).toFixed(2)}" y="${y + 12}" width="${cw.toFixed(2)}" height="22" rx="1.5" fill="${CELL[c]}"/>`,
        )
        .join("");
      return `<text x="${PADDING}" y="${y}" fill="#e9e4d8" font-size="13" font-weight="600">${escapeXml(clip(r.label, 60))}</text><text x="${W - PADDING}" y="${y}" fill="#9b9ba4" font-size="13" text-anchor="end">${escapeXml(r.uptime)}</text>${cells}`;
    })
    .join("");
  const more =
    rows.length > shown.length
      ? `<text x="${PADDING}" y="${H - 16}" fill="#9b9ba4" font-size="12">and ${rows.length - shown.length} more on the status page</text>`
      : "";
  const [t, st] = [escapeXml(clip(title, 50)), escapeXml(state)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t}: ${st}"><title>${t}: ${st}</title><rect width="${W}" height="${H}" rx="12" fill="#000000" stroke="#26262c"/><g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><text x="${PADDING}" y="36" fill="#e9e4d8" font-size="18" font-weight="700">${t}</text><text x="${PADDING}" y="58" fill="${stateColor}" font-size="13" font-weight="600">${st}</text>${body}${more}</g></svg>`;
}
