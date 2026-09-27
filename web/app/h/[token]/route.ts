/** GET, POST or HEAD /h/:token — a job saying it ran. Any method works, so curl or wget will do. */
import { receiveHeartbeat } from "@/lib/heartbeat-receive";

async function handle(_req: Request, ctx: RouteContext<"/h/[token]">) {
  return receiveHeartbeat((await ctx.params).token, true);
}

export { handle as GET, handle as HEAD, handle as POST };
