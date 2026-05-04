import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@quadstack/db/client";
import * as schema from "@quadstack/db/schema";

import { authEnv } from "../env";

const env = authEnv();

/**
 * Auth instance — Better Auth by default.
 *
 * ─── SWITCHING AUTH PROVIDERS ────────────────────────────────────────────────
 * This file is the only file you need to change to swap auth providers.
 * The rest of the system depends only on these four exports:
 *
 *   export const auth        — the auth instance / handler
 *   export const getSession  — (headers: Headers) => Promise<{ user, session } | null>
 *   export type  Session     — the session type
 *   export type  User        — the user type
 *
 * See docs/decisions/003-switching-auth.md for step-by-step guides for:
 *   → Clerk
 *   → NextAuth / Auth.js
 *   → Supabase Auth
 *   → Lucia Auth
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user:         schema.user,
      session:      schema.session,
      account:      schema.account,
      verification: schema.verification,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Set to true in production once you have email sending configured.
    // Requires RESEND_API_KEY and a verified domain.
    requireEmailVerification: false,
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId:     env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),

    ...(env.AUTH_FACEBOOK_ID && env.AUTH_FACEBOOK_SECRET
      ? {
          facebook: {
            clientId:     env.AUTH_FACEBOOK_ID,
            clientSecret: env.AUTH_FACEBOOK_SECRET,
          },
        }
      : {}),
  },

  secret:  env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_WEB_URL,

  trustedOrigins: [
    env.NEXT_PUBLIC_WEB_URL,
    ...(env.NEXT_PUBLIC_ADMIN_URL ? [env.NEXT_PUBLIC_ADMIN_URL] : []),
  ],
});

export type Session = typeof auth.$Infer.Session.session;
export type User    = typeof auth.$Infer.Session.user;

/** Get the current session from request headers — use in Server Components and API routes */
export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}
