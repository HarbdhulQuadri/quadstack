import type { AppTemplate } from "./types";

export const events: AppTemplate = {
  id:                   "events",
  name:                 "Event Platform",
  description:          "Events, ticket tiers, attendees, payments, and check-in",
  hint:                 "Eventbrite style — sell tickets, manage attendees",
  defaultPayments:      ["stripe"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, config) => {
    const hasStripe   = config.payments.includes("stripe");
    const hasPaystack = config.payments.includes("paystack");
    const files: Record<string, string> = {};

    // ─── DB Schema ─────────────────────────────────────────────────────────────
    files["packages/db/src/schema.ts"] = `
export * from "./auth-schema";

import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const eventStatus  = pgEnum("event_status",  ["draft", "published", "cancelled", "completed"]);
export const ticketStatus = pgEnum("ticket_status", ["reserved", "paid", "cancelled", "used"]);

// ─── Staff / Organiser ────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("organiser"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Events ───────────────────────────────────────────────────────────────────
export const event = pgTable("event", {
  id:            uuid("id").primaryKey().defaultRandom(),
  organizerId:   text("organizer_id").notNull().references(() => user.id),
  title:         text("title").notNull(),
  slug:          text("slug").notNull().unique(),
  description:   text("description"),
  coverImage:    text("cover_image"),
  location:      text("location"),
  isOnline:      boolean("is_online").notNull().default(false),
  onlineUrl:     text("online_url"),
  startTime:     timestamp("start_time").notNull(),
  endTime:       timestamp("end_time").notNull(),
  timezone:      text("timezone").notNull().default("UTC"),
  status:        eventStatus("status").notNull().default("draft"),
  publishedAt:   timestamp("published_at"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Ticket Tiers ─────────────────────────────────────────────────────────────
export const ticketTier = pgTable("ticket_tier", {
  id:          uuid("id").primaryKey().defaultRandom(),
  eventId:     uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  description: text("description"),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  isFree:      boolean("is_free").notNull().default(false),
  capacity:    integer("capacity"),
  sold:        integer("sold").notNull().default(0),
  salesEnd:    timestamp("sales_end"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
export const ticket = pgTable("ticket", {
  id:               uuid("id").primaryKey().defaultRandom(),
  eventId:          uuid("event_id").notNull().references(() => event.id),
  tierId:           uuid("tier_id").notNull().references(() => ticketTier.id),
  attendeeId:       text("attendee_id").notNull().references(() => user.id),
  status:           ticketStatus("status").notNull().default("reserved"),
  checkInCode:      text("check_in_code").notNull().unique(),
  stripeSessionId:  text("stripe_session_id"),
  stripePaymentId:  text("stripe_payment_id"),
  paystackReference: text("paystack_reference"),
  checkedInAt:      timestamp("checked_in_at"),
  checkedInBy:      text("checked_in_by"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createEventSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  coverImage:  z.string().url().optional(),
  location:    z.string().optional(),
  isOnline:    z.boolean().default(false),
  onlineUrl:   z.string().url().optional(),
  startTime:   z.coerce.date(),
  endTime:     z.coerce.date(),
  timezone:    z.string().default("UTC"),
});

export const updateEventSchema = createEventSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft","published","cancelled","completed"]).optional(),
});

export const createTierSchema = z.object({
  eventId:     z.string().uuid(),
  name:        z.string().min(1).max(100),
  description: z.string().optional(),
  price:       z.string().regex(/^\d+\.\d{2}$/).default("0.00"),
  isFree:      z.boolean().default(false),
  capacity:    z.number().int().min(1).optional(),
  salesEnd:    z.coerce.date().optional(),
});

export const purchaseTicketSchema = z.object({
  tierId:   z.string().uuid(),
  quantity: z.number().int().min(1).max(10).default(1),
});

export const checkInSchema = z.object({
  code: z.string().min(1),
});

export const eventFiltersSchema = z.object({
  search:   z.string().optional(),
  upcoming: z.boolean().default(true),
  limit:    z.number().int().min(1).max(50).default(12),
  cursor:   z.string().optional(),
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

export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select().from(staffRole).where(eq(staffRole.userId, context.user.id)).limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Organiser access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Events Router ─────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/events.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

import { event, ticket, ticketTier } from "@${scope}/db/schema";
import { createEventSchema, createTierSchema, eventFiltersSchema, updateEventSchema } from "@${scope}/validators";
import { adminPriv, priv, pub } from "../procedures";
import { sql } from "drizzle-orm";

export const eventsRouter = {
  list: pub
    .input(eventFiltersSchema)
    .route({ method: "GET", path: "/events/list" })
    .handler(async ({ context, input }) => {
      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;
      const conditions = [eq(event.status, "published")];
      if (input.upcoming) conditions.push(gte(event.startTime, new Date()));

      const rows = await context.db
        .select()
        .from(event)
        .where(and(...conditions))
        .orderBy(event.startTime)
        .limit(input.limit + 1)
        .offset(offset);

      const hasMore    = rows.length > input.limit;
      const items      = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;
      return { items, hasMore, nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null };
    }),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/events/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(event)
        .where(eq(event.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const tiers = await context.db
        .select()
        .from(ticketTier)
        .where(eq(ticketTier.eventId, found.id));

      return { ...found, tiers };
    }),

  mine: priv
    .route({ method: "GET", path: "/events/mine" })
    .handler(({ context }) =>
      context.db
        .select()
        .from(event)
        .where(eq(event.organizerId, context.user.id))
        .orderBy(desc(event.createdAt)),
    ),

  create: priv
    .input(createEventSchema)
    .route({ method: "POST", path: "/events/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(event)
        .values({ ...input, organizerId: context.user.id })
        .returning();
      return created;
    }),

  update: priv
    .input(updateEventSchema)
    .route({ method: "PATCH", path: "/events/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [found] = await context.db.select().from(event).where(eq(event.id, id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.organizerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const publishedAt = data.status === "published" && !found.publishedAt ? new Date() : undefined;
      const [updated] = await context.db
        .update(event)
        .set({ ...data, ...(publishedAt ? { publishedAt } : {}), updatedAt: new Date() })
        .where(eq(event.id, id))
        .returning();
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/events/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(event).where(eq(event.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.organizerId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(event).where(eq(event.id, input.id));
      return { success: true };
    }),

  addTier: priv
    .input(createTierSchema)
    .route({ method: "POST", path: "/events/tiers/add" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(event).where(eq(event.id, input.eventId)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.organizerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const [created] = await context.db.insert(ticketTier).values(input).returning();
      return created;
    }),

  getAttendees: priv
    .input(z.object({ eventId: z.string().uuid() }))
    .route({ method: "GET", path: "/events/attendees" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(event).where(eq(event.id, input.eventId)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.organizerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      return context.db
        .select()
        .from(ticket)
        .where(and(eq(ticket.eventId, input.eventId), eq(ticket.status, "paid")));
    }),

  checkIn: priv
    .input(z.object({ code: z.string() }))
    .route({ method: "POST", path: "/events/check-in" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(ticket)
        .where(eq(ticket.checkInCode, input.code))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Invalid ticket code" });
      if (found.status !== "paid") throw new ORPCError("BAD_REQUEST", { message: "Ticket not paid" });
      if (found.checkedInAt) throw new ORPCError("CONFLICT", { message: "Already checked in" });

      const [ev] = await context.db.select().from(event).where(eq(event.id, found.eventId)).limit(1);
      if (ev?.organizerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(ticket)
        .set({ status: "used", checkedInAt: new Date(), checkedInBy: context.user.id })
        .where(eq(ticket.id, found.id))
        .returning();
      return updated;
    }),

  // ── Ticket purchase (free) ─────────────────────────────────────────────────
  claimFreeTicket: priv
    .input(z.object({ tierId: z.string().uuid() }))
    .route({ method: "POST", path: "/events/tickets/claim" })
    .handler(async ({ context, input }) => {
      const [tier] = await context.db
        .select()
        .from(ticketTier)
        .where(eq(ticketTier.id, input.tierId))
        .limit(1);
      if (!tier) throw new ORPCError("NOT_FOUND");
      if (!tier.isFree && parseFloat(tier.price) > 0) {
        throw new ORPCError("BAD_REQUEST", { message: "Use checkout for paid tickets" });
      }
      if (tier.capacity !== null && tier.sold >= tier.capacity) {
        throw new ORPCError("BAD_REQUEST", { message: "Sold out" });
      }

      const code = randomBytes(8).toString("hex").toUpperCase();
      const [created] = await context.db
        .insert(ticket)
        .values({ eventId: tier.eventId, tierId: tier.id, attendeeId: context.user.id, status: "paid", checkInCode: code })
        .returning();

      await context.db
        .update(ticketTier)
        .set({ sold: sql\`\${ticketTier.sold} + 1\` })
        .where(eq(ticketTier.id, tier.id));

      return created;
    }),

  myTickets: priv
    .route({ method: "GET", path: "/events/tickets/mine" })
    .handler(({ context }) =>
      context.db
        .select({ ticket, event, tier: ticketTier })
        .from(ticket)
        .innerJoin(event, eq(ticket.eventId, event.id))
        .innerJoin(ticketTier, eq(ticket.tierId, ticketTier.id))
        .where(eq(ticket.attendeeId, context.user.id))
        .orderBy(event.startTime),
    ),
};
`.trimStart();

    // ─── Payment / Checkout ────────────────────────────────────────────────────
    if (hasStripe) {
      files["packages/api/src/orpc-routers/checkout.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import { randomBytes } from "crypto";

import { event, ticket, ticketTier } from "@${scope}/db/schema";
import { priv } from "../procedures";
import { sql } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

export const checkoutRouter = {
  createSession: priv
    .input(z.object({ tierId: z.string().uuid(), quantity: z.number().int().min(1).max(10).default(1) }))
    .route({ method: "POST", path: "/checkout/ticket" })
    .handler(async ({ context, input }) => {
      const [tier] = await context.db
        .select()
        .from(ticketTier)
        .where(eq(ticketTier.id, input.tierId))
        .limit(1);
      if (!tier) throw new ORPCError("NOT_FOUND");
      if (tier.isFree || parseFloat(tier.price) === 0) {
        throw new ORPCError("BAD_REQUEST", { message: "Use claim endpoint for free tickets" });
      }
      if (tier.capacity !== null && tier.sold + input.quantity > tier.capacity) {
        throw new ORPCError("BAD_REQUEST", { message: "Not enough tickets available" });
      }

      const [ev] = await context.db.select().from(event).where(eq(event.id, tier.eventId)).limit(1);
      if (!ev) throw new ORPCError("NOT_FOUND");

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: input.quantity,
          price_data: {
            currency:     "usd",
            unit_amount:  Math.round(parseFloat(tier.price) * 100),
            product_data: { name: \`\${ev.title} — \${tier.name}\`, images: ev.coverImage ? [ev.coverImage] : [] },
          },
        }],
        success_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/dashboard/tickets?success=1\`,
        cancel_url:  \`\${process.env.NEXT_PUBLIC_WEB_URL}/events/\${ev.slug}\`,
        metadata:    { tierId: tier.id, eventId: ev.id, attendeeId: context.user.id, quantity: String(input.quantity) },
      });

      return { url: session.url };
    }),
};
`.trimStart();

      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { randomBytes } from "crypto";

import { db } from "@${scope}/db/client";
import { ticket, ticketTier } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session  = event.data.object as Stripe.Checkout.Session;
    const tierId   = session.metadata?.tierId;
    const eventId  = session.metadata?.eventId;
    const userId   = session.metadata?.attendeeId;
    const quantity = parseInt(session.metadata?.quantity ?? "1");

    if (!tierId || !eventId || !userId) return NextResponse.json({ received: true });

    // Create one ticket per quantity
    const tickets = Array.from({ length: quantity }, () => ({
      eventId,
      tierId,
      attendeeId:     userId,
      status:         "paid" as const,
      checkInCode:    randomBytes(8).toString("hex").toUpperCase(),
      stripeSessionId: session.id,
      stripePaymentId: session.payment_intent as string,
    }));

    await db.insert(ticket).values(tickets);
    await db
      .update(ticketTier)
      .set({ sold: sql\`\${ticketTier.sold} + \${quantity}\` })
      .where(eq(ticketTier.id, tierId));
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    if (hasPaystack) {
      files["packages/api/src/orpc-routers/payments/paystack.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { event, ticketTier } from "@${scope}/db/schema";
import { priv } from "../../procedures";

export const paystackRouter = {
  initiate: priv
    .input(z.object({ tierId: z.string().uuid(), quantity: z.number().int().min(1).max(10).default(1) }))
    .route({ method: "POST", path: "/payments/paystack/ticket" })
    .handler(async ({ context, input }) => {
      const [tier] = await context.db
        .select()
        .from(ticketTier)
        .where(eq(ticketTier.id, input.tierId))
        .limit(1);
      if (!tier) throw new ORPCError("NOT_FOUND");
      if (tier.capacity !== null && tier.sold + input.quantity > tier.capacity) {
        throw new ORPCError("BAD_REQUEST", { message: "Not enough tickets" });
      }

      const [ev] = await context.db.select().from(event).where(eq(event.id, tier.eventId)).limit(1);
      const amountKobo = Math.round(parseFloat(tier.price) * 100 * input.quantity);
      const reference  = \`ev_\${tier.eventId}_\${Date.now()}\`;

      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method:  "POST",
        headers: { Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email:       context.user.email,
          amount:      amountKobo,
          reference,
          metadata:    { tierId: tier.id, eventId: tier.eventId, attendeeId: context.user.id, quantity: input.quantity },
          callback_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/dashboard/tickets?success=1\`,
        }),
      });
      const json = await res.json() as { status: boolean; data: { authorization_url: string } };
      if (!json.status) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { url: json.data.authorization_url, reference };
    }),
};
`.trimStart();

      files["apps/web/src/app/api/paystack/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { randomBytes } from "crypto";

import { db } from "@${scope}/db/client";
import { ticket, ticketTier } from "@${scope}/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const hash = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");
  if (hash !== req.headers.get("x-paystack-signature")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const ev = JSON.parse(body) as { event: string; data: { reference: string; metadata: Record<string, unknown> } };

  if (ev.event === "charge.success") {
    const { tierId, eventId, attendeeId, quantity = 1 } = ev.data.metadata as Record<string, string>;
    if (!tierId || !eventId || !attendeeId) return NextResponse.json({ received: true });

    const qty = parseInt(String(quantity));
    const tickets = Array.from({ length: qty }, () => ({
      eventId,
      tierId,
      attendeeId,
      status:           "paid" as const,
      checkInCode:      randomBytes(8).toString("hex").toUpperCase(),
      paystackReference: ev.data.reference,
    }));

    await db.insert(ticket).values(tickets);
    await db.update(ticketTier).set({ sold: sql\`\${ticketTier.sold} + \${qty}\` }).where(eq(ticketTier.id, tierId));
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Root Router ──────────────────────────────────────────────────────────
    const checkoutImport   = hasStripe   ? `import { checkoutRouter }  from "./checkout";\n` : "";
    const paystackImport   = hasPaystack ? `import { paystackRouter }  from "./payments/paystack";\n` : "";
    const checkoutEntry    = hasStripe   ? `  checkout:  checkoutRouter,\n` : "";
    const paystackEntry    = hasPaystack ? `  paystack:  paystackRouter,\n` : "";

    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }   from "./auth";
import { eventsRouter } from "./events";
${checkoutImport}${paystackImport}
export const appRouter = {
  auth:   authRouter,
  events: eventsRouter,
${checkoutEntry}${paystackEntry}};

export type AppRouter = typeof appRouter;
`.trimStart();

    // ─── Server-side caller ────────────────────────────────────────────────────
    files["apps/web/src/lib/server-orpc.ts"] = `
import "server-only";
import { headers } from "next/headers";
import { createRouterClient } from "@orpc/server";
import { unstable_cache } from "next/cache";

import { appRouter } from "@${scope}/api/orpc-routers";
import { db } from "@${scope}/db/client";

export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, { context: { headers: h, db } });
}

const publicCaller = createRouterClient(appRouter, { context: { headers: new Headers(), db } });

export const getCachedEvents = unstable_cache(
  () => publicCaller.events.list({ upcoming: true }),
  ["events-upcoming"],
  { revalidate: 120, tags: ["events"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedEvents } from "@/lib/server-orpc";

export default async function HomePage() {
  const { items } = await getCachedEvents();

  return (
    <main className="mx-auto max-w-5xl space-y-12 p-6">
      <section className="py-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Discover Events.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Find and attend events near you or online.</p>
        <Link href="/events" className="mt-6 inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
          Browse All Events
        </Link>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">Upcoming Events</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ev) => (
            <Link key={ev.id} href={\`/events/\${ev.slug}\`} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
              {ev.coverImage && <img src={ev.coverImage} alt={ev.title} className="h-40 w-full object-cover" />}
              <div className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">
                  {new Date(ev.startTime).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" })}
                </p>
                <h3 className="font-semibold group-hover:text-primary">{ev.title}</h3>
                <p className="text-sm text-muted-foreground">{ev.isOnline ? "Online" : ev.location}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/events/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { TicketPurchase } from "./_components/ticket-purchase";

interface Props { params: Promise<{ slug: string }> }

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let ev: Awaited<ReturnType<typeof caller.events.get>>;
  try {
    ev = await caller.events.get({ slug });
  } catch {
    notFound();
  }

  const fmt = (d: Date) => new Date(d).toLocaleString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-5xl gap-8 p-6 lg:grid lg:grid-cols-3">
      <article className="lg:col-span-2 space-y-6">
        {ev.coverImage && <img src={ev.coverImage} alt={ev.title} className="w-full rounded-lg object-cover h-64" />}
        <h1 className="text-3xl font-bold">{ev.title}</h1>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>📅 {fmt(ev.startTime)} → {fmt(ev.endTime)}</p>
          <p>{ev.isOnline ? "🌐 Online event" : \`📍 \${ev.location}\`}</p>
        </div>
        {ev.description && (
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: ev.description }} />
        )}
      </article>

      <aside>
        <div className="sticky top-4 rounded-lg border p-6 space-y-4">
          <h2 className="font-semibold">Tickets</h2>
          {ev.tiers.map((tier) => (
            <TicketPurchase key={tier.id} tier={tier} />
          ))}
        </div>
      </aside>
    </div>
  );
}
`.trimStart();

    const purchaseAction = hasStripe
      ? `const { url } = await orpc.checkout.createSession({ tierId: tier.id, quantity: qty });
      if (url) window.location.href = url;`
      : hasPaystack
      ? `const { url } = await orpc.paystack.initiate({ tierId: tier.id, quantity: qty });
      if (url) window.location.href = url;`
      : `await orpc.events.claimFreeTicket({ tierId: tier.id });
      router.push("/dashboard/tickets");`;

    files["apps/web/src/app/events/[slug]/_components/ticket-purchase.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Tier { id: string; name: string; description: string | null; price: string; isFree: boolean; capacity: number | null; sold: number }
interface Props { tier: Tier }

export function TicketPurchase({ tier }: Props) {
  const router = useRouter();
  const [qty, setQty]         = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const remaining = tier.capacity !== null ? tier.capacity - tier.sold : null;
  const soldOut   = remaining !== null && remaining <= 0;

  async function purchase() {
    setLoading(true);
    setError("");
    try {
      ${purchaseAction}
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{tier.name}</p>
          {tier.description && <p className="text-xs text-muted-foreground">{tier.description}</p>}
        </div>
        <p className="font-bold">{tier.isFree ? "Free" : \`$\${tier.price}\`}</p>
      </div>
      {remaining !== null && (
        <p className="text-xs text-muted-foreground">{remaining} remaining</p>
      )}
      {!soldOut && !tier.isFree && (
        <div className="flex items-center gap-2">
          <label className="text-sm">Qty</label>
          <input
            type="number"
            min={1}
            max={Math.min(10, remaining ?? 10)}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="w-16 rounded border px-2 py-1 text-sm"
          />
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        onClick={purchase}
        disabled={loading || soldOut}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {soldOut ? "Sold Out" : loading ? "Processing…" : tier.isFree ? "Get Free Ticket" : \`Buy \${qty > 1 ? qty + "×" : ""} Ticket\`}
      </button>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/tickets/page.tsx"] = `
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

const STATUS_COLORS: Record<string, string> = {
  paid:     "bg-green-100 text-green-800",
  used:     "bg-gray-100 text-gray-800",
  reserved: "bg-yellow-100 text-yellow-800",
  cancelled:"bg-red-100 text-red-800",
};

export default async function MyTicketsPage() {
  const caller = await getServerCaller();
  let tickets: Awaited<ReturnType<typeof caller.events.myTickets>>;
  try {
    tickets = await caller.events.myTickets();
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Tickets</h1>
      {tickets.length === 0 ? (
        <p className="text-muted-foreground">No tickets yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tickets.map(({ ticket: t, event: ev, tier }) => (
            <li key={t.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{ev.title}</p>
                  <p className="text-sm text-muted-foreground">{tier.name} · {new Date(ev.startTime).toLocaleDateString()}</p>
                  <p className="text-sm text-muted-foreground">{ev.isOnline ? "Online" : ev.location}</p>
                </div>
                <span className={\`rounded-full px-2 py-1 text-xs capitalize \${STATUS_COLORS[t.status] ?? ""}\`}>
                  {t.status}
                </span>
              </div>
              {t.status === "paid" && (
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Check-in code</p>
                  <p className="font-mono font-bold tracking-widest">{t.checkInCode}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
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
  return createRouterClient(appRouter, { context: { headers: h, db } });
}
`.trimStart();

    files["apps/admin/src/app/(protected)/events/page.tsx"] = `
import { getServerCaller } from "@/lib/server-orpc";

export default async function AdminEventsPage() {
  const caller = await getServerCaller();
  const { items } = await caller.events.list({ upcoming: false });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">All Events</h1>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((ev) => (
              <tr key={ev.id} className="hover:bg-muted/25">
                <td className="px-4 py-3 font-medium">{ev.title}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(ev.startTime).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{ev.isOnline ? "Online" : ev.location}</td>
                <td className="px-4 py-3 capitalize">{ev.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`.trimStart();

    return files;
  },
};
