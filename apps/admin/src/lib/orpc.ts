import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import type { AppRouter } from "@quadstack/api";

function getRpcUrl() {
  if (typeof window === "undefined") {
    return `${process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3001"}/api/rpc`;
  }
  return `${window.location.origin}/api/rpc`;
}

export const orpc = createORPCClient<RouterClient<AppRouter>>(
  new RPCLink({ url: getRpcUrl() }),
);
