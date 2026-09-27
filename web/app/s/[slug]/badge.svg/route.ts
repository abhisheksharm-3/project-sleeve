/** GET /s/:slug/badge.svg — a one-line badge with a published page's overall state. */
import { badgeSvg } from "@/lib/badge";
import { loadStatusPage } from "@/lib/status-page";
import { OVERALL_WORDS } from "@/lib/status-words";

export async function GET(_req: Request, ctx: RouteContext<"/s/[slug]/badge.svg">) {
  const page = await loadStatusPage((await ctx.params).slug, null);
  const words = page ? OVERALL_WORDS[page.overall] : null;
  const svg = badgeSvg("status", words?.short ?? "private", words?.color ?? "#9b9ba4");
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
