export { os } from "@orpc/server";
import { os, ORPCError } from "@orpc/server";

import { getSession } from "@quadstack/auth";
import { db } from "@quadstack/db/client";

const o = os.$context<{ headers: Headers }>();

// Public procedure — every call gets a typed `db` in context.
export const pub = o.use(
  o.middleware(async ({ context, next }) => {
    return next({ context: { ...context, db } });
  }),
);

// Private procedure — additionally validates the session.
// Throws UNAUTHORIZED (HTTP 401) if the user is not logged in.
export const priv = pub.use(
  o.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers);
    if (!session?.user) throw new ORPCError("UNAUTHORIZED");
    return next({
      context: {
        ...context,
        session: session.session,
        user:    session.user,
      },
    });
  }),
);
