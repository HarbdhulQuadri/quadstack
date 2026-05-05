import { RPCHandler } from "@orpc/server/fetch";

import { appRouter } from "@quadstack/api";

const handler = new RPCHandler(appRouter);

async function handleRequest(req: Request) {
  const { response } = await handler.handle(req, {
    prefix: "/api/rpc",
    context: { headers: req.headers },
  });
  return response;
}

export const GET    = handleRequest;
export const POST   = handleRequest;
export const PUT    = handleRequest;
export const PATCH  = handleRequest;
export const DELETE = handleRequest;
