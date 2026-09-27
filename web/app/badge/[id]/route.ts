/** GET /badge/:projectId — the README badge. Unpublished projects get a neutral badge, not a 404, so a README never shows a broken image. */
import { badgeSvg } from "@/lib/badge";
import { loadPublicStatus } from "@/lib/public-status";

export async function GET(_req: Request, ctx: RouteContext<"/badge/[id]">) {
  const { id } = await ctx.params;
  const status = await loadPublicStatus(id);
  const svg = !status
    ? badgeSvg("kept awake", "private", "#9b9ba4")
    : badgeSvg(
        "kept awake",
        status.rate === null ? "starting" : `${status.rate}%`,
        status.allAwake ? "#f4b860" : "#e26d5a",
      );
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
