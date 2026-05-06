import type { AppTemplate } from "./types";

export const marketplace: AppTemplate = {
  id:                   "marketplace",
  name:                 "Marketplace",
  description:          "Multi-vendor listings, bookings, reviews, and seller payouts",
  hint:                 "Airbnb / Fiverr style, buyer + seller flows",
  defaultPayments:      ["stripe"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, config) => {
    const hasStripe   = config.payments.includes("stripe");
    const hasPaystack = config.payments.includes("paystack");
    const files: Record<string, string> = {};

    // ─── DB Schema ─────────────────────────────────────────────────────────────
    const paymentMethodValues = [
      ...(hasStripe   ? ["stripe"]   : []),
      ...(hasPaystack ? ["paystack"] : []),
    ].map((v) => `"${v}"`).join(", ");

    files["packages/db/src/schema.ts"] = `
export * from "./auth-schema";

import {
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
export const listingStatus = pgEnum("listing_status", ["draft", "active", "paused", "archived"]);
export const bookingStatus = pgEnum("booking_status", ["pending", "confirmed", "cancelled", "completed"]);
export const payoutStatus  = pgEnum("payout_status",  ["pending", "processing", "paid", "failed"]);
${hasStripe || hasPaystack ? `export const paymentMethod = pgEnum("payment_method", [${paymentMethodValues}]);` : ""}

// ─── Seller Profile ───────────────────────────────────────────────────────────
export const sellerProfile = pgTable("seller_profile", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  userId:               text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  displayName:          text("display_name").notNull(),
  bio:                  text("bio"),
  avatarUrl:            text("avatar_url"),
  stripeAccountId:      text("stripe_account_id"),
  paystackSubaccountId: text("paystack_subaccount_id"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
});

// ─── Listings ─────────────────────────────────────────────────────────────────
export const listing = pgTable("listing", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sellerId:    text("seller_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title:       text("title").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  category:    text("category"),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull(),
  images:      text("images").array().notNull().default([]),
  location:    text("location"),
  status:      listingStatus("status").notNull().default("draft"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────
export const booking = pgTable("booking", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  listingId:           uuid("listing_id").notNull().references(() => listing.id),
  buyerId:             text("buyer_id").notNull().references(() => user.id),
  status:              bookingStatus("status").notNull().default("pending"),
  total:               numeric("total", { precision: 12, scale: 2 }).notNull(),
  ${hasStripe ? "stripePaymentId:     text(\"stripe_payment_id\")," : ""}
  ${hasStripe ? "stripeSessionId:     text(\"stripe_session_id\")," : ""}
  ${hasPaystack ? "paystackReference:   text(\"paystack_reference\")," : ""}
  startDate:           timestamp("start_date"),
  endDate:             timestamp("end_date"),
  notes:               text("notes"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const review = pgTable("review", {
  id:         uuid("id").primaryKey().defaultRandom(),
  listingId:  uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => user.id),
  bookingId:  uuid("booking_id").references(() => booking.id),
  rating:     integer("rating").notNull(),
  comment:    text("comment"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── Payouts ──────────────────────────────────────────────────────────────────
export const payout = pgTable("payout", {
  id:               uuid("id").primaryKey().defaultRandom(),
  sellerId:         text("seller_id").notNull().references(() => user.id),
  bookingId:        uuid("booking_id").references(() => booking.id),
  amount:           numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status:           payoutStatus("status").notNull().default("pending"),
  stripeTransferId: text("stripe_transfer_id"),
  processedAt:      timestamp("processed_at"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createSellerProfileSchema = z.object({
  displayName: z.string().min(1).max(100),
  bio:         z.string().max(1000).optional(),
  avatarUrl:   z.string().url().optional(),
});

export const createListingSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  category:    z.string().optional(),
  price:       z.string().regex(/^\d+\.\d{2}$/, "Format: 9.99"),
  images:      z.array(z.string().url()).default([]),
  location:    z.string().optional(),
});

export const updateListingSchema = createListingSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export const createBookingSchema = z.object({
  listingId: z.string().uuid(),
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
  notes:     z.string().max(1000).optional(),
});

export const createReviewSchema = z.object({
  listingId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().max(2000).optional(),
});

export const listingFiltersSchema = z.object({
  category: z.string().optional(),
  location: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  search:   z.string().optional(),
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
import { sellerProfile } from "@${scope}/db/schema";
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

// Seller-tier: requires a seller profile
export const sellerPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [profile] = await context.db
      .select().from(sellerProfile).where(eq(sellerProfile.userId, context.user.id)).limit(1);
    if (!profile) throw new ORPCError("FORBIDDEN", { message: "Seller profile required" });
    return next({ context: { ...context, sellerProfile: profile } });
  }),
);
`.trimStart();

    // ─── Listings Router ───────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/listings.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";

import { listing, review, sellerProfile } from "@${scope}/db/schema";
import { createListingSchema, listingFiltersSchema, updateListingSchema } from "@${scope}/validators";
import { priv, pub, sellerPriv } from "../procedures";
import { sql } from "drizzle-orm";

export const listingsRouter = {
  list: pub
    .input(listingFiltersSchema)
    .route({ method: "GET", path: "/listings/list" })
    .handler(async ({ context, input }) => {
      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;
      const conditions = [eq(listing.status, "active")];
      if (input.category) conditions.push(eq(listing.category, input.category));
      if (input.location) conditions.push(ilike(listing.location, \`%\${input.location}%\`));
      if (input.search)   conditions.push(
        or(ilike(listing.title, \`%\${input.search}%\`), ilike(listing.description, \`%\${input.search}%\`))!,
      );
      if (input.minPrice) conditions.push(gte(listing.price, input.minPrice));
      if (input.maxPrice) conditions.push(lte(listing.price, input.maxPrice));

      const rows = await context.db
        .select({ listing, avgRating: sql<number>\`AVG(\${review.rating})\` })
        .from(listing)
        .leftJoin(review, eq(review.listingId, listing.id))
        .where(and(...conditions))
        .groupBy(listing.id)
        .orderBy(desc(listing.createdAt))
        .limit(input.limit + 1)
        .offset(offset);

      const hasMore    = rows.length > input.limit;
      const items      = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;
      return { items, hasMore, nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null };
    }),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/listings/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ listing, seller: sellerProfile })
        .from(listing)
        .leftJoin(sellerProfile, eq(sellerProfile.userId, listing.sellerId))
        .where(eq(listing.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const reviews = await context.db
        .select()
        .from(review)
        .where(eq(review.listingId, found.listing.id))
        .orderBy(desc(review.createdAt))
        .limit(10);

      return { ...found, reviews };
    }),

  mine: sellerPriv
    .route({ method: "GET", path: "/listings/mine" })
    .handler(({ context }) =>
      context.db.select().from(listing).where(eq(listing.sellerId, context.user.id)).orderBy(desc(listing.createdAt)),
    ),

  create: sellerPriv
    .input(createListingSchema)
    .route({ method: "POST", path: "/listings/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(listing)
        .values({ ...input, sellerId: context.user.id })
        .returning();
      return created;
    }),

  update: sellerPriv
    .input(updateListingSchema)
    .route({ method: "PATCH", path: "/listings/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(listing)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(listing.id, id), eq(listing.sellerId, context.user.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: sellerPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/listings/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(listing).where(eq(listing.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.sellerId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(listing).where(eq(listing.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Bookings Router ───────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/bookings.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import { booking, listing, review } from "@${scope}/db/schema";
import { createBookingSchema, createReviewSchema } from "@${scope}/validators";
import { priv } from "../procedures";

export const bookingsRouter = {
  mine: priv
    .route({ method: "GET", path: "/bookings/mine" })
    .handler(({ context }) =>
      context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(
          or(
            eq(booking.buyerId, context.user.id),
            eq(listing.sellerId, context.user.id),
          ),
        ),
    ),

  get: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/bookings/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(eq(booking.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const isBuyer  = found.booking.buyerId === context.user.id;
      const isSeller = found.listing.sellerId === context.user.id;
      if (!isBuyer && !isSeller) throw new ORPCError("FORBIDDEN");

      return found;
    }),

  create: priv
    .input(createBookingSchema)
    .route({ method: "POST", path: "/bookings/create" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(listing)
        .where(and(eq(listing.id, input.listingId), eq(listing.status, "active")))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Listing not found or inactive" });
      if (found.sellerId === context.user.id) throw new ORPCError("BAD_REQUEST", { message: "Cannot book your own listing" });

      const [created] = await context.db
        .insert(booking)
        .values({
          listingId: input.listingId,
          buyerId:   context.user.id,
          total:     found.price,
          startDate: input.startDate,
          endDate:   input.endDate,
          notes:     input.notes,
        })
        .returning();
      return created;
    }),

  confirm: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/bookings/confirm" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(eq(booking.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.listing.sellerId !== context.user.id) throw new ORPCError("FORBIDDEN", { message: "Only the seller can confirm" });

      const [updated] = await context.db
        .update(booking)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(booking.id, input.id))
        .returning();
      return updated;
    }),

  cancel: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/bookings/cancel" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(eq(booking.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const isBuyer  = found.booking.buyerId === context.user.id;
      const isSeller = found.listing.sellerId === context.user.id;
      if (!isBuyer && !isSeller) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(booking)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(booking.id, input.id))
        .returning();
      return updated;
    }),

  complete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/bookings/complete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(eq(booking.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.listing.sellerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(booking)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(booking.id, input.id))
        .returning();
      return updated;
    }),

  review: priv
    .input(createReviewSchema)
    .route({ method: "POST", path: "/bookings/review" })
    .handler(async ({ context, input }) => {
      if (input.bookingId) {
        const [bk] = await context.db.select().from(booking).where(eq(booking.id, input.bookingId)).limit(1);
        if (!bk || bk.buyerId !== context.user.id) throw new ORPCError("FORBIDDEN");
        if (bk.status !== "completed") throw new ORPCError("BAD_REQUEST", { message: "Booking must be completed before reviewing" });
      }
      const [created] = await context.db
        .insert(review)
        .values({ ...input, reviewerId: context.user.id })
        .returning();
      return created;
    }),
};
`.trimStart();

    // ─── Seller Router ─────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/sellers.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { sellerProfile } from "@${scope}/db/schema";
import { createSellerProfileSchema } from "@${scope}/validators";
import { priv, sellerPriv } from "../procedures";

export const sellersRouter = {
  getMyProfile: priv
    .route({ method: "GET", path: "/sellers/me" })
    .handler(async ({ context }) => {
      const [profile] = await context.db
        .select()
        .from(sellerProfile)
        .where(eq(sellerProfile.userId, context.user.id))
        .limit(1);
      return profile ?? null;
    }),

  createProfile: priv
    .input(createSellerProfileSchema)
    .route({ method: "POST", path: "/sellers/create" })
    .handler(async ({ context, input }) => {
      const existing = await context.db
        .select()
        .from(sellerProfile)
        .where(eq(sellerProfile.userId, context.user.id))
        .limit(1);
      if (existing[0]) throw new ORPCError("CONFLICT", { message: "Seller profile already exists" });

      const [created] = await context.db
        .insert(sellerProfile)
        .values({ ...input, userId: context.user.id })
        .returning();
      return created;
    }),

  updateProfile: sellerPriv
    .input(createSellerProfileSchema.partial())
    .route({ method: "PATCH", path: "/sellers/update" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(sellerProfile)
        .set(input)
        .where(eq(sellerProfile.userId, context.user.id))
        .returning();
      return updated;
    }),
};
`.trimStart();

    // ─── Payment Routers ───────────────────────────────────────────────────────
    if (hasStripe) {
      files["packages/api/src/orpc-routers/payments/stripe.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

import { booking, listing } from "@${scope}/db/schema";
import { priv } from "../../procedures";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

export const stripePaymentRouter = {
  createCheckout: priv
    .input(z.object({ bookingId: z.string().uuid() }))
    .route({ method: "POST", path: "/payments/stripe/checkout" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(and(eq(booking.id, input.bookingId), eq(booking.buyerId, context.user.id)))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.booking.status !== "pending") throw new ORPCError("BAD_REQUEST", { message: "Booking already processed" });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency:     "usd",
            unit_amount:  Math.round(parseFloat(found.booking.total) * 100),
            product_data: { name: found.listing.title },
          },
        }],
        success_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/bookings/\${input.bookingId}?paid=1\`,
        cancel_url:  \`\${process.env.NEXT_PUBLIC_WEB_URL}/bookings/\${input.bookingId}\`,
        metadata:    { bookingId: input.bookingId },
      });

      await context.db
        .update(booking)
        .set({ stripeSessionId: session.id })
        .where(eq(booking.id, input.bookingId));

      return { url: session.url };
    }),
};
`.trimStart();

      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@${scope}/db/client";
import { booking, payout } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

const PLATFORM_FEE_PCT = 0.1; // 10% platform cut

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
    const session   = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return NextResponse.json({ received: true });

    const [bk] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);
    if (!bk) return NextResponse.json({ received: true });

    // Mark booking confirmed
    await db
      .update(booking)
      .set({ status: "confirmed", stripePaymentId: session.payment_intent as string, updatedAt: new Date() })
      .where(eq(booking.id, bookingId));

    // Queue seller payout
    const payoutAmount = parseFloat(bk.total) * (1 - PLATFORM_FEE_PCT);
    await db.insert(payout).values({
      sellerId:  bk.buyerId, // TODO: derive from listing.sellerId via join
      bookingId: bk.id,
      amount:    payoutAmount.toFixed(2),
      status:    "pending",
    });
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    if (hasPaystack) {
      files["packages/api/src/orpc-routers/payments/paystack.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { booking, listing } from "@${scope}/db/schema";
import { priv } from "../../procedures";

export const paystackPaymentRouter = {
  initiate: priv
    .input(z.object({ bookingId: z.string().uuid() }))
    .route({ method: "POST", path: "/payments/paystack/initiate" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ booking, listing })
        .from(booking)
        .innerJoin(listing, eq(booking.listingId, listing.id))
        .where(and(eq(booking.id, input.bookingId), eq(booking.buyerId, context.user.id)))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.booking.status !== "pending") throw new ORPCError("BAD_REQUEST", { message: "Already processed" });

      const amountKobo = Math.round(parseFloat(found.booking.total) * 100);
      const reference  = \`bk_\${input.bookingId}_\${Date.now()}\`;

      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method:  "POST",
        headers: { Authorization: \`Bearer \${process.env.PAYSTACK_SECRET_KEY}\`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email:     context.user.email,
          amount:    amountKobo,
          reference,
          metadata:  { bookingId: input.bookingId },
          callback_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/bookings/\${input.bookingId}?paid=1\`,
        }),
      });
      const json = await res.json() as { status: boolean; data: { authorization_url: string; reference: string } };
      if (!json.status) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Paystack error" });

      await context.db
        .update(booking)
        .set({ paystackReference: reference })
        .where(eq(booking.id, input.bookingId));

      return { url: json.data.authorization_url, reference: json.data.reference };
    }),
};
`.trimStart();

      files["apps/web/src/app/api/paystack/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { db } from "@${scope}/db/client";
import { booking, payout } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const PLATFORM_FEE_PCT = 0.1;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const hash = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(body)
    .digest("hex");

  if (hash !== req.headers.get("x-paystack-signature")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as { event: string; data: { reference: string; status: string } };

  if (event.event === "charge.success") {
    const ref = event.data.reference;
    const [bk] = await db.select().from(booking).where(eq(booking.paystackReference, ref)).limit(1);
    if (!bk) return NextResponse.json({ received: true });

    await db
      .update(booking)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(booking.id, bk.id));

    const payoutAmount = parseFloat(bk.total) * (1 - PLATFORM_FEE_PCT);
    await db.insert(payout).values({
      sellerId:  bk.buyerId,
      bookingId: bk.id,
      amount:    payoutAmount.toFixed(2),
      status:    "pending",
    });
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Root Router ──────────────────────────────────────────────────────────
    const stripeImport    = hasStripe   ? `import { stripePaymentRouter }   from "./payments/stripe";\n`   : "";
    const paystackImport  = hasPaystack ? `import { paystackPaymentRouter } from "./payments/paystack";\n` : "";
    const stripeEntry     = hasStripe   ? `  paymentsStripe:   stripePaymentRouter,\n`   : "";
    const paystackEntry   = hasPaystack ? `  paymentsPaystack: paystackPaymentRouter,\n` : "";

    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }     from "./auth";
import { listingsRouter } from "./listings";
import { bookingsRouter } from "./bookings";
import { sellersRouter }  from "./sellers";
${stripeImport}${paystackImport}
export const appRouter = {
  auth:     authRouter,
  listings: listingsRouter,
  bookings: bookingsRouter,
  sellers:  sellersRouter,
${stripeEntry}${paystackEntry}};

export type AppRouter = typeof appRouter;
`.trimStart();

    // ─── Server-side direct caller ─────────────────────────────────────────────
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

export const getCachedListings = unstable_cache(
  (input?: Parameters<typeof publicCaller.listings.list>[0]) =>
    publicCaller.listings.list(input ?? {}),
  ["listings-list"],
  { revalidate: 120, tags: ["listings"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedListings } from "@/lib/server-orpc";

export default async function HomePage() {
  const { items } = await getCachedListings();

  return (
    <main className="mx-auto max-w-6xl space-y-12 p-6">
      <section className="py-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Find what you need.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Browse thousands of listings from verified sellers.</p>
        <Link href="/listings" className="mt-6 inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
          Explore Listings
        </Link>
      </section>

      {items.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold">Recent Listings</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.slice(0, 6).map(({ listing: l }) => (
              <Link key={l.id} href={\`/listings/\${l.slug}\`} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
                {l.images[0] && (
                  <img src={l.images[0]} alt={l.title} className="h-40 w-full object-cover" />
                )}
                <div className="p-4 space-y-1">
                  <h3 className="font-semibold group-hover:text-primary">{l.title}</h3>
                  {l.location && <p className="text-xs text-muted-foreground">{l.location}</p>}
                  <p className="text-sm font-medium">\$\${l.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/listings/page.tsx"] = `
import Link from "next/link";
import { getCachedListings } from "@/lib/server-orpc";

interface Props { searchParams: Promise<{ category?: string; location?: string; search?: string }> }

export default async function ListingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { items, hasMore } = await getCachedListings({
    category: sp.category,
    location: sp.location,
    search:   sp.search,
  });

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Listings</h1>
        <Link href="/sell/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          + New Listing
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ listing: l, avgRating }) => (
          <Link key={l.id} href={\`/listings/\${l.slug}\`} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
            {l.images[0] && <img src={l.images[0]} alt={l.title} className="h-40 w-full object-cover" />}
            <div className="p-4 space-y-1">
              <h2 className="font-semibold group-hover:text-primary">{l.title}</h2>
              {l.location && <p className="text-xs text-muted-foreground">{l.location}</p>}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">\$\${l.price}</span>
                {avgRating && <span className="text-xs text-muted-foreground">★ {Number(avgRating).toFixed(1)}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
      {items.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No listings found.</p>
      )}
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/listings/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { BookingForm } from "./_components/booking-form";

interface Props { params: Promise<{ slug: string }> }

export default async function ListingDetailPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.listings.get>>;
  try {
    data = await caller.listings.get({ slug });
  } catch {
    notFound();
  }

  const { listing: l, seller, reviews } = data;
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      {l.images[0] && (
        <div className="grid gap-2 sm:grid-cols-2">
          {l.images.map((img, i) => (
            <img key={i} src={img} alt={l.title} className="rounded-lg object-cover h-64 w-full" />
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{l.title}</h1>
            {l.location && <p className="text-muted-foreground mt-1">{l.location}</p>}
            {avgRating && <p className="text-sm mt-1">★ {avgRating} ({reviews.length} reviews)</p>}
          </div>
          {l.description && <p className="text-muted-foreground">{l.description}</p>}

          {reviews.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Reviews</h2>
              <ul className="space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-lg border p-4 space-y-1">
                    <div className="flex items-center gap-2">
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </div>
                    {r.comment && <p className="text-sm text-muted-foreground">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border p-6 space-y-4 sticky top-4">
            <p className="text-3xl font-bold">\$\${l.price}</p>
            {seller && (
              <p className="text-sm text-muted-foreground">by {seller.displayName}</p>
            )}
            <BookingForm listingId={l.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/listings/[slug]/_components/booking-form.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { listingId: string }

export function BookingForm({ listingId }: Props) {
  const router = useRouter();
  const [notes, setNotes]   = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleBook() {
    setLoading(true);
    setError("");
    try {
      const bk = await orpc.bookings.create({ listingId, notes: notes || undefined });
      router.push(\`/bookings/\${bk!.id}\`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        placeholder="Add a note for the seller…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="w-full rounded-md border px-3 py-2 text-sm resize-none"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        onClick={handleBook}
        disabled={loading}
        className="w-full rounded-md bg-primary py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Booking…" : "Book Now"}
      </button>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/bookings/[id]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { BookingActions } from "./_components/booking-actions";

interface Props { params: Promise<{ id: string }> }

export default async function BookingDetailPage({ params }: Props) {
  const { id }   = await params;
  const caller   = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.bookings.get>>;
  try {
    data = await caller.bookings.get({ id });
  } catch {
    notFound();
  }

  const { booking: bk, listing: l } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Booking Details</h1>
      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{l.title}</h2>
          <span className={\`text-sm capitalize px-2 py-1 rounded-full \${
            bk.status === "confirmed" ? "bg-green-100 text-green-800" :
            bk.status === "cancelled" ? "bg-red-100 text-red-800" :
            bk.status === "completed" ? "bg-blue-100 text-blue-800" :
            "bg-yellow-100 text-yellow-800"
          }\`}>{bk.status}</span>
        </div>
        <p className="text-2xl font-bold">\$\${bk.total}</p>
        {bk.notes && <p className="text-sm text-muted-foreground">{bk.notes}</p>}
        <BookingActions bookingId={bk.id} status={bk.status} listingId={l.id} />
      </div>
    </div>
  );
}
`.trimStart();

    const paymentButton = hasStripe
      ? `
      <button
        onClick={async () => {
          const { url } = await orpc.paymentsStripe.createCheckout({ bookingId });
          if (url) window.location.href = url;
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Pay Now
      </button>`
      : hasPaystack
      ? `
      <button
        onClick={async () => {
          const { url } = await orpc.paymentsPaystack.initiate({ bookingId });
          if (url) window.location.href = url;
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Pay Now
      </button>`
      : "";

    files["apps/web/src/app/bookings/[id]/_components/booking-actions.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { bookingId: string; status: string; listingId: string }

export function BookingActions({ bookingId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setLoading(true);
    try { await fn(); router.refresh(); } finally { setLoading(false); }
  }

  if (status === "completed" || status === "cancelled") return null;

  return (
    <div className="flex flex-wrap gap-3">
      {status === "pending" && (${paymentButton}
        <button
          onClick={() => act(() => orpc.bookings.cancel({ id: bookingId }))}
          disabled={loading}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Cancel
        </button>
      )}
      {status === "confirmed" && (
        <>
          <button
            onClick={() => act(() => orpc.bookings.complete({ id: bookingId }))}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Mark Complete
          </button>
          <button
            onClick={() => act(() => orpc.bookings.cancel({ id: bookingId }))}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/sell/new/page.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

export default function NewListingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", slug: "", description: "", price: "", category: "", location: "" });
  const [error, setError] = useState("");

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const listing = await orpc.listings.create({
        ...form,
        price:  parseFloat(form.price).toFixed(2),
        images: [],
      });
      router.push(\`/listings/\${listing!.slug}\`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Create Listing</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(["title", "slug", "category", "location"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <label className="text-sm font-medium capitalize">{field}</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form[field]}
              onChange={(e) => {
                update(field, e.target.value);
                if (field === "title") {
                  update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                }
              }}
              required={field === "title" || field === "slug"}
            />
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={4} value={form.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Price (USD)</label>
          <input type="number" step="0.01" min="0" className="w-full rounded-md border px-3 py-2 text-sm" value={form.price} onChange={(e) => update("price", e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
          Publish Listing
        </button>
      </form>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

export default async function DashboardPage() {
  const caller = await getServerCaller();
  let bookings: Awaited<ReturnType<typeof caller.bookings.mine>>;
  let listings: Awaited<ReturnType<typeof caller.listings.mine>>;

  try {
    [bookings, listings] = await Promise.all([caller.bookings.mine(), caller.listings.mine()]);
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/sell/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          + New Listing
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">My Listings ({listings.length})</h2>
        {listings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No listings yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between p-4">
                <Link href={\`/listings/\${l.slug}\`} className="font-medium hover:text-primary">{l.title}</Link>
                <span className={\`text-xs capitalize \${l.status === "active" ? "text-green-600" : "text-muted-foreground"}\`}>{l.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Bookings ({bookings.length})</h2>
        {bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bookings yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {bookings.map(({ booking: bk, listing: l }) => (
              <li key={bk.id}>
                <Link href={\`/bookings/\${bk.id}\`} className="flex items-center justify-between p-4 hover:bg-accent">
                  <span className="font-medium">{l.title}</span>
                  <span className={\`text-xs capitalize \${
                    bk.status === "confirmed" ? "text-green-600" :
                    bk.status === "cancelled" ? "text-red-600" : "text-muted-foreground"
                  }\`}>{bk.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
`.trimStart();

    // ─── Admin Pages ───────────────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/listings/page.tsx"] = `
import { getServerCaller } from "@/lib/server-orpc";

export default async function AdminListingsPage() {
  const caller = await getServerCaller();
  const { items } = await caller.listings.list({});

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">All Listings</h1>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Price</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(({ listing: l }) => (
              <tr key={l.id} className="hover:bg-muted/25">
                <td className="px-4 py-3 font-medium">{l.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{l.category ?? "—"}</td>
                <td className="px-4 py-3">\$\${l.price}</td>
                <td className="px-4 py-3 capitalize">{l.status}</td>
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
