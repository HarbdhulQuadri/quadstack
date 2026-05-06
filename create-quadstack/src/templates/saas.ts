import type { AppTemplate } from "./types";

export const saas: AppTemplate = {
  id:                   "saas",
  name:                 "SaaS",
  description:          "Multi-tenant app with organizations, members, and subscriptions",
  hint:                 "Teams, billing, role-based access",
  defaultPayments:      ["stripe"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, config) => {
    const hasStripe = config.payments.includes("stripe");
    const files: Record<string, string> = {};

    // ─── DB Schema ─────────────────────────────────────────────────────────────
    files["packages/db/src/schema.ts"] = `
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

// ─── Enums ────────────────────────────────────────────────────────────────────
export const planEnum   = pgEnum("plan",        ["free", "pro", "enterprise"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const subStatus  = pgEnum("sub_status",  ["active", "trialing", "past_due", "canceled"]);
export const inviteStatus = pgEnum("invite_status", ["pending", "accepted", "expired"]);

// ─── Staff / Super-admin ──────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Organizations ────────────────────────────────────────────────────────────
export const organization = pgTable("organization", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             text("name").notNull(),
  slug:             text("slug").notNull().unique(),
  plan:             planEnum("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const organizationMember = pgTable("organization_member", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId:         text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role:           memberRole("role").notNull().default("member"),
  joinedAt:       timestamp("joined_at").notNull().defaultNow(),
});

export const invite = pgTable("invite", {
  id:             uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  email:          text("email").notNull(),
  role:           memberRole("role").notNull().default("member"),
  token:          text("token").notNull().unique(),
  status:         inviteStatus("status").notNull().default("pending"),
  expiresAt:      timestamp("expires_at").notNull(),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export const subscription = pgTable("subscription", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  organizationId:       uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId:        text("stripe_price_id"),
  status:               subStatus("status").notNull().default("trialing"),
  currentPeriodEnd:     timestamp("current_period_end"),
  cancelAtPeriodEnd:    boolean("cancel_at_period_end").notNull().default(false),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
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

export const acceptInviteSchema = z.object({ token: z.string().min(1) });

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role:     z.enum(["admin", "member"]),
});

export const removeMemberSchema = z.object({
  organizationId: z.string().uuid(),
  memberId:       z.string().uuid(),
});
`.trimStart();

    // ─── Procedures ────────────────────────────────────────────────────────────
    files["packages/api/src/procedures.ts"] = `
export { os } from "@orpc/server";
import { os, ORPCError } from "@orpc/server";

import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { staffRole } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

const o = os.$context<{ headers: Headers }>();

export const pub = o.use(
  o.middleware(async ({ context, next }) => next({ context: { ...context, db } })),
);

export const priv = pub.use(
  o.middleware(async ({ context, next }) => {
    const session = await getSession(context.headers);
    if (!session?.user) throw new ORPCError("UNAUTHORIZED");
    return next({ context: { ...context, session: session.session, user: session.user } });
  }),
);

// Platform super-admin — grants access to cross-org management.
// Grant: INSERT INTO staff_role (user_id) VALUES ('<user-id>');
export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select().from(staffRole).where(eq(staffRole.userId, context.user.id)).limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Organizations Router ──────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/organizations.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

import { invite, organization, organizationMember } from "@${scope}/db/schema";
import {
  acceptInviteSchema,
  createOrgSchema,
  inviteMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  updateOrgSchema,
} from "@${scope}/validators";
import { priv } from "../procedures";

export const organizationsRouter = {
  list: priv
    .route({ method: "GET", path: "/organizations/list" })
    .handler(({ context }) =>
      context.db
        .select({ org: organization, role: organizationMember.role })
        .from(organizationMember)
        .innerJoin(organization, eq(organizationMember.organizationId, organization.id))
        .where(eq(organizationMember.userId, context.user.id)),
    ),

  get: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/organizations/get" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.id, ["owner", "admin", "member"]);
      const [org] = await context.db
        .select()
        .from(organization)
        .where(eq(organization.id, input.id))
        .limit(1);
      if (!org) throw new ORPCError("NOT_FOUND");
      const members = await context.db
        .select()
        .from(organizationMember)
        .where(eq(organizationMember.organizationId, input.id));
      return { ...org, members };
    }),

  create: priv
    .input(createOrgSchema)
    .route({ method: "POST", path: "/organizations/create" })
    .handler(async ({ context, input }) => {
      const [org] = await context.db.insert(organization).values(input).returning();
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

  invite: priv
    .input(inviteMemberSchema)
    .route({ method: "POST", path: "/organizations/invite" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.organizationId, ["owner", "admin"]);
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const [created] = await context.db
        .insert(invite)
        .values({ organizationId: input.organizationId, email: input.email, role: input.role, token, expiresAt })
        .returning();
      // TODO: send invite email via Resend — token is the join link param
      return { inviteId: created!.id, token };
    }),

  acceptInvite: priv
    .input(acceptInviteSchema)
    .route({ method: "POST", path: "/organizations/invite/accept" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(invite)
        .where(and(eq(invite.token, input.token), eq(invite.status, "pending")))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Invalid or expired invite" });
      if (found.expiresAt < new Date()) {
        await context.db.update(invite).set({ status: "expired" }).where(eq(invite.id, found.id));
        throw new ORPCError("BAD_REQUEST", { message: "Invite has expired" });
      }
      await context.db.insert(organizationMember).values({
        organizationId: found.organizationId,
        userId:         context.user.id,
        role:           found.role,
      });
      await context.db.update(invite).set({ status: "accepted" }).where(eq(invite.id, found.id));
      return { organizationId: found.organizationId };
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
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  removeMember: priv
    .input(removeMemberSchema)
    .route({ method: "DELETE", path: "/organizations/member" })
    .handler(async ({ context, input }) => {
      await assertOrgRole(context, input.organizationId, ["owner", "admin"]);
      await context.db
        .delete(organizationMember)
        .where(eq(organizationMember.id, input.memberId));
      return { success: true };
    }),

  leave: priv
    .input(z.object({ organizationId: z.string().uuid() }))
    .route({ method: "POST", path: "/organizations/leave" })
    .handler(async ({ context, input }) => {
      const [member] = await context.db
        .select()
        .from(organizationMember)
        .where(and(
          eq(organizationMember.organizationId, input.organizationId),
          eq(organizationMember.userId, context.user.id),
        ))
        .limit(1);
      if (!member) throw new ORPCError("NOT_FOUND");
      if (member.role === "owner") throw new ORPCError("BAD_REQUEST", { message: "Owner cannot leave — transfer ownership first" });
      await context.db.delete(organizationMember).where(eq(organizationMember.id, member.id));
      return { success: true };
    }),
};

async function assertOrgRole(
  context: { db: ReturnType<typeof import("@${scope}/db/client").createDb>; user: { id: string } },
  orgId: string,
  allowed: string[],
) {
  const [member] = await context.db
    .select()
    .from(organizationMember)
    .where(and(eq(organizationMember.organizationId, orgId), eq(organizationMember.userId, context.user.id)))
    .limit(1);
  if (!member || !allowed.includes(member.role)) throw new ORPCError("FORBIDDEN");
}
`.trimStart();

    // ─── Billing Router ────────────────────────────────────────────────────────
    if (hasStripe) {
      files["packages/api/src/orpc-routers/billing.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

import { organization, organizationMember, subscription } from "@${scope}/db/schema";
import { and } from "drizzle-orm";
import { priv } from "../procedures";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

export const billingRouter = {
  getSubscription: priv
    .input(z.object({ organizationId: z.string().uuid() }))
    .route({ method: "GET", path: "/billing/subscription" })
    .handler(async ({ context, input }) => {
      const [member] = await context.db
        .select()
        .from(organizationMember)
        .where(and(eq(organizationMember.organizationId, input.organizationId), eq(organizationMember.userId, context.user.id)))
        .limit(1);
      if (!member) throw new ORPCError("FORBIDDEN");

      const [sub] = await context.db
        .select()
        .from(subscription)
        .where(eq(subscription.organizationId, input.organizationId))
        .limit(1);
      return sub ?? null;
    }),

  createCheckout: priv
    .input(z.object({ organizationId: z.string().uuid(), priceId: z.string() }))
    .route({ method: "POST", path: "/billing/checkout" })
    .handler(async ({ context, input }) => {
      const [member] = await context.db
        .select()
        .from(organizationMember)
        .where(and(eq(organizationMember.organizationId, input.organizationId), eq(organizationMember.userId, context.user.id)))
        .limit(1);
      if (!member || !["owner", "admin"].includes(member.role)) throw new ORPCError("FORBIDDEN");

      const [org] = await context.db
        .select()
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);
      if (!org) throw new ORPCError("NOT_FOUND");

      let customerId = org.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({ name: org.name, metadata: { orgId: org.id } });
        customerId = customer.id;
        await context.db.update(organization).set({ stripeCustomerId: customerId }).where(eq(organization.id, org.id));
      }

      const session = await stripe.checkout.sessions.create({
        customer:   customerId,
        mode:       "subscription",
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/dashboard/\${input.organizationId}/billing?success=1\`,
        cancel_url:  \`\${process.env.NEXT_PUBLIC_WEB_URL}/dashboard/\${input.organizationId}/billing\`,
        metadata:   { organizationId: input.organizationId },
      });
      return { url: session.url };
    }),

  createPortal: priv
    .input(z.object({ organizationId: z.string().uuid() }))
    .route({ method: "POST", path: "/billing/portal" })
    .handler(async ({ context, input }) => {
      const [member] = await context.db
        .select()
        .from(organizationMember)
        .where(and(eq(organizationMember.organizationId, input.organizationId), eq(organizationMember.userId, context.user.id)))
        .limit(1);
      if (!member || !["owner", "admin"].includes(member.role)) throw new ORPCError("FORBIDDEN");

      const [org] = await context.db
        .select()
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);
      if (!org?.stripeCustomerId) throw new ORPCError("BAD_REQUEST", { message: "No billing account found" });

      const portal = await stripe.billingPortal.sessions.create({
        customer:   org.stripeCustomerId,
        return_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/dashboard/\${input.organizationId}/billing\`,
      });
      return { url: portal.url };
    }),
};
`.trimStart();
    }

    // ─── Admin Router ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/admin.ts"] = `
import { desc } from "drizzle-orm";

import { organization, organizationMember, subscription } from "@${scope}/db/schema";
import { adminPriv } from "../procedures";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const adminRouter = {
  listOrganizations: adminPriv
    .route({ method: "GET", path: "/admin/organizations" })
    .handler(({ context }) =>
      context.db.select().from(organization).orderBy(desc(organization.createdAt)),
    ),

  getOrganization: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/admin/organizations/get" })
    .handler(async ({ context, input }) => {
      const [org] = await context.db.select().from(organization).where(eq(organization.id, input.id)).limit(1);
      const members = await context.db
        .select()
        .from(organizationMember)
        .where(eq(organizationMember.organizationId, input.id));
      const [sub] = await context.db
        .select()
        .from(subscription)
        .where(eq(subscription.organizationId, input.id))
        .limit(1);
      return { org, members, subscription: sub ?? null };
    }),
};
`.trimStart();

    // ─── Root Router ──────────────────────────────────────────────────────────
    const billingImport = hasStripe ? `import { billingRouter }       from "./billing";\n` : "";
    const billingEntry  = hasStripe ? `  billing:       billingRouter,\n` : "";

    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }          from "./auth";
import { organizationsRouter } from "./organizations";
${billingImport}import { adminRouter }         from "./admin";

export const appRouter = {
  auth:          authRouter,
  organizations: organizationsRouter,
${billingEntry}  admin:         adminRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart();

    // ─── Stripe Subscription Webhook ──────────────────────────────────────────
    if (hasStripe) {
      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@${scope}/db/client";
import { organization, subscription } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

const planByPriceId: Record<string, "pro" | "enterprise"> = {
  // TODO: set your Stripe price IDs here
  [process.env.STRIPE_PRO_PRICE_ID ?? ""]:        "pro",
  [process.env.STRIPE_ENTERPRISE_PRICE_ID ?? ""]: "enterprise",
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const orgId = session.metadata?.organizationId;
      if (!orgId) break;

      const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!stripeSubId) break;
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
      const priceId   = stripeSub.items.data[0]?.price.id ?? null;

      await db
        .insert(subscription)
        .values({
          organizationId:       orgId,
          stripeSubscriptionId: stripeSubId,
          stripePriceId:        priceId,
          status:               "active",
          currentPeriodEnd:     new Date(stripeSub.current_period_end * 1000),
          cancelAtPeriodEnd:    stripeSub.cancel_at_period_end,
        })
        .onConflictDoUpdate({
          target: subscription.stripeSubscriptionId,
          set:    { status: "active", currentPeriodEnd: new Date(stripeSub.current_period_end * 1000), updatedAt: new Date() },
        });

      const plan = planByPriceId[priceId ?? ""] ?? "pro";
      await db.update(organization).set({ plan }).where(eq(organization.id, orgId));
      break;
    }

    case "customer.subscription.updated": {
      const sub     = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? null;
      await db
        .update(subscription)
        .set({
          status:            sub.status as "active" | "trialing" | "past_due" | "canceled",
          stripePriceId:     priceId,
          currentPeriodEnd:  new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt:         new Date(),
        })
        .where(eq(subscription.stripeSubscriptionId, sub.id));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId   = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (!subId) break;
      await db
        .update(subscription)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(subscription.stripeSubscriptionId, subId));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscription)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(subscription.stripeSubscriptionId, sub.id));

      // downgrade org to free
      const [existing] = await db
        .select()
        .from(subscription)
        .where(eq(subscription.stripeSubscriptionId, sub.id))
        .limit(1);
      if (existing) {
        await db.update(organization).set({ plan: "free" }).where(eq(organization.id, existing.organizationId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Server-side direct caller ─────────────────────────────────────────────
    files["apps/web/src/lib/server-orpc.ts"] = `
import "server-only";
import { headers } from "next/headers";
import { createRouterClient } from "@orpc/server";
import { appRouter } from "@${scope}/api/orpc-routers";
import { db } from "@${scope}/db/client";

export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, {
    context: { headers: h, db },
  });
}
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-5xl font-bold tracking-tight">Welcome to ${scope}</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        Collaborate in teams, manage your organization, and scale with confidence.
      </p>
      <div className="flex gap-3">
        <Link href="/auth/sign-in" className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Sign In
        </Link>
        <Link href="/auth/sign-up" className="rounded-md border px-5 py-2 text-sm font-medium hover:bg-accent">
          Get Started Free
        </Link>
      </div>
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

export default async function DashboardPage() {
  const caller = await getServerCaller();
  let orgs: { org: { id: string; name: string; slug: string; plan: string }; role: string }[];
  try {
    orgs = await caller.organizations.list();
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Organizations</h1>
        <Link href="/dashboard/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          New Organization
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No organizations yet.</p>
          <Link href="/dashboard/new" className="mt-4 inline-block text-sm text-primary underline">
            Create your first organization
          </Link>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {orgs.map(({ org, role }) => (
            <li key={org.id}>
              <Link href={\`/dashboard/\${org.id}\`} className="flex items-center justify-between p-4 hover:bg-accent">
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="text-sm text-muted-foreground">{org.slug} · {org.plan}</p>
                </div>
                <span className="text-xs capitalize text-muted-foreground">{role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/new/page.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

export default function NewOrgPage() {
  const router   = useRouter();
  const [name, setName]   = useState("");
  const [slug, setSlug]   = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const org = await orpc.organizations.create({ name, slug });
      router.push(\`/dashboard/\${org!.id}\`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-bold">Create Organization</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
            }}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Slug</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9-]+"
            required
          />
          <p className="text-xs text-muted-foreground">Used in URLs. Lowercase letters, numbers, hyphens.</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
          Create Organization
        </button>
      </form>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/[orgId]/page.tsx"] = `
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

interface Props { params: Promise<{ orgId: string }> }

export default async function OrgDashboardPage({ params }: Props) {
  const { orgId } = await params;
  const caller = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.organizations.get>>;
  try {
    data = await caller.organizations.get({ id: orgId });
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">Plan: <span className="font-medium capitalize">{data.plan}</span></p>
        </div>
        <div className="flex gap-2">
          <Link href={\`/dashboard/\${orgId}/members\`} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Members</Link>
          <Link href={\`/dashboard/\${orgId}/billing\`} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Billing</Link>
          <Link href={\`/dashboard/\${orgId}/settings\`} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Settings</Link>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Members ({data.members.length})</h2>
        <ul className="divide-y rounded-lg border">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between p-4">
              <span className="text-sm">{m.userId}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/[orgId]/members/page.tsx"] = `
"use client";
import { use, useEffect, useState } from "react";
import { orpc } from "@/lib/orpc";

interface Props { params: Promise<{ orgId: string }> }

export default function MembersPage({ params }: Props) {
  const { orgId } = use(params);
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState<"admin" | "member">("member");
  const [msg, setMsg]     = useState("");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await orpc.organizations.invite({ organizationId: orgId, email, role });
      setMsg("Invite sent!");
      setEmail("");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Members</h1>
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="font-semibold">Invite member</h2>
        <form onSubmit={invite} className="flex gap-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "member")}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Send Invite
          </button>
        </form>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </section>
    </div>
  );
}
`.trimStart();

    if (hasStripe) {
      files["apps/web/src/app/dashboard/[orgId]/billing/page.tsx"] = `
"use client";
import { use, useState } from "react";
import { orpc } from "@/lib/orpc";

const PLANS = [
  { id: "pro",        label: "Pro",        priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",        price: "$29/mo" },
  { id: "enterprise", label: "Enterprise", priceId: process.env.NEXT_PUBLIC_STRIPE_ENT_PRICE_ID ?? "",        price: "$99/mo" },
];

interface Props { params: Promise<{ orgId: string }> }

export default function BillingPage({ params }: Props) {
  const { orgId } = use(params);
  const [loading, setLoading] = useState(false);

  async function startCheckout(priceId: string) {
    setLoading(true);
    try {
      const { url } = await orpc.billing.createCheckout({ organizationId: orgId, priceId });
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const { url } = await orpc.billing.createPortal({ organizationId: orgId });
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Billing</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="rounded-lg border p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{plan.label}</h2>
              <p className="text-2xl font-bold mt-1">{plan.price}</p>
            </div>
            <button
              disabled={loading}
              onClick={() => startCheckout(plan.priceId)}
              className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Upgrade to {plan.label}
            </button>
          </div>
        ))}
      </div>
      <button onClick={openPortal} disabled={loading} className="text-sm text-primary underline">
        Manage existing subscription →
      </button>
    </div>
  );
}
`.trimStart();
    }

    files["apps/web/src/app/dashboard/[orgId]/settings/page.tsx"] = `
"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { params: Promise<{ orgId: string }> }

export default function OrgSettingsPage({ params }: Props) {
  const { orgId }  = use(params);
  const router     = useRouter();
  const [name, setName]   = useState("");
  const [error, setError] = useState("");

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await orpc.organizations.update({ id: orgId, name });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this organization? This cannot be undone.")) return;
    try {
      await orpc.organizations.delete({ id: orgId });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 p-6">
      <h1 className="text-2xl font-bold">Organization Settings</h1>

      <form onSubmit={handleUpdate} className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Display Name</label>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
          />
        </div>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Save Changes
        </button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border border-destructive/40 p-6 space-y-3">
        <h2 className="font-semibold text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">Permanently delete this organization and all data.</p>
        <button onClick={handleDelete} className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
          Delete Organization
        </button>
      </div>
    </div>
  );
}
`.trimStart();

    // ─── Invite Accept Page ────────────────────────────────────────────────────
    files["apps/web/src/app/invite/[token]/page.tsx"] = `
"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { params: Promise<{ token: string }> }

export default function AcceptInvitePage({ params }: Props) {
  const { token } = use(params);
  const router    = useRouter();
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    try {
      const { organizationId } = await orpc.organizations.acceptInvite({ token });
      router.push(\`/dashboard/\${organizationId}\`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">You've been invited!</h1>
      <p className="text-muted-foreground">Click below to join the organization.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button onClick={accept} disabled={loading} className="rounded-md bg-primary px-6 py-2 font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Joining…" : "Accept Invite"}
      </button>
    </div>
  );
}
`.trimStart();

    // ─── Admin Pages ───────────────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/organizations/page.tsx"] = `
import { getServerCaller } from "@/lib/server-orpc";

export default async function AdminOrgsPage() {
  const caller = await getServerCaller();
  const orgs   = await caller.admin.listOrganizations();

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Organizations</h1>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-left font-medium">Plan</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-muted/25">
                <td className="px-4 py-3 font-medium">{org.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{org.slug}</td>
                <td className="px-4 py-3 capitalize">{org.plan}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(org.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`.trimStart();

    files["apps/admin/src/lib/server-orpc.ts"] = `
import "server-only";
import { headers } from "next/headers";
import { createRouterClient } from "@orpc/server";
import { appRouter } from "@${scope}/api/orpc-routers";
import { db } from "@${scope}/db/client";

export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, {
    context: { headers: h, db },
  });
}
`.trimStart();

    return files;
  },
};
