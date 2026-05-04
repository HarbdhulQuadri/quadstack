"use client";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReact } from "@orpc/react";

import type { AppRouter } from "@quadstack/api";

const client = createORPCClient<AppRouter>(
  new RPCLink({ url: "/api/rpc" }),
);

export const orpc = createORPCReact<AppRouter>({ client });
