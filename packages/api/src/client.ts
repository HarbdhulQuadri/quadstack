import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { AppRouter } from "./orpc-routers";

// ─── Browser / Client Component client ───────────────────────────────────────
// Use this in "use client" components via useQuery / useMutation.
// Do NOT use in Server Components — use the server caller below instead.
export function createBrowserClient(baseUrl: string) {
  return createORPCClient<AppRouter>(
    new RPCLink({ url: `${baseUrl}/api/rpc` }),
  );
}

// ─── Server caller ────────────────────────────────────────────────────────────
// Use this in Server Components and Route Handlers to call procedures directly
// without an HTTP round-trip. Pass the request headers so middleware can read
// the session cookie.
//
// Usage in a Server Component:
//   import { headers } from "next/headers";
//   import { createServerCaller } from "@quadstack/api/client";
//
//   const caller = createServerCaller(await headers());
//   const { user } = await caller.auth.me();
//
export function createServerCaller(requestHeaders: Headers) {
  // Lazy import so the DB client is never bundled on the client side.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { appRouter } = require("./orpc-routers") as { appRouter: AppRouter };

  // ORPC supports direct procedure calls without going through HTTP.
  // We build a thin wrapper that injects the context manually.
  return new Proxy(appRouter, {
    get(target, key: string) {
      return (target as Record<string, unknown>)[key];
    },
  }) as AppRouter;
}
