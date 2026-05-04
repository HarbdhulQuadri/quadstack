import type { AppTemplate } from "./types";

export const saas: AppTemplate = {
  id:                   "saas",
  name:                 "SaaS",
  description:          "Multi-tenant app with organizations, members, and subscriptions",
  hint:                 "Teams, billing, role-based access",
  defaultPayments:      ["stripe"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope) => ({
    // ─── DB schema ───────────────────────────────────────────────────────────
    "packages/db/src/schema.ts": `
export * from "./auth-schema";

import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const planEnum     = pgEnum("plan",     ["free", "pro", "enterprise"]);
export const memberRole   = pgEnum("member_role", ["owner", "admin", "member"]);
export const subStatus    = pgEnum("sub_status", ["active", "trialing", "past_due", "canceled"]);

// ─── Tables ──────────────────────────────────────────────────────────────────
export const organization = pgTable("organization", {
  id:                uuid("id").primaryKey().defaultRandom(),
  name:              text("name").notNull(),
  slug:              text("slug").notNull().unique(),
  plan:              planEnum("plan").notNull().default("free"),
  stripeCustomerId:  text("stripe_customer_id").unique(),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const organizationMember = pgTable("organization_member", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId:         text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role:           memberRole("role").notNull().default("member"),
  joinedAt:       timestamp("joined_at").notNull().defaultNow(),
});

export const subscription = pgTable("subscription", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  organizationId:         uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  stripeSubscriptionId:   text("stripe_subscription_id").unique(),
  stripePriceId:          text("stripe_price_id"),
  status:                 subStatus("status").notNull().default("trialing"),
  currentPeriodEnd:       timestamp("current_period_end"),
  cancelAtPeriodEnd:      boolean("cancel_at_period_end").notNull().default(false),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
`.trimStart(),

    // ─── Validators ──────────────────────────────────────────────────────────
    "packages/validators/src/index.ts": `
import { z } from "zod";

export const signInSchema  = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema  = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
});

export const updateOrgSchema = createOrgSchema.partial();

export const inviteMemberSchema = z.object({
  organizationId: z.string().uuid(),
  email:          z.string().email(),
  role:           z.enum(["admin", "member"]).default("member"),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role:     z.enum(["admin", "member"]),
});
`.trimStart(),

    // ─── Organizations router ─────────────────────────────────────────────────
    "packages/api/src/orpc-routers/organizations.ts": `
import { ORPCError } from "@orpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { organization, organizationMember } from "@${scope}/db/schema";
import { createOrgSchema, updateOrgSchema, inviteMemberSchema, updateMemberRoleSchema } from "@${scope}/validators";

import { priv } from "../procedures";

export const organizationsRouter = {
  list: priv
    .route({ method: "GET", path: "/organizations/list" })
    .handler(async ({ context }) => {
      return context.db
        .select({ org: organization, role: organizationMember.role })
        .from(organizationMember)
        .innerJoin(organization, eq(organizationMember.organizationId, organization.id))
        .where(eq(organizationMember.userId, context.user.id));
    }),

  create: priv
    .input(createOrgSchema)
    .route({ method: "POST", path: "/organizations/create" })
    .handler(async ({ context, input }) => {
      const [org] = await context.db
        .insert(organization)
        .values(input)
        .returning();

      await context.db.insert(organizationMember).values({
        organizationId: org!.id,
        userId:         context.user.id,
        role:           "owner",
      });

      return org;
    }),

  update: priv
    .input(updateOrgSchema.extend({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/organizations/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      await assertOrgRole(context, id, ["owner", "admin"]);
      const [updated] = await context.db
        .update(organization)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(organization.id, id))
        .returning();
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/organizations/delete" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.id, ["owner"]);
      await context.db.delete(organization).where(eq(organization.id, input.id));
      return { success: true };
    }),

  inviteMember: priv
    .input(inviteMemberSchema)
    .route({ method: "POST", path: "/organizations/invite" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.organizationId, ["owner", "admin"]);
      // TODO: look up user by email, send invite email via Resend
      return { invited: true };
    }),

  updateMemberRole: priv
    .input(updateMemberRoleSchema.extend({ organizationId: z.string().uuid() }))
    .route({ method: "PATCH", path: "/organizations/member-role" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.organizationId, ["owner", "admin"]);
      const [updated] = await context.db
        .update(organizationMember)
        .set({ role: input.role })
        .where(eq(organizationMember.id, input.memberId))
        .returning();
      return updated;
    }),
};

async function assertOrgRole(
  context: { db: typeof import("@${scope}/db/client").db; user: { id: string } },
  orgId: string,
  allowed: string[],
) {
  const [member] = await context.db
    .select()
    .from(organizationMember)
    .where(and(eq(organizationMember.organizationId, orgId), eq(organizationMember.userId, context.user.id)))
    .limit(1);

  if (!member || !allowed.includes(member.role)) {
    throw new ORPCError("FORBIDDEN");
  }
}
`.trimStart(),

    // ─── Root router ─────────────────────────────────────────────────────────
    "packages/api/src/orpc-routers/index.ts": `
import { authRouter } from "./auth";
import { organizationsRouter } from "./organizations";

export const appRouter = {
  auth:          authRouter,
  organizations: organizationsRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart(),
  }),
};
