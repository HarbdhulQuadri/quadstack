import type { AppTemplate } from "./types";

export const marketplace: AppTemplate = {
  id:                   "marketplace",
  name:                 "Marketplace",
  description:          "Multi-vendor listings, bookings, reviews, and seller payouts",
  hint:                 "Airbnb / Fiverr style, buyer + seller flows",
  defaultPayments:      ["stripe", "paystack"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope) => ({
    "packages/db/src/schema.ts": `
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

// ─── Enums ───────────────────────────────────────────────────────────────────
export const listingStatus  = pgEnum("listing_status",  ["draft", "active", "paused", "archived"]);
export const bookingStatus  = pgEnum("booking_status",  ["pending", "confirmed", "cancelled", "completed"]);
export const payoutStatus   = pgEnum("payout_status",   ["pending", "processing", "paid", "failed"]);

// ─── Tables ──────────────────────────────────────────────────────────────────
export const listing = pgTable("listing", {
  id:          uuid("id").primaryKey().defaultRandom(),
  sellerId:    text("seller_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title:       text("title").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  category:    text("category"),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull(),
  images:      text("images").array().notNull().default([]),
  status:      listingStatus("status").notNull().default("draft"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const booking = pgTable("booking", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  listingId:            uuid("listing_id").notNull().references(() => listing.id),
  buyerId:              text("buyer_id").notNull().references(() => user.id),
  status:               bookingStatus("status").notNull().default("pending"),
  total:                numeric("total", { precision: 12, scale: 2 }).notNull(),
  stripePaymentId:      text("stripe_payment_id"),
  paystackReference:    text("paystack_reference"),
  startDate:            timestamp("start_date"),
  endDate:              timestamp("end_date"),
  notes:                text("notes"),
  createdAt:            timestamp("created_at").notNull().defaultNow(),
  updatedAt:            timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const review = pgTable("review", {
  id:          uuid("id").primaryKey().defaultRandom(),
  listingId:   uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  reviewerId:  text("reviewer_id").notNull().references(() => user.id),
  bookingId:   uuid("booking_id").references(() => booking.id),
  rating:      integer("rating").notNull(),
  comment:     text("comment"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const payout = pgTable("payout", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  sellerId:            text("seller_id").notNull().references(() => user.id),
  bookingId:           uuid("booking_id").references(() => booking.id),
  amount:              numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status:              payoutStatus("status").notNull().default("pending"),
  stripeTransferId:    text("stripe_transfer_id"),
  processedAt:         timestamp("processed_at"),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
});
`.trimStart(),

    "packages/validators/src/index.ts": `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createListingSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  category:    z.string().optional(),
  price:       z.string().regex(/^\\d+\\.\\d{2}$/, "Format: 9.99"),
  images:      z.array(z.string().url()).default([]),
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
`.trimStart(),

    "packages/api/src/orpc-routers/listings.ts": `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { listing } from "@${scope}/db/schema";
import { createListingSchema, updateListingSchema } from "@${scope}/validators";

import { priv, pub } from "../procedures";

export const listingsRouter = {
  list: pub
    .input(z.object({ category: z.string().optional() }).optional())
    .route({ method: "GET", path: "/listings/list" })
    .handler(({ context, input }) =>
      context.db
        .select()
        .from(listing)
        .where(
          input?.category
            ? and(eq(listing.status, "active"), eq(listing.category, input.category))
            : eq(listing.status, "active"),
        ),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/listings/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(listing)
        .where(eq(listing.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  mine: priv
    .route({ method: "GET", path: "/listings/mine" })
    .handler(({ context }) =>
      context.db.select().from(listing).where(eq(listing.sellerId, context.user.id)),
    ),

  create: priv
    .input(createListingSchema)
    .route({ method: "POST", path: "/listings/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(listing)
        .values({ ...input, sellerId: context.user.id })
        .returning();
      return created;
    }),

  update: priv
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

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/listings/delete" })
    .handler(async ({ context, input }) => {
      await context.db
        .delete(listing)
        .where(and(eq(listing.id, input.id), eq(listing.sellerId, context.user.id)));
      return { success: true };
    }),
};
`.trimStart(),

    "packages/api/src/orpc-routers/bookings.ts": `
import { ORPCError } from "@orpc/server";
import { eq, or } from "drizzle-orm";
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

  create: priv
    .input(createBookingSchema)
    .route({ method: "POST", path: "/bookings/create" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(listing)
        .where(eq(listing.id, input.listingId))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Listing not found" });

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
      const [updated] = await context.db
        .update(booking)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(booking.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  cancel: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/bookings/cancel" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(booking)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(booking.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  review: priv
    .input(createReviewSchema)
    .route({ method: "POST", path: "/bookings/review" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(review)
        .values({ ...input, reviewerId: context.user.id })
        .returning();
      return created;
    }),
};
`.trimStart(),

    "packages/api/src/orpc-routers/index.ts": `
import { authRouter }    from "./auth";
import { bookingsRouter } from "./bookings";
import { listingsRouter } from "./listings";

export const appRouter = {
  auth:     authRouter,
  listings: listingsRouter,
  bookings: bookingsRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart(),
  }),
};
