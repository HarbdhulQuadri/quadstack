import type { ProjectConfig } from "../prompts";
import type { AppTemplate } from "./types";

export const ecommerce: AppTemplate = {
  id:                   "ecommerce",
  name:                 "E-commerce",
  description:          "Full storefront with cart, checkout, orders, and admin dashboard",
  hint:                 "Products, variants, categories, cart, Stripe/Paystack",
  defaultPayments:      ["stripe", "paystack"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, config) => {
    const hasPaystack = config.payments.includes("paystack");
    const hasStripe   = config.payments.includes("stripe");
    const hasMedia    = config.media;

    const paymentMethodValues = ["bank_transfer", hasStripe && "stripe", hasPaystack && "paystack"]
      .filter(Boolean).join('", "');

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
export const orderStatus   = pgEnum("order_status",   ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"]);
export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const mediaType     = pgEnum("media_type",     ["image", "video"]);
export const discountType  = pgEnum("discount_type",  ["percentage", "fixed"]);
export const paymentMethod = pgEnum("payment_method", ["${paymentMethodValues}"]);

// ─── Staff / Admin ────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("staff"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Categories ───────────────────────────────────────────────────────────────
export const category = pgTable("category", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  imageUrl:    text("image_url"),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Products ─────────────────────────────────────────────────────────────────
export const product = pgTable("product", {
  id:           uuid("id").primaryKey().defaultRandom(),
  categoryId:   uuid("category_id").references(() => category.id, { onDelete: "set null" }),
  name:         text("name").notNull(),
  slug:         text("slug").notNull().unique(),
  description:  text("description"),
  price:        numeric("price",         { precision: 12, scale: 2 }).notNull(),
  comparePrice: numeric("compare_price", { precision: 12, scale: 2 }),
  stock:        integer("stock").notNull().default(0),
  isFeatured:   boolean("is_featured").notNull().default(false),
  status:       productStatus("status").notNull().default("draft"),
  tags:         text("tags").array().notNull().default([]),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const productVariant = pgTable("product_variant", {
  id:        uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  price:     numeric("price", { precision: 12, scale: 2 }),
  stock:     integer("stock").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productMedia = pgTable("product_media", {
  id:        uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  url:       text("url").notNull(),
  type:      mediaType("type").notNull().default("image"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ─── Cart ─────────────────────────────────────────────────────────────────────
export const cart = pgTable("cart", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cartItem = pgTable("cart_item", {
  id:        uuid("id").primaryKey().defaultRandom(),
  cartId:    uuid("cart_id").notNull().references(() => cart.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  quantity:  integer("quantity").notNull().default(1),
});

// ─── Addresses ────────────────────────────────────────────────────────────────
export const address = pgTable("address", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  fullName:  text("full_name").notNull(),
  phone:     text("phone").notNull(),
  line1:     text("line1").notNull(),
  line2:     text("line2"),
  city:      text("city").notNull(),
  state:     text("state").notNull(),
  country:   text("country").notNull().default("US"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Delivery Zones ───────────────────────────────────────────────────────────
export const deliveryZone = pgTable("delivery_zone", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  name:                  text("name").notNull(),
  price:                 numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedDays:         text("estimated_days"),
  freeShippingThreshold: numeric("free_shipping_threshold", { precision: 12, scale: 2 }),
  isActive:              boolean("is_active").notNull().default(true),
});

// ─── Promo Codes ──────────────────────────────────────────────────────────────
export const promoCode = pgTable("promo_code", {
  id:            uuid("id").primaryKey().defaultRandom(),
  code:          text("code").notNull().unique(),
  discountType:  discountType("discount_type").notNull().default("percentage"),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
  minOrderValue: numeric("min_order_value", { precision: 12, scale: 2 }),
  maxUses:       integer("max_uses"),
  usedCount:     integer("used_count").notNull().default(0),
  expiresAt:     timestamp("expires_at"),
  isActive:      boolean("is_active").notNull().default(true),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
export const order = pgTable("order", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         text("user_id").notNull().references(() => user.id),
  status:         orderStatus("status").notNull().default("pending"),
  paymentMethod:  paymentMethod("payment_method"),
  ${hasStripe   ? 'stripePaymentIntentId: text("stripe_payment_intent_id").unique(),' : ""}
  ${hasPaystack ? 'paystackRef: text("paystack_ref").unique(),' : ""}
  subtotal:       numeric("subtotal",       { precision: 12, scale: 2 }).notNull(),
  discount:       numeric("discount",       { precision: 12, scale: 2 }).notNull().default("0"),
  shippingPrice:  numeric("shipping_price", { precision: 12, scale: 2 }).notNull().default("0"),
  total:          numeric("total",          { precision: 12, scale: 2 }).notNull(),
  promoCodeId:    uuid("promo_code_id").references(() => promoCode.id, { onDelete: "set null" }),
  deliveryZoneId: uuid("delivery_zone_id").references(() => deliveryZone.id, { onDelete: "set null" }),
  trackingNumber: text("tracking_number"),
  shipFullName:   text("ship_full_name"),
  shipPhone:      text("ship_phone"),
  shipLine1:      text("ship_line1"),
  shipLine2:      text("ship_line2"),
  shipCity:       text("ship_city"),
  shipState:      text("ship_state"),
  shipCountry:    text("ship_country").default("US"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItem = pgTable("order_item", {
  id:        uuid("id").primaryKey().defaultRandom(),
  orderId:   uuid("order_id").notNull().references(() => order.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
  variantId: uuid("variant_id").references(() => productVariant.id, { onDelete: "set null" }),
  name:      text("name").notNull(),
  quantity:  integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const review = pgTable("review", {
  id:        uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  rating:    integer("rating").notNull(),
  comment:   text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Wishlist ─────────────────────────────────────────────────────────────────
export const wishlist = pgTable("wishlist", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

// ─── Categories ───────────────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  name:        z.string().min(1).max(100),
  slug:        z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  imageUrl:    z.string().url().optional(),
  sortOrder:   z.number().int().default(0),
});
export const updateCategorySchema = createCategorySchema.partial().extend({ id: z.string().uuid() });

// ─── Products ─────────────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  categoryId:   z.string().uuid().optional(),
  name:         z.string().min(1).max(200),
  slug:         z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description:  z.string().optional(),
  price:        z.string().regex(/^\\d+(\\.\\d{1,2})?$/, "Invalid price"),
  comparePrice: z.string().regex(/^\\d+(\\.\\d{1,2})?$/).optional(),
  stock:        z.number().int().min(0).default(0),
  isFeatured:   z.boolean().default(false),
  status:       z.enum(["draft", "active", "archived"]).default("draft"),
  tags:         z.array(z.string()).default([]),
});
export const updateProductSchema = createProductSchema.partial().extend({ id: z.string().uuid() });

export const productFiltersSchema = z.object({
  categoryId: z.string().uuid().optional(),
  search:     z.string().optional(),
  minPrice:   z.number().optional(),
  maxPrice:   z.number().optional(),
  isFeatured: z.boolean().optional(),
  sort:       z.enum(["newest", "price_asc", "price_desc"]).optional(),
  limit:      z.number().int().min(1).max(100).default(24),
  cursor:     z.string().optional(),
});

export const createVariantSchema = z.object({
  productId: z.string().uuid(),
  name:      z.string().min(1),
  price:     z.string().regex(/^\\d+(\\.\\d{1,2})?$/).optional(),
  stock:     z.number().int().min(0).default(0),
  sortOrder: z.number().int().default(0),
});
export const updateVariantSchema = createVariantSchema.partial().extend({ id: z.string().uuid() });

export const addMediaSchema = z.object({
  productId: z.string().uuid(),
  url:       z.string().min(1),
  type:      z.enum(["image", "video"]).default("image"),
  sortOrder: z.number().int().default(0),
});

// ─── Cart ─────────────────────────────────────────────────────────────────────
export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity:  z.number().int().min(1).default(1),
});
export const updateCartItemSchema = z.object({
  cartItemId: z.string().uuid(),
  quantity:   z.number().int().min(0),
});

// ─── Addresses ────────────────────────────────────────────────────────────────
export const createAddressSchema = z.object({
  fullName:  z.string().min(1),
  phone:     z.string().min(5),
  line1:     z.string().min(1),
  line2:     z.string().optional(),
  city:      z.string().min(1),
  state:     z.string().min(1),
  country:   z.string().default("US"),
  isDefault: z.boolean().default(false),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
export const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity:  z.number().int().min(1),
  })).min(1),
  paymentMethod:  z.enum(["${paymentMethodValues}"]),
  addressId:      z.string().uuid().optional(),
  deliveryZoneId: z.string().uuid().optional(),
  promoCode:      z.string().optional(),
  shipFullName:   z.string().optional(),
  shipPhone:      z.string().optional(),
  shipLine1:      z.string().optional(),
  shipLine2:      z.string().optional(),
  shipCity:       z.string().optional(),
  shipState:      z.string().optional(),
  shipCountry:    z.string().optional(),
});

// ─── Delivery Zones ───────────────────────────────────────────────────────────
export const createDeliveryZoneSchema = z.object({
  name:                  z.string().min(1),
  price:                 z.string().regex(/^\\d+(\\.\\d{1,2})?$/),
  estimatedDays:         z.string().optional(),
  freeShippingThreshold: z.string().regex(/^\\d+(\\.\\d{1,2})?$/).optional(),
  isActive:              z.boolean().default(true),
});

// ─── Promo Codes ─────────────────────────────────────────────────────────────
export const createPromoCodeSchema = z.object({
  code:          z.string().min(2).max(20).toUpperCase(),
  discountType:  z.enum(["percentage", "fixed"]).default("percentage"),
  discountValue: z.string().regex(/^\\d+(\\.\\d{1,2})?$/),
  minOrderValue: z.string().regex(/^\\d+(\\.\\d{1,2})?$/).optional(),
  maxUses:       z.number().int().optional(),
  expiresAt:     z.string().datetime().optional(),
  isActive:      z.boolean().default(true),
});

// ─── Reviews ─────────────────────────────────────────────────────────────────
export const createReviewSchema = z.object({
  productId: z.string().uuid(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().max(1000).optional(),
});
`.trimStart();

    // ─── Procedures (with adminPriv) ───────────────────────────────────────────
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

// Admin-only — checks the staff_role table.
// Grant access: INSERT INTO staff_role (user_id) VALUES ('<user-id>');
export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select()
      .from(staffRole)
      .where(eq(staffRole.userId, context.user.id))
      .limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Products Router ───────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/products.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, getTableColumns, ilike, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { product, productMedia, productVariant } from "@${scope}/db/schema";
import {
  addMediaSchema,
  createProductSchema,
  createVariantSchema,
  productFiltersSchema,
  updateProductSchema,
  updateVariantSchema,
} from "@${scope}/validators";

import { adminPriv, pub } from "../procedures";

// Correlated subquery — grabs the first image URL for each product in one SQL pass.
const thumbnailUrl = sql<string | null>\`(
  SELECT url FROM product_media
  WHERE product_media.product_id = \${product.id}
    AND product_media.type = 'image'
  ORDER BY product_media.sort_order ASC
  LIMIT 1
)\`;

const productWithThumb = { ...getTableColumns(product), thumbnailUrl };

export const productsRouter = {
  list: pub
    .input(productFiltersSchema)
    .route({ method: "GET", path: "/products/list" })
    .handler(async ({ context, input }) => {
      const conditions = [eq(product.status, "active")];
      if (input.categoryId) conditions.push(eq(product.categoryId, input.categoryId));
      if (input.isFeatured !== undefined) conditions.push(eq(product.isFeatured, input.isFeatured));
      if (input.search) conditions.push(ilike(product.name, \`%\${input.search}%\`));

      const order = input.sort === "price_asc"  ? product.price :
                    input.sort === "price_desc" ? desc(product.price) :
                    desc(product.createdAt);

      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;
      const rows = await context.db
        .select(productWithThumb)
        .from(product)
        .where(and(...conditions))
        .orderBy(order)
        .limit(input.limit + 1)
        .offset(offset);

      const hasMore = rows.length > input.limit;
      const items   = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;

      return {
        items,
        hasMore,
        nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null,
      };
    }),

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
      const [media, variants] = await Promise.all([
        context.db.select().from(productMedia).where(eq(productMedia.productId, found.id)).orderBy(productMedia.sortOrder),
        context.db.select().from(productVariant).where(eq(productVariant.productId, found.id)).orderBy(productVariant.sortOrder),
      ]);
      return { ...found, media, variants };
    }),

  featured: pub
    .route({ method: "GET", path: "/products/featured" })
    .handler(({ context }) =>
      context.db
        .select(productWithThumb)
        .from(product)
        .where(and(eq(product.isFeatured, true), eq(product.status, "active")))
        .orderBy(desc(product.createdAt))
        .limit(8),
    ),

  newArrivals: pub
    .route({ method: "GET", path: "/products/new-arrivals" })
    .handler(({ context }) =>
      context.db
        .select(productWithThumb)
        .from(product)
        .where(eq(product.status, "active"))
        .orderBy(desc(product.createdAt))
        .limit(8),
    ),

  onSale: pub
    .route({ method: "GET", path: "/products/on-sale" })
    .handler(({ context }) =>
      context.db
        .select(productWithThumb)
        .from(product)
        .where(and(
          eq(product.status, "active"),
          sql\`\${product.comparePrice} IS NOT NULL AND \${product.comparePrice} > \${product.price}\`,
        ))
        .orderBy(desc(product.createdAt))
        .limit(8),
    ),

  bestSellers: pub
    .route({ method: "GET", path: "/products/best-sellers" })
    .handler(({ context }) =>
      context.db
        .select(productWithThumb)
        .from(product)
        .where(eq(product.status, "active"))
        .orderBy(desc(product.createdAt))
        .limit(8),
    ),

  relatedProducts: pub
    .input(z.object({ productId: z.string().uuid(), categoryId: z.string().uuid().optional() }))
    .route({ method: "GET", path: "/products/related" })
    .handler(async ({ context, input }) => {
      const conditions = [eq(product.status, "active"), ne(product.id, input.productId)];
      if (input.categoryId) conditions.push(eq(product.categoryId, input.categoryId));
      return context.db
        .select(productWithThumb)
        .from(product)
        .where(and(...conditions))
        .orderBy(desc(product.createdAt))
        .limit(4);
    }),

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminList: adminPriv
    .route({ method: "GET", path: "/admin/products/list" })
    .handler(({ context }) =>
      context.db
        .select(productWithThumb)
        .from(product)
        .orderBy(desc(product.createdAt)),
    ),

  create: adminPriv
    .input(createProductSchema)
    .route({ method: "POST", path: "/admin/products/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(product).values(input).returning();
      return created!;
    }),

  update: adminPriv
    .input(updateProductSchema)
    .route({ method: "PATCH", path: "/admin/products/update" })
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

  delete: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/admin/products/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(product).where(eq(product.id, input.id));
      return { success: true };
    }),

  addVariant: adminPriv
    .input(createVariantSchema)
    .route({ method: "POST", path: "/admin/products/add-variant" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(productVariant).values(input).returning();
      return created!;
    }),

  updateVariant: adminPriv
    .input(updateVariantSchema)
    .route({ method: "PATCH", path: "/admin/products/update-variant" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(productVariant)
        .set(data)
        .where(eq(productVariant.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  addMedia: adminPriv
    .input(addMediaSchema)
    .route({ method: "POST", path: "/admin/products/add-media" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(productMedia).values(input).returning();
      return created!;
    }),

  deleteMedia: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/admin/products/delete-media" })
    .handler(async ({ context, input }) => {
      await context.db.delete(productMedia).where(eq(productMedia.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Categories Router ─────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/categories.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { category } from "@${scope}/db/schema";
import { createCategorySchema, updateCategorySchema } from "@${scope}/validators";
import { adminPriv, pub } from "../procedures";

export const categoriesRouter = {
  list: pub
    .route({ method: "GET", path: "/categories/list" })
    .handler(({ context }) =>
      context.db.select().from(category).orderBy(category.sortOrder),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/categories/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(category).where(eq(category.slug, input.slug)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  create: adminPriv
    .input(createCategorySchema)
    .route({ method: "POST", path: "/admin/categories/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(category).values(input).returning();
      return created!;
    }),

  update: adminPriv
    .input(updateCategorySchema)
    .route({ method: "PATCH", path: "/admin/categories/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db.update(category).set(data).where(eq(category.id, id)).returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/admin/categories/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(category).where(eq(category.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Cart Router ───────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/cart.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { cart, cartItem, product, productVariant } from "@${scope}/db/schema";
import { addToCartSchema, updateCartItemSchema } from "@${scope}/validators";
import { priv } from "../procedures";

async function getOrCreateCart(db: typeof import("@${scope}/db/client").db, userId: string) {
  const [existing] = await db.select().from(cart).where(eq(cart.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(cart).values({ userId }).returning();
  return created!;
}

export const cartRouter = {
  get: priv
    .route({ method: "GET", path: "/cart/get" })
    .handler(async ({ context }) => {
      const userCart = await getOrCreateCart(context.db, context.user.id);
      const items = await context.db
        .select({ id: cartItem.id, quantity: cartItem.quantity, product, variant: productVariant })
        .from(cartItem)
        .innerJoin(product, eq(cartItem.productId, product.id))
        .leftJoin(productVariant, eq(cartItem.variantId, productVariant.id))
        .where(eq(cartItem.cartId, userCart.id));
      return { cartId: userCart.id, items };
    }),

  add: priv
    .input(addToCartSchema)
    .route({ method: "POST", path: "/cart/add" })
    .handler(async ({ context, input }) => {
      const userCart = await getOrCreateCart(context.db, context.user.id);
      const condition = input.variantId
        ? and(eq(cartItem.cartId, userCart.id), eq(cartItem.productId, input.productId), eq(cartItem.variantId, input.variantId))
        : and(eq(cartItem.cartId, userCart.id), eq(cartItem.productId, input.productId));

      const [existing] = await context.db.select().from(cartItem).where(condition).limit(1);
      if (existing) {
        const [updated] = await context.db
          .update(cartItem)
          .set({ quantity: existing.quantity + input.quantity })
          .where(eq(cartItem.id, existing.id))
          .returning();
        return updated!;
      }
      const [created] = await context.db
        .insert(cartItem)
        .values({ cartId: userCart.id, ...input })
        .returning();
      return created!;
    }),

  update: priv
    .input(updateCartItemSchema)
    .route({ method: "PATCH", path: "/cart/update" })
    .handler(async ({ context, input }) => {
      if (input.quantity === 0) {
        await context.db.delete(cartItem).where(eq(cartItem.id, input.cartItemId));
        return { deleted: true };
      }
      const [updated] = await context.db
        .update(cartItem)
        .set({ quantity: input.quantity })
        .where(eq(cartItem.id, input.cartItemId))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  clear: priv
    .route({ method: "DELETE", path: "/cart/clear" })
    .handler(async ({ context }) => {
      const [userCart] = await context.db.select().from(cart).where(eq(cart.userId, context.user.id)).limit(1);
      if (userCart) await context.db.delete(cartItem).where(eq(cartItem.cartId, userCart.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Wishlist Router ───────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/wishlist.ts"] = `
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";

import { product, wishlist } from "@${scope}/db/schema";
import { priv } from "../procedures";

const thumbnailUrl = sql<string | null>\`(
  SELECT url FROM product_media
  WHERE product_media.product_id = \${product.id}
    AND product_media.type = 'image'
  ORDER BY product_media.sort_order ASC
  LIMIT 1
)\`;

export const wishlistRouter = {
  list: priv
    .route({ method: "GET", path: "/wishlist/list" })
    .handler(({ context }) =>
      context.db
        .select({ ...getTableColumns(product), thumbnailUrl })
        .from(wishlist)
        .innerJoin(product, eq(wishlist.productId, product.id))
        .where(eq(wishlist.userId, context.user.id))
        .orderBy(desc(wishlist.createdAt)),
    ),

  toggle: priv
    .input(z.object({ productId: z.string().uuid() }))
    .route({ method: "POST", path: "/wishlist/toggle" })
    .handler(async ({ context, input }) => {
      const [existing] = await context.db
        .select()
        .from(wishlist)
        .where(and(eq(wishlist.userId, context.user.id), eq(wishlist.productId, input.productId)))
        .limit(1);
      if (existing) {
        await context.db.delete(wishlist).where(eq(wishlist.id, existing.id));
        return { wishlisted: false };
      }
      await context.db.insert(wishlist).values({ userId: context.user.id, productId: input.productId });
      return { wishlisted: true };
    }),
};
`.trimStart();

    // ─── Addresses Router ──────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/addresses.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { address } from "@${scope}/db/schema";
import { createAddressSchema } from "@${scope}/validators";
import { priv } from "../procedures";

export const addressesRouter = {
  list: priv
    .route({ method: "GET", path: "/addresses/list" })
    .handler(({ context }) =>
      context.db.select().from(address).where(eq(address.userId, context.user.id)),
    ),

  add: priv
    .input(createAddressSchema)
    .route({ method: "POST", path: "/addresses/add" })
    .handler(async ({ context, input }) => {
      if (input.isDefault) {
        await context.db
          .update(address)
          .set({ isDefault: false })
          .where(eq(address.userId, context.user.id));
      }
      const [created] = await context.db
        .insert(address)
        .values({ ...input, userId: context.user.id })
        .returning();
      return created!;
    }),

  remove: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/addresses/remove" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(address).where(eq(address.id, input.id)).limit(1);
      if (!found || found.userId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(address).where(eq(address.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Delivery Zones Router ─────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/delivery-zones.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { deliveryZone } from "@${scope}/db/schema";
import { createDeliveryZoneSchema } from "@${scope}/validators";
import { adminPriv, pub } from "../procedures";

export const deliveryZonesRouter = {
  list: pub
    .route({ method: "GET", path: "/delivery-zones/list" })
    .handler(({ context }) =>
      context.db.select().from(deliveryZone).where(eq(deliveryZone.isActive, true)),
    ),

  create: adminPriv
    .input(createDeliveryZoneSchema)
    .route({ method: "POST", path: "/admin/delivery-zones/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(deliveryZone).values(input).returning();
      return created!;
    }),

  update: adminPriv
    .input(createDeliveryZoneSchema.partial().extend({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/admin/delivery-zones/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db.update(deliveryZone).set(data).where(eq(deliveryZone.id, id)).returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/admin/delivery-zones/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(deliveryZone).where(eq(deliveryZone.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Promo Codes Router ────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/promo-codes.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { promoCode } from "@${scope}/db/schema";
import { createPromoCodeSchema } from "@${scope}/validators";
import { adminPriv, pub } from "../procedures";

export const promoCodesRouter = {
  validate: pub
    .input(z.object({ code: z.string(), orderTotal: z.number() }))
    .route({ method: "POST", path: "/promo-codes/validate" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(promoCode)
        .where(eq(promoCode.code, input.code.toUpperCase()))
        .limit(1);

      if (!found || !found.isActive) throw new ORPCError("NOT_FOUND", { message: "Invalid promo code" });
      if (found.expiresAt && found.expiresAt < new Date()) throw new ORPCError("BAD_REQUEST", { message: "Promo code expired" });
      if (found.maxUses && found.usedCount >= found.maxUses) throw new ORPCError("BAD_REQUEST", { message: "Promo code usage limit reached" });
      if (found.minOrderValue && input.orderTotal < parseFloat(found.minOrderValue)) {
        throw new ORPCError("BAD_REQUEST", { message: \`Minimum order value is \${found.minOrderValue}\` });
      }

      const discount = found.discountType === "percentage"
        ? (input.orderTotal * parseFloat(found.discountValue)) / 100
        : parseFloat(found.discountValue);

      return { valid: true, discount: Math.min(discount, input.orderTotal), promoCodeId: found.id };
    }),

  adminList: adminPriv
    .route({ method: "GET", path: "/admin/promo-codes/list" })
    .handler(({ context }) => context.db.select().from(promoCode)),

  create: adminPriv
    .input(createPromoCodeSchema)
    .route({ method: "POST", path: "/admin/promo-codes/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(promoCode)
        .values({ ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined })
        .returning();
      return created!;
    }),

  toggle: adminPriv
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .route({ method: "PATCH", path: "/admin/promo-codes/toggle" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(promoCode)
        .set({ isActive: input.isActive })
        .where(eq(promoCode.id, input.id))
        .returning();
      return updated!;
    }),
};
`.trimStart();

    // ─── Reviews Router ────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/reviews.ts"] = `
import { avg, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { review } from "@${scope}/db/schema";
import { createReviewSchema } from "@${scope}/validators";
import { priv, pub } from "../procedures";

export const reviewsRouter = {
  list: pub
    .input(z.object({ productId: z.string().uuid() }))
    .route({ method: "GET", path: "/reviews/list" })
    .handler(({ context, input }) =>
      context.db
        .select()
        .from(review)
        .where(eq(review.productId, input.productId))
        .orderBy(desc(review.createdAt))
        .limit(20),
    ),

  ratingFor: pub
    .input(z.object({ productId: z.string().uuid() }))
    .route({ method: "GET", path: "/reviews/rating" })
    .handler(async ({ context, input }) => {
      const [result] = await context.db
        .select({ average: avg(review.rating), total: count(review.id) })
        .from(review)
        .where(eq(review.productId, input.productId));
      return { average: Number(result?.average ?? 0), total: Number(result?.total ?? 0) };
    }),

  create: priv
    .input(createReviewSchema)
    .route({ method: "POST", path: "/reviews/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(review)
        .values({ ...input, userId: context.user.id })
        .returning();
      return created!;
    }),
};
`.trimStart();

    // ─── Orders Router ─────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/orders.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { address, cart, cartItem, deliveryZone, order, orderItem, promoCode, product, productVariant } from "@${scope}/db/schema";
import { createOrderSchema } from "@${scope}/validators";
import { adminPriv, priv } from "../procedures";

export const ordersRouter = {
  create: priv
    .input(createOrderSchema)
    .route({ method: "POST", path: "/orders/create" })
    .handler(async ({ context, input }) => {
      // Fetch products + variants
      const productIds = input.items.map((i) => i.productId);
      const products   = await context.db.select().from(product).where(inArray(product.id, productIds));
      const variantIds = input.items.map((i) => i.variantId).filter(Boolean) as string[];
      const variants   = variantIds.length
        ? await context.db.select().from(productVariant).where(inArray(productVariant.id, variantIds))
        : [];

      // Calculate subtotal
      const subtotal = input.items.reduce((sum, item) => {
        const p = products.find((p) => p.id === item.productId);
        if (!p) throw new ORPCError("BAD_REQUEST", { message: \`Product \${item.productId} not found\` });
        const v = variants.find((v) => v.id === item.variantId);
        return sum + parseFloat(v?.price ?? p.price) * item.quantity;
      }, 0);

      // Resolve shipping address snapshot
      let shipFields: Record<string, string | undefined> = {};
      if (input.addressId) {
        const [addr] = await context.db.select().from(address).where(eq(address.id, input.addressId)).limit(1);
        if (addr) {
          shipFields = { shipFullName: addr.fullName, shipPhone: addr.phone, shipLine1: addr.line1,
            shipLine2: addr.line2 ?? undefined, shipCity: addr.city, shipState: addr.state, shipCountry: addr.country };
        }
      } else {
        shipFields = { shipFullName: input.shipFullName, shipPhone: input.shipPhone, shipLine1: input.shipLine1,
          shipLine2: input.shipLine2, shipCity: input.shipCity, shipState: input.shipState, shipCountry: input.shipCountry };
      }

      // Resolve delivery zone
      let shippingPrice = 0;
      if (input.deliveryZoneId) {
        const [zone] = await context.db.select().from(deliveryZone).where(eq(deliveryZone.id, input.deliveryZoneId)).limit(1);
        if (zone) {
          shippingPrice = zone.freeShippingThreshold && subtotal >= parseFloat(zone.freeShippingThreshold)
            ? 0
            : parseFloat(zone.price);
        }
      }

      // Validate promo code
      let discount   = 0;
      let promoCodeId: string | undefined;
      if (input.promoCode) {
        const [promo] = await context.db.select().from(promoCode).where(eq(promoCode.code, input.promoCode.toUpperCase())).limit(1);
        if (promo && promo.isActive && (!promo.expiresAt || promo.expiresAt > new Date())) {
          discount    = promo.discountType === "percentage"
            ? (subtotal * parseFloat(promo.discountValue)) / 100
            : parseFloat(promo.discountValue);
          promoCodeId = promo.id;
          await context.db.update(promoCode).set({ usedCount: promo.usedCount + 1 }).where(eq(promoCode.id, promo.id));
        }
      }

      const total = Math.max(0, subtotal - discount + shippingPrice);

      const [created] = await context.db.insert(order).values({
        userId:         context.user.id,
        paymentMethod:  input.paymentMethod as "bank_transfer",
        subtotal:       subtotal.toFixed(2),
        discount:       discount.toFixed(2),
        shippingPrice:  shippingPrice.toFixed(2),
        total:          total.toFixed(2),
        promoCodeId,
        deliveryZoneId: input.deliveryZoneId,
        ...shipFields,
      }).returning();

      await context.db.insert(orderItem).values(
        input.items.map((item) => {
          const p = products.find((p) => p.id === item.productId)!;
          const v = variants.find((v) => v.id === item.variantId);
          return {
            orderId:   created!.id,
            productId: item.productId,
            variantId: item.variantId,
            name:      v ? \`\${p.name} – \${v.name}\` : p.name,
            quantity:  item.quantity,
            unitPrice: v?.price ?? p.price,
          };
        }),
      );

      // Clear cart
      const [userCart] = await context.db.select().from(cart).where(eq(cart.userId, context.user.id)).limit(1);
      if (userCart) await context.db.delete(cartItem).where(eq(cartItem.cartId, userCart.id));

      return created!;
    }),

  myOrders: priv
    .route({ method: "GET", path: "/orders/mine" })
    .handler(({ context }) =>
      context.db
        .select()
        .from(order)
        .where(eq(order.userId, context.user.id))
        .orderBy(desc(order.createdAt)),
    ),

  get: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/orders/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.userId, context.user.id)))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      const items = await context.db.select().from(orderItem).where(eq(orderItem.orderId, found.id));
      return { ...found, items };
    }),

  cancel: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "POST", path: "/orders/cancel" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.userId, context.user.id)))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (!["pending", "paid"].includes(found.status)) {
        throw new ORPCError("BAD_REQUEST", { message: "Order cannot be cancelled at this stage" });
      }
      const [updated] = await context.db
        .update(order)
        .set({ status: "cancelled" })
        .where(eq(order.id, input.id))
        .returning();
      return updated!;
    }),

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminList: adminPriv
    .route({ method: "GET", path: "/admin/orders/list" })
    .handler(({ context }) =>
      context.db.select().from(order).orderBy(desc(order.createdAt)),
    ),

  adminUpdateStatus: adminPriv
    .input(z.object({ id: z.string().uuid(), status: z.enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"]), trackingNumber: z.string().optional() }))
    .route({ method: "PATCH", path: "/admin/orders/update-status" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(order)
        .set({ status: input.status, trackingNumber: input.trackingNumber })
        .where(eq(order.id, input.id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),
};
`.trimStart();

    // ─── Payments Routers ──────────────────────────────────────────────────────
    if (hasPaystack) {
      files["packages/api/src/orpc-routers/payments/paystack.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { order } from "@${scope}/db/schema";
import { priv } from "../../procedures";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

export const paystackRouter = {
  initiate: priv
    .input(z.object({ orderId: z.string().uuid() }))
    .route({ method: "POST", path: "/payments/paystack/initiate" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(order).where(eq(order.id, input.orderId)).limit(1);
      if (!found || found.userId !== context.user.id) throw new ORPCError("NOT_FOUND");

      const reference = \`qs_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${PAYSTACK_SECRET}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email:     context.user.email,
          amount:    Math.round(parseFloat(found.total) * 100),
          reference,
          metadata:  { orderId: found.id },
        }),
      });

      const data = await res.json() as { status: boolean; data?: { authorization_url: string; reference: string } };
      if (!data.status || !data.data) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Paystack init failed" });

      await context.db.update(order).set({ paystackRef: reference }).where(eq(order.id, found.id));
      return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
    }),

  verify: priv
    .input(z.object({ reference: z.string() }))
    .route({ method: "POST", path: "/payments/paystack/verify" })
    .handler(async ({ context, input }) => {
      const res = await fetch(\`https://api.paystack.co/transaction/verify/\${encodeURIComponent(input.reference)}\`, {
        headers: { Authorization: \`Bearer \${PAYSTACK_SECRET}\` },
      });
      const data = await res.json() as { status: boolean; data?: { status: string; metadata?: { orderId?: string } } };
      if (!data.status || data.data?.status !== "success") {
        throw new ORPCError("BAD_REQUEST", { message: "Payment not completed" });
      }

      const orderId = data.data.metadata?.orderId;
      if (orderId) {
        await context.db.update(order).set({ status: "paid" }).where(eq(order.id, orderId));
      }
      return { success: true };
    }),
};
`.trimStart();
    }

    if (hasStripe) {
      files["packages/api/src/orpc-routers/payments/stripe.ts"] = `
import { ORPCError } from "@orpc/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { order } from "@${scope}/db/schema";
import { priv } from "../../procedures";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-04-30.basil" });

export const stripeRouter = {
  createCheckout: priv
    .input(z.object({ orderId: z.string().uuid() }))
    .route({ method: "POST", path: "/payments/stripe/checkout" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(order).where(eq(order.id, input.orderId)).limit(1);
      if (!found || found.userId !== context.user.id) throw new ORPCError("NOT_FOUND");

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(parseFloat(found.total) * 100),
          product_data: { name: \`Order #\${found.id.slice(0, 8).toUpperCase()}\` } }, quantity: 1 }],
        success_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/orders/\${found.id}?status=paid\`,
        cancel_url:  \`\${process.env.NEXT_PUBLIC_WEB_URL}/checkout\`,
        metadata:    { orderId: found.id },
      });

      await context.db.update(order).set({ stripePaymentIntentId: session.payment_intent as string }).where(eq(order.id, found.id));
      return { url: session.url! };
    }),
};
`.trimStart();
    }

    // ─── Router Index ──────────────────────────────────────────────────────────
    const paymentImports = [
      hasPaystack ? `import { paystackRouter } from "./payments/paystack";` : "",
      hasStripe   ? `import { stripeRouter }   from "./payments/stripe";`   : "",
    ].filter(Boolean).join("\n");

    const paymentRouters = [
      hasPaystack || hasStripe ? "  payments: {" : "",
      hasPaystack ? "    paystack: paystackRouter," : "",
      hasStripe   ? "    stripe:   stripeRouter,"   : "",
      hasPaystack || hasStripe ? "  }," : "",
    ].filter(Boolean).join("\n");

    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }          from "./auth";
import { productsRouter }      from "./products";
import { categoriesRouter }    from "./categories";
import { cartRouter }          from "./cart";
import { wishlistRouter }      from "./wishlist";
import { ordersRouter }        from "./orders";
import { addressesRouter }     from "./addresses";
import { deliveryZonesRouter } from "./delivery-zones";
import { promoCodesRouter }    from "./promo-codes";
import { reviewsRouter }       from "./reviews";
${paymentImports}

export const appRouter = {
  auth:          authRouter,
  products:      productsRouter,
  categories:    categoriesRouter,
  cart:          cartRouter,
  wishlist:      wishlistRouter,
  orders:        ordersRouter,
  addresses:     addressesRouter,
  deliveryZones: deliveryZonesRouter,
  promoCodes:    promoCodesRouter,
  reviews:       reviewsRouter,
${paymentRouters}
};

export type AppRouter = typeof appRouter;
`.trimStart();

    // ─── server-orpc.ts for web app ────────────────────────────────────────────
    files["apps/web/src/lib/server-orpc.ts"] = `
import "server-only";
import { createRouterClient } from "@orpc/server";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { appRouter } from "@${scope}/api";

// Authenticated caller — forwards request headers so auth middleware reads the session.
export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, { context: { headers: h as unknown as Headers } });
}

// Public caller — no auth, direct DB access.
const publicCaller = createRouterClient(appRouter, { context: { headers: new Headers() } });
export { publicCaller };

// ── Cached public queries (5-minute TTL, invalidated by tag) ──────────────────
export const getCachedCategories       = unstable_cache(() => publicCaller.categories.list(),       ["categories"],        { revalidate: 300, tags: ["categories"] });
export const getCachedFeaturedProducts = unstable_cache(() => publicCaller.products.featured(),     ["products-featured"], { revalidate: 300, tags: ["products"] });
export const getCachedNewArrivals      = unstable_cache(() => publicCaller.products.newArrivals(),  ["products-new"],      { revalidate: 300, tags: ["products"] });
export const getCachedOnSale           = unstable_cache(() => publicCaller.products.onSale(),       ["products-sale"],     { revalidate: 300, tags: ["products"] });
export const getCachedBestSellers      = unstable_cache(() => publicCaller.products.bestSellers(),  ["products-best"],     { revalidate: 300, tags: ["products"] });
`.trimStart();

    // ─── Webhook: Paystack ─────────────────────────────────────────────────────
    if (hasPaystack) {
      files["apps/web/src/app/api/webhooks/paystack/route.ts"] = `
import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@${scope}/db/client";
import { order, promoCode } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const body      = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  const secret    = process.env.PAYSTACK_SECRET_KEY!;

  const expected = createHmac("sha512", secret).update(body).digest("hex");
  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    data:  { reference?: string; metadata?: { orderId?: string } };
  };

  if (event.event === "charge.success") {
    const orderId = event.data.metadata?.orderId;
    if (orderId) {
      const [found] = await db.select().from(order).where(eq(order.id, orderId)).limit(1);
      if (found && found.status === "pending") {
        await db.update(order).set({ status: "paid", paystackRef: event.data.reference }).where(eq(order.id, orderId));

        // Increment promo code usage if present
        if (found.promoCodeId) {
          const [promo] = await db.select().from(promoCode).where(eq(promoCode.id, found.promoCodeId)).limit(1);
          if (promo) await db.update(promoCode).set({ usedCount: promo.usedCount + 1 }).where(eq(promoCode.id, promo.id));
        }

        // TODO: Send order confirmation email via packages/email
      }
    }
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Webhook: Stripe (real e-commerce implementation) ─────────────────────
    if (hasStripe) {
      files["apps/web/src/app/api/webhooks/stripe/route.ts"] = `
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@${scope}/db/client";
import { order } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-04-30.basil" });

export async function POST(req: Request) {
  const body = await req.text();
  const sig  = (await headers()).get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (orderId && session.payment_status === "paid") {
        await db.update(order)
          .set({ status: "paid", stripePaymentIntentId: session.payment_intent as string })
          .where(eq(order.id, orderId));
        // TODO: Send order confirmation email via packages/email
      }
      break;
    }
    case "charge.refunded": {
      const charge  = event.data.object as Stripe.Charge;
      const orderId = (charge.metadata as Record<string, string>)?.orderId;
      if (orderId) {
        await db.update(order).set({ status: "refunded" }).where(eq(order.id, orderId));
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── SSE: Real-time order status ───────────────────────────────────────────
    files["apps/web/src/app/api/orders/[id]/events/route.ts"] = `
import { type NextRequest } from "next/server";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { order } from "@${scope}/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(req.headers);
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        if (!closed) controller.enqueue(encoder.encode(\`data: \${JSON.stringify(payload)}\\n\\n\`));
      };

      const [row] = await db
        .select({ status: order.status, trackingNumber: order.trackingNumber })
        .from(order)
        .where(and(eq(order.id, id), eq(order.userId, session.user.id)))
        .limit(1);

      if (!row) { controller.close(); return; }

      let lastStatus   = row.status;
      let lastTracking = row.trackingNumber;
      send({ status: lastStatus, trackingNumber: lastTracking });

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return; }
        try {
          const [current] = await db
            .select({ status: order.status, trackingNumber: order.trackingNumber })
            .from(order).where(eq(order.id, id)).limit(1);

          if (!current) { clearInterval(interval); controller.close(); return; }

          if (current.status !== lastStatus || current.trackingNumber !== lastTracking) {
            lastStatus = current.status; lastTracking = current.trackingNumber;
            send({ status: lastStatus, trackingNumber: lastTracking });
          }
        } catch { clearInterval(interval); if (!closed) controller.close(); }
      }, 4000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
`.trimStart();

    // ─── Web UI: Homepage ──────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import {
  getCachedFeaturedProducts,
  getCachedNewArrivals,
  getCachedOnSale,
  getCachedBestSellers,
  getCachedCategories,
} from "@/lib/server-orpc";

export default async function HomePage() {
  const [featured, newArrivals, onSale, bestSellers, categories] = await Promise.all([
    getCachedFeaturedProducts(),
    getCachedNewArrivals(),
    getCachedOnSale(),
    getCachedBestSellers(),
    getCachedCategories(),
  ]);

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white text-center py-24 px-4">
        <h1 className="text-5xl font-bold mb-4">Welcome to Our Store</h1>
        <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">
          Curated products, delivered fast.
        </p>
        <Link href="/products" className="bg-white text-slate-900 px-8 py-3 rounded-full font-semibold hover:bg-slate-100">
          Shop Now
        </Link>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-semibold mb-6">Shop by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <Link key={cat.id} href={\`/products?category=\${cat.slug}\`}
                className="bg-slate-50 rounded-xl p-6 text-center hover:bg-slate-100 transition-colors">
                <p className="font-medium">{cat.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Featured</h2>
            <Link href="/products?featured=true" className="text-sm text-slate-500 hover:underline">View all →</Link>
          </div>
          <ProductGrid products={featured} />
        </section>
      )}

      {/* Best Sellers */}
      {bestSellers.length > 0 && (
        <section className="bg-slate-50 py-12">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-2xl font-semibold mb-6">Best Sellers</h2>
            <ProductGrid products={bestSellers} />
          </div>
        </section>
      )}

      {/* New Arrivals */}
      {newArrivals.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">New Arrivals</h2>
            <Link href="/products?sort=newest" className="text-sm text-slate-500 hover:underline">Shop new →</Link>
          </div>
          <ProductGrid products={newArrivals} />
        </section>
      )}

      {/* On Sale */}
      {onSale.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <h2 className="text-2xl font-semibold mb-6">On Sale</h2>
          <ProductGrid products={onSale} />
        </section>
      )}
    </main>
  );
}

// Inline product grid so this file is self-contained at generation time.
function ProductGrid({ products }: { products: { id: string; name: string; slug: string; price: string; comparePrice?: string | null; thumbnailUrl?: string | null; stock: number }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map((p) => (
        <Link key={p.id} href={\`/products/\${p.slug}\`}
          className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
          <div className="aspect-square bg-slate-50 flex items-center justify-center text-4xl">
            {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover" /> : "📦"}
          </div>
          <div className="p-3">
            <p className="font-medium text-sm truncate">{p.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-bold text-slate-900">\${parseFloat(p.price).toLocaleString()}</span>
              {p.comparePrice && parseFloat(p.comparePrice) > parseFloat(p.price) && (
                <span className="text-xs text-slate-400 line-through">\${parseFloat(p.comparePrice).toLocaleString()}</span>
              )}
            </div>
            {p.stock === 0 && <p className="text-xs text-red-500 mt-0.5">Out of stock</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
`.trimStart();

    // ─── Web UI: Products listing ──────────────────────────────────────────────
    files["apps/web/src/app/products/page.tsx"] = `
import Link from "next/link";
import { publicCaller, getCachedCategories } from "@/lib/server-orpc";

interface Props {
  searchParams: Promise<{ category?: string; search?: string; sort?: string; cursor?: string }>;
}

export default async function ProductsPage({ searchParams }: Props) {
  const params     = await searchParams;
  const categories = await getCachedCategories();
  const cat        = params.category ? categories.find((c) => c.slug === params.category) : undefined;

  const { items, hasMore, nextCursor } = await publicCaller.products.list({
    categoryId: cat?.id,
    search:     params.search,
    sort:       params.sort as "newest" | "price_asc" | "price_desc" | undefined,
    cursor:     params.cursor,
    limit:      24,
  });

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <aside className="w-full md:w-48 shrink-0 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Categories</p>
            <Link href="/products" className={\`block text-sm py-1 \${!params.category ? "font-semibold" : "text-slate-600 hover:text-slate-900"}\`}>All Products</Link>
            {categories.map((c) => (
              <Link key={c.id} href={\`/products?category=\${c.slug}\`}
                className={\`block text-sm py-1 \${params.category === c.slug ? "font-semibold" : "text-slate-600 hover:text-slate-900"}\`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sort</p>
            {[["newest","Newest"], ["price_asc","Price ↑"], ["price_desc","Price ↓"]].map(([v, label]) => (
              <Link key={v} href={\`/products?\${new URLSearchParams({ ...params, sort: v }).toString()}\`}
                className={\`block text-sm py-1 \${params.sort === v ? "font-semibold" : "text-slate-600 hover:text-slate-900"}\`}>
                {label}
              </Link>
            ))}
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1">
          <p className="text-sm text-slate-500 mb-4">{items.length} product{items.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((p) => (
              <Link key={p.id} href={\`/products/\${p.slug}\`}
                className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-slate-50 flex items-center justify-center">
                  {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover" /> : <span className="text-4xl">📦</span>}
                </div>
                <div className="p-3">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="font-bold mt-1">\${parseFloat(p.price).toLocaleString()}</p>
                  {p.stock === 0 && <p className="text-xs text-red-500">Out of stock</p>}
                </div>
              </Link>
            ))}
          </div>
          {hasMore && nextCursor && (
            <div className="mt-8 text-center">
              <a href={\`?cursor=\${nextCursor}\`} className="border border-slate-300 px-6 py-2 rounded-full text-sm hover:bg-slate-50">
                Load more
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
`.trimStart();

    // ─── Web UI: Product detail ────────────────────────────────────────────────
    files["apps/web/src/app/products/[slug]/page.tsx"] = `
"use client";

import { notFound } from "next/navigation";
import { publicCaller } from "@/lib/server-orpc";
import { ProductDetailClient } from "./product-detail-client";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const product = await publicCaller.products.get({ slug });
    return { title: product.name, description: product.description ?? undefined };
  } catch { return { title: "Product not found" }; }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  let product: Awaited<ReturnType<typeof publicCaller.products.get>>;
  try { product = await publicCaller.products.get({ slug }); } catch { notFound(); }

  const [ratingData, relatedData] = await Promise.allSettled([
    publicCaller.reviews.ratingFor({ productId: product.id }),
    publicCaller.products.relatedProducts({ productId: product.id, categoryId: product.categoryId ?? undefined }),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <ProductDetailClient
        product={product}
        rating={ratingData.status === "fulfilled" ? ratingData.value : { average: 0, total: 0 }}
        related={relatedData.status === "fulfilled" ? relatedData.value : []}
      />
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/products/[slug]/product-detail-client.tsx"] = `
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { orpc } from "@/lib/orpc";

type Product = Awaited<ReturnType<typeof import("@/lib/server-orpc").publicCaller.products.get>>;
type Rating  = { average: number; total: number };
type Related = Awaited<ReturnType<typeof import("@/lib/server-orpc").publicCaller.products.relatedProducts>>;

export function ProductDetailClient({ product, rating, related }: { product: Product; rating: Rating; related: Related }) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? "");
  const [qty,      setQty]      = useState(1);
  const [adding,   setAdding]   = useState(false);
  const [added,    setAdded]    = useState(false);
  const router = useRouter();

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const price  = parseFloat(selectedVariant?.price ?? product.price);
  const inStock = (selectedVariant?.stock ?? product.stock) > 0;
  const mainImage = product.media[0]?.url;

  async function addToCart() {
    if (!inStock || adding) return;
    setAdding(true);
    try {
      await orpc.cart.add({ productId: product.id, variantId: selectedVariantId || undefined, quantity: qty });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "UNAUTHORIZED") {
        router.push("/login");
      }
    } finally { setAdding(false); }
  }

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Images */}
        <div>
          <div className="aspect-square bg-slate-50 rounded-2xl overflow-hidden mb-3">
            {mainImage ? <img src={mainImage} alt={product.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-6xl">📦</div>}
          </div>
          {product.media.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {product.media.map((m) => (
                <div key={m.id} className="w-16 h-16 rounded-xl bg-slate-50 overflow-hidden shrink-0">
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {rating.total > 0 && (
            <p className="text-sm text-slate-500">{"★".repeat(Math.round(rating.average))} ({rating.total} review{rating.total !== 1 ? "s" : ""})</p>
          )}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">\${price.toLocaleString()}</span>
            {product.comparePrice && parseFloat(product.comparePrice) > price && (
              <span className="text-slate-400 line-through">\${parseFloat(product.comparePrice).toLocaleString()}</span>
            )}
          </div>
          {product.description && <p className="text-slate-600 leading-relaxed">{product.description}</p>}

          {product.variants.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Option</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button key={v.id} onClick={() => setSelectedVariantId(v.id)}
                    className={\`border px-3 py-1.5 rounded-lg text-sm \${selectedVariantId === v.id ? "border-slate-900 font-semibold" : "border-slate-200 hover:border-slate-400"}\`}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-8 h-8 rounded-full border flex items-center justify-center">−</button>
            <span className="w-8 text-center font-medium">{qty}</span>
            <button onClick={() => setQty(qty + 1)} className="w-8 h-8 rounded-full border flex items-center justify-center">+</button>
          </div>

          <button onClick={addToCart} disabled={!inStock || adding}
            className="w-full bg-slate-900 text-white py-3 rounded-full font-semibold hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {!inStock ? "Out of Stock" : adding ? "Adding…" : added ? "Added ✓" : "Add to Cart"}
          </button>

          <Link href="/cart" className="block text-center text-sm text-slate-500 hover:underline">View Cart →</Link>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">You might also like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => (
              <Link key={p.id} href={\`/products/\${p.slug}\`} className="bg-white border border-slate-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-slate-50">
                  {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
                </div>
                <div className="p-3">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="font-bold mt-0.5">\${parseFloat(p.price).toLocaleString()}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
`.trimStart();

    // ─── Web UI: Cart ──────────────────────────────────────────────────────────
    files["apps/web/src/app/cart/page.tsx"] = `
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { orpc } from "@/lib/orpc";

interface CartItem {
  id: string; quantity: number;
  product: { id: string; name: string; slug: string; price: string };
  variant:  { id: string; name: string; price: string | null } | null;
}

export default function CartPage() {
  const [items,   setItems]   = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    orpc.cart.get().then((data) => {
      const normalized = (data.items ?? []).map((i) => ({
        id: i.id, quantity: i.quantity,
        product: { id: i.product.id, name: i.product.name, slug: i.product.slug, price: i.product.price },
        variant: i.variant?.id ? { id: i.variant.id, name: i.variant.name, price: i.variant.price } : null,
      }));
      setItems(normalized);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function updateQty(cartItemId: string, quantity: number) {
    setUpdating(cartItemId);
    try {
      await orpc.cart.update({ cartItemId, quantity });
      if (quantity === 0) setItems((prev) => prev.filter((i) => i.id !== cartItemId));
      else setItems((prev) => prev.map((i) => i.id === cartItemId ? { ...i, quantity } : i));
    } catch { /* silently ignore */ } finally { setUpdating(null); }
  }

  const subtotal = items.reduce((s, i) => s + parseFloat(i.variant?.price ?? i.product.price) * i.quantity, 0);

  if (loading) return <main className="max-w-4xl mx-auto px-4 py-10 text-center text-slate-400">Loading cart…</main>;

  if (!items.length) return (
    <main className="max-w-4xl mx-auto px-4 py-20 text-center">
      <p className="text-5xl mb-4">🛒</p>
      <p className="text-slate-500 mb-6">Your cart is empty</p>
      <Link href="/products" className="bg-slate-900 text-white px-6 py-3 rounded-full font-medium hover:bg-slate-700">
        Start Shopping
      </Link>
    </main>
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-3">
          {items.map((item) => {
            const price = parseFloat(item.variant?.price ?? item.product.price);
            return (
              <div key={item.id} className="flex gap-4 bg-white rounded-xl border border-slate-100 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.product.name}</p>
                  {item.variant && <p className="text-xs text-slate-400">{item.variant.name}</p>}
                  <p className="font-bold mt-1">\${price.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, item.quantity - 1)} disabled={updating === item.id}
                    className="w-7 h-7 rounded-full border flex items-center justify-center hover:border-slate-400">−</button>
                  <span className="w-5 text-center text-sm">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, item.quantity + 1)} disabled={updating === item.id}
                    className="w-7 h-7 rounded-full border flex items-center justify-center hover:border-slate-400">+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5 h-fit space-y-4">
          <h2 className="font-semibold">Order Summary</h2>
          <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-medium">\${subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm text-slate-500"><span>Shipping</span><span>Calculated at checkout</span></div>
          <hr className="border-slate-100" />
          <div className="flex justify-between font-bold"><span>Total</span><span>\${subtotal.toLocaleString()}</span></div>
          <Link href="/checkout" className="block w-full bg-slate-900 text-white text-center py-3 rounded-full font-semibold hover:bg-slate-700">
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </main>
  );
}
`.trimStart();

    // ─── Web UI: Order detail with SSE live status ─────────────────────────────
    files["apps/web/src/app/orders/[id]/page.tsx"] = `
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { order, orderItem } from "@${scope}/db/schema";
import { and, eq } from "drizzle-orm";
import { OrderStatusTracker } from "./order-status-tracker";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Order Placed", paid: "Payment Confirmed", processing: "Being Prepared",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};

export default async function OrderPage({ params, searchParams }: Props) {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  const { id }     = await params;
  const { status } = await searchParams;

  const [found] = await db.select().from(order)
    .where(and(eq(order.id, id), eq(order.userId, session.user.id))).limit(1);
  if (!found) notFound();

  const items = await db.select().from(orderItem).where(eq(orderItem.orderId, found.id));

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {status === "paid" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 text-center">
          <p className="text-2xl mb-1">🎉</p>
          <p className="font-semibold text-green-800">Payment confirmed! We'll start packing right away.</p>
        </div>
      )}

      <Link href="/dashboard/orders" className="text-sm text-slate-500 hover:underline mb-6 inline-block">← Back to orders</Link>

      <div className="bg-white rounded-xl border border-slate-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Order #{id.slice(0, 8).toUpperCase()}</h1>
          <OrderStatusTracker orderId={id} initialStatus={found.status} initialTracking={found.trackingNumber} statusLabels={STATUS_LABELS} />
        </div>

        <h2 className="font-semibold mb-3">Items</h2>
        <div className="space-y-2 mb-4">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-slate-700">{item.name} × {item.quantity}</span>
              <span className="font-medium">\${(parseFloat(item.unitPrice) * item.quantity).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <hr className="border-slate-100 mb-4" />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>\${parseFloat(found.subtotal).toLocaleString()}</span></div>
          <div className="flex justify-between text-slate-600"><span>Shipping</span><span>\${parseFloat(found.shippingPrice).toLocaleString()}</span></div>
          {parseFloat(found.discount) > 0 && (
            <div className="flex justify-between text-green-600"><span>Discount</span><span>-\${parseFloat(found.discount).toLocaleString()}</span></div>
          )}
          <div className="flex justify-between font-bold text-base pt-2"><span>Total</span><span>\${parseFloat(found.total).toLocaleString()}</span></div>
        </div>
      </div>

      {found.shipLine1 && (
        <div className="bg-white rounded-xl border border-slate-100 p-6">
          <h2 className="font-semibold mb-2">Delivery Address</h2>
          <p className="text-sm text-slate-700">{found.shipFullName} · {found.shipPhone}</p>
          <p className="text-sm text-slate-500">{found.shipLine1}, {found.shipCity}, {found.shipState}</p>
        </div>
      )}
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/orders/[id]/order-status-tracker.tsx"] = `
"use client";

import { useEffect, useState } from "react";

const STATUS_STEPS = ["pending", "paid", "processing", "shipped", "delivered"] as const;

interface Props {
  orderId:        string;
  initialStatus:  string;
  initialTracking: string | null;
  statusLabels:   Record<string, string>;
}

export function OrderStatusTracker({ orderId, initialStatus, initialTracking, statusLabels }: Props) {
  const [status,   setStatus]   = useState(initialStatus);
  const [tracking, setTracking] = useState(initialTracking);

  useEffect(() => {
    const es = new EventSource(\`/api/orders/\${orderId}/events\`);
    es.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as { status: string; trackingNumber: string | null };
      setStatus(data.status);
      setTracking(data.trackingNumber);
    };
    return () => es.close();
  }, [orderId]);

  const currentStep = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);

  return (
    <div className="w-full">
      <span className={\`text-xs font-medium px-3 py-1 rounded-full \${
        status === "delivered" ? "bg-green-100 text-green-700" :
        status === "cancelled" ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-700"
      }\`}>
        {statusLabels[status] ?? status}
      </span>

      {!["cancelled", "refunded"].includes(status) && (
        <div className="flex items-center gap-1 mt-4 overflow-x-auto">
          {STATUS_STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className="flex flex-col items-center min-w-[56px]">
                <div className={\`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium \${
                  i <= currentStep ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"
                }\`}>
                  {i < currentStep ? "✓" : i + 1}
                </div>
                <p className="text-xs text-slate-500 mt-1 text-center leading-tight">{statusLabels[s]}</p>
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div className={\`h-0.5 w-6 mx-1 mb-4 \${i < currentStep ? "bg-slate-900" : "bg-slate-100"}\`} />
              )}
            </div>
          ))}
        </div>
      )}

      {tracking && (
        <div className="mt-3 bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500">Tracking Number</p>
          <p className="font-medium text-slate-800">{tracking}</p>
        </div>
      )}
    </div>
  );
}
`.trimStart();

    // ─── Admin: Products page ──────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/products/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { product, staffRole } from "@${scope}/db/schema";
import { desc, eq } from "drizzle-orm";

export default async function AdminProductsPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");
  const [staff] = await db.select().from(staffRole).where(eq(staffRole.userId, session.user.id)).limit(1);
  if (!staff) redirect("/dashboard");

  const products = await db.select().from(product).orderBy(desc(product.createdAt));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link href="/products/new" className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700">
          + New Product
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Price</th>
              <th className="text-left px-4 py-3 font-medium">Stock</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">\${parseFloat(p.price).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={p.stock === 0 ? "text-red-500" : p.stock < 5 ? "text-amber-600" : "text-slate-700"}>
                    {p.stock} {p.stock === 0 ? "— Out of stock" : p.stock < 5 ? "— Low" : ""}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={\`text-xs px-2 py-0.5 rounded-full font-medium \${
                    p.status === "active" ? "bg-green-100 text-green-700" :
                    p.status === "archived" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"
                  }\`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="text-center text-slate-400 py-12">No products yet.</p>
        )}
      </div>
    </main>
  );
}
`.trimStart();

    // ─── Admin: Orders page ────────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/orders/page.tsx"] = `
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { order, staffRole } from "@${scope}/db/schema";
import { desc, eq } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", paid: "Paid", processing: "Processing",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700", paid: "bg-blue-100 text-blue-700",
  processing: "bg-purple-100 text-purple-700", shipped: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-500", refunded: "bg-slate-100 text-slate-500",
};

export default async function AdminOrdersPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");
  const [staff] = await db.select().from(staffRole).where(eq(staffRole.userId, session.user.id)).limit(1);
  if (!staff) redirect("/dashboard");

  const orders = await db.select().from(order).orderBy(desc(order.createdAt));

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Orders ({orders.length})</h1>
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Order</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Total</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{o.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium">\${parseFloat(o.total).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={\`text-xs px-2 py-0.5 rounded-full font-medium \${STATUS_COLORS[o.status] ?? "bg-slate-100"}\`}>
                    {STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <p className="text-center text-slate-400 py-12">No orders yet.</p>}
      </div>
    </main>
  );
}
`.trimStart();

    // ─── Web: Dashboard ────────────────────────────────────────────────────────
    files["apps/web/src/app/(protected)/dashboard/page.tsx"] = `
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { order } from "@${scope}/db/schema";
import { desc, eq } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending", paid: "Paid", processing: "Processing",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled",
};

export default async function DashboardPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  const orders = await db.select().from(order)
    .where(eq(order.userId, session.user.id))
    .orderBy(desc(order.createdAt))
    .limit(5);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Hi, {session.user.name?.split(" ")[0] ?? "there"}!</h1>
      <p className="text-slate-500 mb-8">Manage your account and orders.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {[
          { href: "/dashboard/orders",    label: "My Orders",    icon: "📦" },
          { href: "/dashboard/addresses", label: "Addresses",    icon: "📍" },
          { href: "/dashboard/wishlist",  label: "Wishlist",     icon: "♡" },
          { href: "/products",            label: "Shop",         icon: "🛍️" },
          { href: "/cart",                label: "Cart",         icon: "🛒" },
        ].map(({ href, label, icon }) => (
          <Link key={href} href={href} className="bg-white border border-slate-100 rounded-xl p-5 flex flex-col items-center gap-2 hover:shadow-sm transition-shadow">
            <span className="text-2xl">{icon}</span>
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </div>

      {orders.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Recent Orders</h2>
          <div className="space-y-3">
            {orders.map((o) => (
              <Link key={o.id} href={\`/orders/\${o.id}\`}
                className="flex items-center justify-between bg-white border border-slate-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div>
                  <p className="font-mono text-sm font-medium">#{o.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">\${parseFloat(o.total).toLocaleString()}</p>
                  <span className="text-xs text-slate-500">{STATUS_LABELS[o.status] ?? o.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
`.trimStart();

    return files;
  },
};
