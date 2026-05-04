import { z } from "zod";
import { eq } from "drizzle-orm";

import { user } from "@quadstack/db/schema";

import { priv, pub } from "../procedures";

export const authRouter = {
  me: priv
    .route({ method: "GET", path: "/auth/me" })
    .handler(({ context }) => {
      return { user: context.user, session: context.session };
    }),

  updateProfile: priv
    .input(z.object({ name: z.string().min(1) }))
    .route({ method: "PATCH", path: "/auth/me" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, context.user.id))
        .returning();
      return { user: updated };
    }),
};
