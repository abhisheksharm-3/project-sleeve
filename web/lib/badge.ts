/** A README badge as SVG, sized from its text so it never needs a font on the server. */

const CHAR_WIDTH = 6.6;
const PAD = 10;

function escapeXml(s: string): string {
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
