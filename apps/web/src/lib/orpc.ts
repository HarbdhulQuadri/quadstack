import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import type { AppRouter } from "@quadstack/api";

// Works in both Server Components and Client Components.
// Server components: uses the absolute URL via NEXT_PUBLIC_WEB_URL.
// Client components: uses window.location.origin.
// For server components, prefer lib/server-orpc.ts (direct in-process call, no HTTP overhead).
function getRpcUrl() {
  if (typeof window === "undefined") {
    return `${process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"}/api/rpc`;
  }
  return `${window.location.origin}/api/rpc`;
}

export const orpc = createORPCClient<RouterClient<AppRouter>>(
  new RPCLink({ url: getRpcUrl() }),
);
