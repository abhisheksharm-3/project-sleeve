/** GET or POST /h/:token/fail — a job saying it ran and failed, which alerts straight away. */
import { receiveHeartbeat } from "@/lib/heartbeat-receive";

async function handle(_req: Request, ctx: RouteContext<"/h/[token]/fail">) {
  return receiveHeartbeat((await ctx.params).token, false);
}

export { handle as GET, handle as POST };
