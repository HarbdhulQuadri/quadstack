import type { AppTemplate } from "./types";

export const ecommerce: AppTemplate = {
  id:                   "ecommerce",
  name:                 "E-commerce",
  description:          "Products, orders, cart, and checkout with payment processing",
  hint:                 "Storefront + admin, Stripe or Paystack",
  defaultPayments:      ["stripe"],
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
export const orderStatus   = pgEnum("order_status",   ["pending", "paid", "shipped", "delivered", "cancelled"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);

// ─── Tables ──────────────────────────────────────────────────────────────────
export const product = pgTable("product", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  price:       numeric("price", { precision: 12, scale: 2 }).notNull(),
  stock:       integer("stock").notNull().default(0),
  images:      text("images").array().notNull().default([]),
  status:      productStatus("status").notNull().default("draft"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const order = pgTable("order", {
  id:                     uuid("id").primaryKey().defaultRandom(),
  userId:                 text("user_id").notNull().references(() => user.id),
  status:                 orderStatus("status").notNull().default("pending"),
  total:                  numeric("total", { precision: 12, scale: 2 }).notNull(),
  stripePaymentIntentId:  text("stripe_payment_intent_id").unique(),
  paystackReference:      text("paystack_reference").unique(),
  shippingAddressLine1:   text("shipping_address_line1"),
  shippingCity:           text("shipping_city"),
  shippingCountry:        text("shipping_country"),
  shippingZip:            text("shipping_zip"),
  createdAt:              timestamp("created_at").notNull().defaultNow(),
  updatedAt:              timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItem = pgTable("order_item", {
  id:        uuid("id").primaryKey().defaultRandom(),
  orderId:   uuid("order_id").notNull().references(() => order.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => product.id),
  quantity:  integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
});
`.trimStart(),

    "packages/validators/src/index.ts": `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createProductSchema = z.object({
  name:        z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  price:       z.string().regex(/^\\d+\\.\\d{2}$/, "Format: 9.99"),
  stock:       z.number().int().min(0).default(0),
  images:      z.array(z.string().url()).default([]),
});

export const updateProductSchema = createProductSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity:  z.number().int().min(1),
  })).min(1),
  shippingAddressLine1: z.string().optional(),
  shippingCity:         z.string().optional(),
  shippingCountry:      z.string().optional(),
  shippingZip:          z.string().optional(),
});
`.trimStart(),

    "packages/api/src/orpc-routers/products.ts": `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { product } from "@${scope}/db/schema";
import { createProductSchema, updateProductSchema } from "@${scope}/validators";

import { priv, pub } from "../procedures";

export const productsRouter = {
  list: pub
    .route({ method: "GET", path: "/products/list" })
    .handler(({ context }) =>
      context.db.select().from(product).where(eq(product.status, "active")),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/products/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(product)
        .where(eq(product.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  // Admin only — add role check to your middleware or inline guard
  create: priv
    .input(createProductSchema)
    .route({ method: "POST", path: "/products/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(product).values(input).returning();
      return created;
    }),

  update: priv
    .input(updateProductSchema)
    .route({ method: "PATCH", path: "/products/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(product)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(product.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/products/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(product).where(eq(product.id, input.id));
      return { success: true };
    }),
};
`.trimStart(),

    "packages/api/src/orpc-routers/orders.ts": `
import { ORPCError } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";

import { order, orderItem, product } from "@${scope}/db/schema";
import { createOrderSchema } from "@${scope}/validators";

import { priv } from "../procedures";

export const ordersRouter = {
  myOrders: priv
    .route({ method: "GET", path: "/orders/mine" })
    .handler(({ context }) =>
      context.db.select().from(order).where(eq(order.userId, context.user.id)),
    ),

  create: priv
    .input(createOrderSchema)
    .route({ method: "POST", path: "/orders/create" })
    .handler(async ({ context, input }) => {
      const productIds = input.items.map((i) => i.productId);
      const products = await context.db
        .select()
        .from(product)
        .where(inArray(product.id, productIds));

      const total = input.items.reduce((sum, item) => {
        const p = products.find((p) => p.id === item.productId);
        if (!p) throw new ORPCError("BAD_REQUEST", { message: \`Product \${item.productId} not found\` });
        return sum + parseFloat(p.price) * item.quantity;
      }, 0);

      const [created] = await context.db
        .insert(order)
        .values({
          userId:               context.user.id,
          total:                total.toFixed(2),
          shippingAddressLine1: input.shippingAddressLine1,
          shippingCity:         input.shippingCity,
          shippingCountry:      input.shippingCountry,
          shippingZip:          input.shippingZip,
        })
        .returning();

      await context.db.insert(orderItem).values(
        input.items.map((item) => {
          const p = products.find((p) => p.id === item.productId)!;
          return { orderId: created!.id, productId: item.productId, quantity: item.quantity, unitPrice: p.price };
        }),
      );

      return created;
    }),
};
`.trimStart(),

    "packages/api/src/orpc-routers/index.ts": `
import { authRouter }     from "./auth";
import { productsRouter } from "./products";
import { ordersRouter }   from "./orders";

export const appRouter = {
  auth:     authRouter,
  products: productsRouter,
  orders:   ordersRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart(),
  }),
};
