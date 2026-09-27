/** DELETE /api/v1/targets/:id — remove one of the token owner's backends. */
import { apiError, apiUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/targets/[id]">) {
  const userId = await apiUser(request);
  if (!userId) return apiError(401, "Send a valid API token as Authorization: Bearer <token>.");
  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("targets")
    .select("id, projects!inner (user_id)")
    .eq("id", id)
    .eq("projects.user_id", userId)
    .maybeSingle();
  if (!target) return apiError(404, "No backend of yours has that id.");
  await admin.from("targets").delete().eq("id", id);
  return new Response(null, { status: 204 });
}
