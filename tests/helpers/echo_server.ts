// A controllable HTTP target for end-to-end engine tests.
export function startEchoServer(handler: (req: Request) => Response | Promise<Response>) {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, handler);
  const port = (server.addr as Deno.NetAddr).port;
  return {
    url: `http://127.0.0.1:${port}/ping`,
    stop: async () => {
      ac.abort();
      await server.finished.catch(() => {});
    },
  };
}
