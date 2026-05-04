import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function authEnv() {
  return createEnv({
    server: {
      // ─── Better Auth ─────────────────────────────────────────────
      BETTER_AUTH_SECRET: z.string().min(1),
      BETTER_AUTH_URL: z.string().url().optional(),

      // ─── OAuth (add only what you enable) ────────────────────────
      GOOGLE_CLIENT_ID: z.string().optional(),
      GOOGLE_CLIENT_SECRET: z.string().optional(),
      AUTH_FACEBOOK_ID: z.string().optional(),
      AUTH_FACEBOOK_SECRET: z.string().optional(),

      // ─── Email ───────────────────────────────────────────────────
      RESEND_API_KEY: z.string().min(1),
      EMAIL_FROM: z.string().min(1),

      // ─── App URLs ────────────────────────────────────────────────
      NEXT_PUBLIC_WEB_URL: z.string().min(1),
      NEXT_PUBLIC_ADMIN_URL: z.string().optional(),
    },
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      AUTH_FACEBOOK_ID: process.env.AUTH_FACEBOOK_ID,
      AUTH_FACEBOOK_SECRET: process.env.AUTH_FACEBOOK_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
      NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    },
    skipValidation:
      !!process.env.CI || process.env.npm_lifecycle_event === "lint",
  });
}
