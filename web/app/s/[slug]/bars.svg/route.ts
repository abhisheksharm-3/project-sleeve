/** GET /s/:slug/bars.svg — a published page's 90-day bars as an image for READMEs and footers. */
import { barsSvg } from "@/lib/badge";
import { loadStatusPage } from "@/lib/status-page";
import { OVERALL_WORDS } from "@/lib/status-words";

export async function GET(_req: Request, ctx: RouteContext<"/s/[slug]/bars.svg">) {
  const page = await loadStatusPage((await ctx.params).slug, null);
  const svg = page
    ? barsSvg(
        page.title,
        OVERALL_WORDS[page.overall].text,
        OVERALL_WORDS[page.overall].color,
        page.items.map((i) => ({
          label: i.label,
          cells: i.cells.map((c) => c.state),
          uptime: page.showUptime && i.uptime.d90 !== null ? `${i.uptime.d90}%` : "",
        })),
      )
    : barsSvg("Status page", "This page is not published.", "#9b9ba4", []);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
