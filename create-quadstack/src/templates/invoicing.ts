import type { AppTemplate } from "./types";

export const invoicing: AppTemplate = {
  id:                   "invoicing",
  name:                 "Invoicing",
  description:          "Clients, invoices, line items, payment links, and payment history",
  hint:                 "Freelancer / agency billing — create, send, and collect",
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
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const staffRoleEnum    = pgEnum("staff_role_enum",    ["super_admin", "admin", "support"]);
export const invoiceStatusEnum = pgEnum("invoice_status",    ["draft", "sent", "paid", "overdue", "cancelled"]);

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      staffRoleEnum("role").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Clients ──────────────────────────────────────────────────────────────────
export const client = pgTable("client", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  email:       text("email").notNull(),
  company:     text("company"),
  phone:       text("phone"),
  address:     text("address"),
  city:        text("city"),
  country:     text("country"),
  taxId:       text("tax_id"),
  notes:       text("notes"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoice = pgTable("invoice", {
  id:               uuid("id").primaryKey().defaultRandom(),
  ownerId:          text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clientId:         uuid("client_id").notNull().references(() => client.id, { onDelete: "restrict" }),
  number:           text("number").notNull().unique(),
  status:           invoiceStatusEnum("status").notNull().default("draft"),
  currency:         text("currency").notNull().default("USD"),
  taxRate:          integer("tax_rate").notNull().default(0),
  discountAmount:   integer("discount_amount").notNull().default(0),
  notes:            text("notes"),
  dueDate:          timestamp("due_date").notNull(),
  sentAt:           timestamp("sent_at"),
  paidAt:           timestamp("paid_at"),${hasStripe ? `
  stripePaymentLinkId:  text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),` : ""}${hasPaystack ? `
  paystackPaymentUrl:  text("paystack_payment_url"),
  paystackReference:   text("paystack_reference"),` : ""}
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

// ─── Invoice Items ────────────────────────────────────────────────────────────
export const invoiceItem = pgTable("invoice_item", {
  id:          uuid("id").primaryKey().defaultRandom(),
  invoiceId:   uuid("invoice_id").notNull().references(() => invoice.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity:    integer("quantity").notNull().default(1),
  unitPrice:   integer("unit_price").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payment = pgTable("payment", {
  id:          uuid("id").primaryKey().defaultRandom(),
  invoiceId:   uuid("invoice_id").notNull().references(() => invoice.id, { onDelete: "cascade" }),
  amount:      integer("amount").notNull(),
  currency:    text("currency").notNull().default("USD"),
  method:      text("method").notNull(),
  notes:       text("notes"),${hasStripe ? `
  stripePaymentIntentId: text("stripe_payment_intent_id"),` : ""}${hasPaystack ? `
  paystackReference: text("paystack_reference"),` : ""}
  paidAt:      timestamp("paid_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
`;

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/invoicing.ts"] = `
import { z } from "zod";

export const createClientSchema = z.object({
  name:    z.string().min(1).max(200),
  email:   z.string().email(),
  company: z.string().max(200).optional(),
  phone:   z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  city:    z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  taxId:   z.string().max(100).optional(),
  notes:   z.string().max(2000).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity:    z.number().int().positive(),
  unitPrice:   z.number().int().positive(),
});

export const createInvoiceSchema = z.object({
  clientId:       z.string().min(1),
  number:         z.string().min(1).max(50).optional(),
  currency:       z.string().length(3).default("USD"),
  taxRate:        z.number().int().min(0).max(100).default(0),
  discountAmount: z.number().int().min(0).default(0),
  notes:          z.string().max(2000).optional(),
  dueDate:        z.string().datetime(),
  items:          z.array(invoiceItemSchema).min(1, "At least one item required"),
});

export const updateInvoiceSchema = z.object({
  clientId:       z.string().min(1).optional(),
  currency:       z.string().length(3).optional(),
  taxRate:        z.number().int().min(0).max(100).optional(),
  discountAmount: z.number().int().min(0).optional(),
  notes:          z.string().max(2000).optional(),
  dueDate:        z.string().datetime().optional(),
  items:          z.array(invoiceItemSchema).min(1).optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount:    z.number().int().positive(),
  method:    z.string().min(1).max(100),
  notes:     z.string().max(1000).optional(),
  paidAt:    z.string().datetime().optional(),
});

export const listInvoicesSchema = z.object({
  status:   z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  clientId: z.string().optional(),
  cursor:   z.string().optional(),
  limit:    z.number().int().min(1).max(100).default(20),
});
`;

    // ─── ORPC Router ───────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/invoicing.ts"] = `
import { os } from "@orpc/server";
import { db } from "@${scope}/db/client";
import {
  client as clientTable,
  invoice as invoiceTable,
  invoiceItem as invoiceItemTable,
  payment as paymentTable,
  staffRole,
} from "@${scope}/db/schema";
import {
  createClientSchema,
  updateClientSchema,
  createInvoiceSchema,
  updateInvoiceSchema,
  recordPaymentSchema,
  listInvoicesSchema,
} from "@${scope}/validators/invoicing";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";${hasStripe ? `
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);` : ""}

// ─── Procedure builders ───────────────────────────────────────────────────────

const base = os.use(async ({ context, next }: any) => {
  const session = await context.getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return next({ context: { ...context, user: session.user } });
});

const adminPriv = base.use(async ({ context, next }: any) => {
  const [role] = await db
    .select()
    .from(staffRole)
    .where(eq(staffRole.userId, context.user.id))
    .limit(1);
  if (!role) throw new Error("Forbidden");
  return next({ context: { ...context, role } });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const d = new Date();
  const ym = \`\${d.getFullYear()}\${String(d.getMonth() + 1).padStart(2, "0")}\`;
  return \`INV-\${ym}-\${String(Math.floor(Math.random() * 9000) + 1000)}\`;
}

function computeTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number,
  discountAmount: number,
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tax = Math.round((subtotal * taxRate) / 100);
  return { subtotal, tax, total: subtotal + tax - discountAmount };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const invoicingRouter = {
  // ── Clients ────────────────────────────────────────────────────────────────
  clients: {
    list: base.handler(async ({ context }: any) =>
      db.select().from(clientTable).where(eq(clientTable.ownerId, context.user.id)).orderBy(desc(clientTable.createdAt)),
    ),

    get: base
      .input(z.object({ clientId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [row] = await db
          .select()
          .from(clientTable)
          .where(and(eq(clientTable.id, input.clientId), eq(clientTable.ownerId, context.user.id)))
          .limit(1);
        if (!row) throw new Error("Client not found");
        return row;
      }),

    create: base
      .input(createClientSchema)
      .handler(async ({ input, context }: any) => {
        const [row] = await db.insert(clientTable).values({ ...input, ownerId: context.user.id }).returning();
        return row;
      }),

    update: base
      .input(z.object({ clientId: z.string() }).and(updateClientSchema))
      .handler(async ({ input, context }: any) => {
        const { clientId, ...data } = input;
        const [existing] = await db
          .select()
          .from(clientTable)
          .where(and(eq(clientTable.id, clientId), eq(clientTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Client not found");
        const [row] = await db
          .update(clientTable)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(clientTable.id, clientId))
          .returning();
        return row;
      }),

    delete: base
      .input(z.object({ clientId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(clientTable)
          .where(and(eq(clientTable.id, input.clientId), eq(clientTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Client not found");
        await db.delete(clientTable).where(eq(clientTable.id, input.clientId));
        return { success: true };
      }),
  },

  // ── Invoices ───────────────────────────────────────────────────────────────
  invoices: {
    list: base
      .input(listInvoicesSchema)
      .handler(async ({ input, context }: any) => {
        const { status, clientId, cursor, limit } = input;
        const offset = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : 0;
        const conditions: any[] = [eq(invoiceTable.ownerId, context.user.id)];
        if (status)   conditions.push(eq(invoiceTable.status, status));
        if (clientId) conditions.push(eq(invoiceTable.clientId, clientId));

        const rows = await db
          .select({
            invoice: invoiceTable,
            client:  { name: clientTable.name, email: clientTable.email, company: clientTable.company },
          })
          .from(invoiceTable)
          .innerJoin(clientTable, eq(invoiceTable.clientId, clientTable.id))
          .where(and(...conditions))
          .orderBy(desc(invoiceTable.createdAt))
          .limit(limit + 1)
          .offset(offset);

        const hasMore = rows.length > limit;
        return {
          items:      hasMore ? rows.slice(0, limit) : rows,
          nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null,
        };
      }),

    get: base
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [row] = await db
          .select({ invoice: invoiceTable, client: clientTable })
          .from(invoiceTable)
          .innerJoin(clientTable, eq(invoiceTable.clientId, clientTable.id))
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!row) throw new Error("Invoice not found");

        const items    = await db.select().from(invoiceItemTable).where(eq(invoiceItemTable.invoiceId, input.invoiceId));
        const payments = await db.select().from(paymentTable).where(eq(paymentTable.invoiceId, input.invoiceId)).orderBy(desc(paymentTable.paidAt));

        return { ...row, items, payments };
      }),

    getPublic: os
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input }: any) => {
        const [row] = await db
          .select({
            invoice: invoiceTable,
            client:  { name: clientTable.name, email: clientTable.email, company: clientTable.company },
          })
          .from(invoiceTable)
          .innerJoin(clientTable, eq(invoiceTable.clientId, clientTable.id))
          .where(and(eq(invoiceTable.id, input.invoiceId), sql\`\${invoiceTable.status} != 'cancelled'\`))
          .limit(1);
        if (!row) throw new Error("Invoice not found");
        const items = await db.select().from(invoiceItemTable).where(eq(invoiceItemTable.invoiceId, input.invoiceId));
        return { ...row, items };
      }),

    create: base
      .input(createInvoiceSchema)
      .handler(async ({ input, context }: any) => {
        const { items, ...invoiceData } = input;
        const [clientRow] = await db
          .select()
          .from(clientTable)
          .where(and(eq(clientTable.id, invoiceData.clientId), eq(clientTable.ownerId, context.user.id)))
          .limit(1);
        if (!clientRow) throw new Error("Client not found");

        const [inv] = await db
          .insert(invoiceTable)
          .values({
            ...invoiceData,
            number:  invoiceData.number ?? generateInvoiceNumber(),
            ownerId: context.user.id,
            dueDate: new Date(invoiceData.dueDate),
          })
          .returning();

        await db.insert(invoiceItemTable).values(items.map((item) => ({ ...item, invoiceId: inv.id })));
        return inv;
      }),

    update: base
      .input(z.object({ invoiceId: z.string() }).and(updateInvoiceSchema))
      .handler(async ({ input, context }: any) => {
        const { invoiceId, items, ...data } = input as any;
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status !== "draft") throw new Error("Only draft invoices can be edited");

        const [updated] = await db
          .update(invoiceTable)
          .set({ ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined, updatedAt: new Date() })
          .where(eq(invoiceTable.id, invoiceId))
          .returning();

        if (items) {
          await db.delete(invoiceItemTable).where(eq(invoiceItemTable.invoiceId, invoiceId));
          await db.insert(invoiceItemTable).values(items.map((item: any) => ({ ...item, invoiceId })));
        }
        return updated;
      }),

    send: base
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status !== "draft") throw new Error("Only draft invoices can be sent");
        const [updated] = await db
          .update(invoiceTable)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(invoiceTable.id, input.invoiceId))
          .returning();
        return updated;
      }),
${hasStripe ? `
    createPaymentLink: base
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [row] = await db
          .select({ invoice: invoiceTable, client: clientTable })
          .from(invoiceTable)
          .innerJoin(clientTable, eq(invoiceTable.clientId, clientTable.id))
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!row) throw new Error("Invoice not found");
        if (!["sent", "overdue"].includes(row.invoice.status)) throw new Error("Invoice must be sent or overdue");

        const items = await db.select().from(invoiceItemTable).where(eq(invoiceItemTable.invoiceId, input.invoiceId));
        const { total } = computeTotals(items, row.invoice.taxRate, row.invoice.discountAmount);

        const paymentLink = await stripe.paymentLinks.create({
          line_items: [{
            price_data: {
              currency:     row.invoice.currency.toLowerCase(),
              product_data: { name: \`Invoice \${row.invoice.number}\` },
              unit_amount:  total,
            },
            quantity: 1,
          }],
          metadata:        { invoiceId: input.invoiceId },
          after_completion: {
            type:     "redirect",
            redirect: { url: \`\${process.env.NEXT_PUBLIC_APP_URL}/invoices/\${input.invoiceId}/paid\` },
          },
        });

        const [updated] = await db
          .update(invoiceTable)
          .set({ stripePaymentLinkId: paymentLink.id, stripePaymentLinkUrl: paymentLink.url, updatedAt: new Date() })
          .where(eq(invoiceTable.id, input.invoiceId))
          .returning();

        return { url: paymentLink.url, invoice: updated };
      }),
` : ""}
    markPaid: base
      .input(z.object({ invoiceId: z.string(), notes: z.string().optional() }))
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "paid")      throw new Error("Already paid");
        if (existing.status === "cancelled") throw new Error("Invoice is cancelled");

        const items = await db.select().from(invoiceItemTable).where(eq(invoiceItemTable.invoiceId, input.invoiceId));
        const { total } = computeTotals(items, existing.taxRate, existing.discountAmount);

        await db.insert(paymentTable).values({
          invoiceId: input.invoiceId,
          amount:    total,
          currency:  existing.currency,
          method:    "manual",
          notes:     input.notes,
          paidAt:    new Date(),
        });

        const [updated] = await db
          .update(invoiceTable)
          .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
          .where(eq(invoiceTable.id, input.invoiceId))
          .returning();
        return updated;
      }),

    cancel: base
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "paid") throw new Error("Cannot cancel a paid invoice");
        const [updated] = await db
          .update(invoiceTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(invoiceTable.id, input.invoiceId))
          .returning();
        return updated;
      }),

    delete: base
      .input(z.object({ invoiceId: z.string() }))
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "paid") throw new Error("Cannot delete a paid invoice");
        await db.delete(invoiceTable).where(eq(invoiceTable.id, input.invoiceId));
        return { success: true };
      }),

    markOverdue: adminPriv.handler(async () => {
      const updated = await db
        .update(invoiceTable)
        .set({ status: "overdue", updatedAt: new Date() })
        .where(and(eq(invoiceTable.status, "sent"), lt(invoiceTable.dueDate, new Date())))
        .returning({ id: invoiceTable.id });
      return { updated: updated.length };
    }),
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  payments: {
    record: base
      .input(recordPaymentSchema)
      .handler(async ({ input, context }: any) => {
        const [existing] = await db
          .select()
          .from(invoiceTable)
          .where(and(eq(invoiceTable.id, input.invoiceId), eq(invoiceTable.ownerId, context.user.id)))
          .limit(1);
        if (!existing) throw new Error("Invoice not found");
        if (existing.status === "cancelled") throw new Error("Cannot record payment on a cancelled invoice");
        if (existing.status === "paid")      throw new Error("Already paid in full");

        const [pmt] = await db
          .insert(paymentTable)
          .values({ ...input, paidAt: input.paidAt ? new Date(input.paidAt) : new Date() })
          .returning();

        await db
          .update(invoiceTable)
          .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
          .where(eq(invoiceTable.id, input.invoiceId));

        return pmt;
      }),
  },

  // ── Admin ──────────────────────────────────────────────────────────────────
  admin: {
    listAll: adminPriv
      .input(z.object({ status: z.string().optional(), cursor: z.string().optional(), limit: z.number().default(50) }))
      .handler(async ({ input }: any) => {
        const { status, cursor, limit } = input;
        const offset = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : 0;
        const conditions: any[] = status ? [eq(invoiceTable.status, status as any)] : [];

        const rows = await db
          .select({
            invoice: invoiceTable,
            client:  { name: clientTable.name, email: clientTable.email },
          })
          .from(invoiceTable)
          .innerJoin(clientTable, eq(invoiceTable.clientId, clientTable.id))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(invoiceTable.createdAt))
          .limit(limit + 1)
          .offset(offset);

        const hasMore = rows.length > limit;
        return {
          items:      hasMore ? rows.slice(0, limit) : rows,
          nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null,
        };
      }),
  },
};
`;

    // ─── Server ORPC helper ────────────────────────────────────────────────────
    files["apps/web/src/lib/server-orpc.ts"] = `
import { unstable_cache } from "next/cache";
import { createRouterClient } from "@orpc/server";
import { invoicingRouter } from "@${scope}/api/orpc-routers/invoicing";

export const getCachedInvoices = (userId: string) =>
  unstable_cache(
    () => createRouterClient(invoicingRouter).invoices.list({ limit: 20 }),
    ["invoices", userId],
    { tags: [\`invoices:\${userId}\`], revalidate: 60 },
  )();
`;

    // ─── Stripe webhook ────────────────────────────────────────────────────────
    if (hasStripe) {
      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@${scope}/db/client";
import { invoice as invoiceTable, invoiceItem as invoiceItemTable, payment as paymentTable } from "@${scope}/db/schema";
import { and, eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi        = event.data.object as Stripe.PaymentIntent;
    const invoiceId = pi.metadata?.invoiceId;
    if (!invoiceId) return NextResponse.json({ ok: true });

    const [inv] = await db.select().from(invoiceTable).where(eq(invoiceTable.id, invoiceId)).limit(1);
    if (!inv || inv.status === "paid") return NextResponse.json({ ok: true });

    await db.insert(paymentTable).values({
      invoiceId,
      amount:                pi.amount_received,
      currency:              pi.currency.toUpperCase(),
      method:                "stripe",
      stripePaymentIntentId: pi.id,
      paidAt:                new Date(),
    });

    await db
      .update(invoiceTable)
      .set({ status: "paid", paidAt: new Date(), stripePaymentIntentId: pi.id, updatedAt: new Date() })
      .where(eq(invoiceTable.id, invoiceId));
  }

  return NextResponse.json({ ok: true });
}
`;
    }

    // ─── Paystack webhook ──────────────────────────────────────────────────────
    if (hasPaystack) {
      files["apps/web/src/app/api/paystack/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@${scope}/db/client";
import { invoice as invoiceTable, payment as paymentTable } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const hash = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");
  if (hash !== req.headers.get("x-paystack-signature")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body);
  if (event.event === "charge.success") {
    const invoiceId = event.data?.metadata?.invoiceId as string | undefined;
    if (!invoiceId) return NextResponse.json({ ok: true });

    const [inv] = await db.select().from(invoiceTable).where(eq(invoiceTable.id, invoiceId)).limit(1);
    if (!inv || inv.status === "paid") return NextResponse.json({ ok: true });

    await db.insert(paymentTable).values({
      invoiceId,
      amount:            event.data.amount,
      currency:          event.data.currency,
      method:            "paystack",
      paystackReference: event.data.reference,
      paidAt:            new Date(),
    });

    await db
      .update(invoiceTable)
      .set({ status: "paid", paidAt: new Date(), paystackReference: event.data.reference, updatedAt: new Date() })
      .where(eq(invoiceTable.id, invoiceId));
  }

  return NextResponse.json({ ok: true });
}
`;
    }

    // ─── Pages ─────────────────────────────────────────────────────────────────
    files["apps/web/src/app/invoices/page.tsx"] = `
import Link from "next/link";
import { orpc } from "@/lib/server-orpc";
import { Button } from "@${scope}/ui/components/button";

const statusColors: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700",
  sent:      "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
  overdue:   "bg-red-100 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export default async function InvoicesPage() {
  const { items } = await orpc.invoices.list({ limit: 20 });

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new">New Invoice</Link>
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Number</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Due</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(({ invoice, client }: any) => (
              <tr key={invoice.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-mono">{invoice.number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={\`text-xs px-2 py-1 rounded-full font-medium \${statusColors[invoice.status]}\`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={\`/invoices/\${invoice.id}\`} className="text-primary hover:underline text-sm">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">No invoices yet.</p>
        )}
      </div>
    </div>
  );
}
`;

    files["apps/web/src/app/invoices/[id]/page.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { Button } from "@${scope}/ui/components/button";

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const [confirmPaid, setConfirmPaid] = useState(false);

  const { data } = useQuery({
    queryKey: ["invoice", params.id],
    queryFn:  () => orpc.invoices.get({ invoiceId: params.id }),
  });

  const sendMut = useMutation({
    mutationFn: () => orpc.invoices.send({ invoiceId: params.id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["invoice", params.id] }),
  });
  const markPaidMut = useMutation({
    mutationFn: () => orpc.invoices.markPaid({ invoiceId: params.id }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["invoice", params.id] }); setConfirmPaid(false); },
  });
${hasStripe ? `
  const linkMut = useMutation({
    mutationFn: () => orpc.invoices.createPaymentLink({ invoiceId: params.id }),
    onSuccess:  (d: any) => window.open(d.url, "_blank"),
  });
` : ""}
  if (!data) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  const { invoice, client, items, payments } = data as any;
  const subtotal = items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
  const tax      = Math.round((subtotal * invoice.taxRate) / 100);
  const total    = subtotal + tax - invoice.discountAmount;

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{invoice.number}</h1>
          <p className="text-muted-foreground capitalize mt-1">{invoice.status}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {invoice.status === "draft" && (
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
              {sendMut.isPending ? "Sending…" : "Mark Sent"}
            </Button>
          )}
          {["sent", "overdue"].includes(invoice.status) && !invoice.paidAt && (
            <>
${hasStripe ? `
              <Button variant="outline" onClick={() => linkMut.mutate()} disabled={(linkMut as any).isPending}>
                {(linkMut as any).isPending ? "…" : invoice.stripePaymentLinkUrl ? "Resend Link" : "Create Payment Link"}
              </Button>
` : ""}
              {confirmPaid ? (
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Confirm?</span>
                  <Button size="sm" onClick={() => markPaidMut.mutate()}>Yes</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmPaid(false)}>No</Button>
                </div>
              ) : (
                <Button onClick={() => setConfirmPaid(true)}>Mark Paid</Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6 rounded-lg border">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">BILL TO</p>
          <p className="font-medium">{client.name}</p>
          {client.company && <p className="text-sm">{client.company}</p>}
          <p className="text-sm text-muted-foreground">{client.email}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground mb-1">DUE DATE</p>
          <p>{new Date(invoice.dueDate).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="px-4 py-3">{item.description}</td>
                <td className="px-4 py-3 text-right">{item.quantity}</td>
                <td className="px-4 py-3 text-right">{fmt(item.unitPrice, invoice.currency)}</td>
                <td className="px-4 py-3 text-right font-medium">{fmt(item.quantity * item.unitPrice, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-4 space-y-1 text-sm bg-muted/20 border-t">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal, invoice.currency)}</span></div>
          {invoice.taxRate > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax ({invoice.taxRate}%)</span><span>{fmt(tax, invoice.currency)}</span></div>}
          {invoice.discountAmount > 0 && <div className="flex justify-between text-green-700"><span>Discount</span><span>-{fmt(invoice.discountAmount, invoice.currency)}</span></div>}
          <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Total</span><span>{fmt(total, invoice.currency)}</span></div>
        </div>
      </div>

      {payments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Payment History</h2>
          <div className="space-y-2">
            {payments.map((p: any) => (
              <div key={p.id} className="flex justify-between text-sm p-3 rounded-lg border">
                <span>{new Date(p.paidAt).toLocaleDateString()} · {p.method}</span>
                <span className="font-medium text-green-700">{fmt(p.amount, invoice.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
${hasStripe ? `
      {invoice.stripePaymentLinkUrl && (
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm">
          <p className="font-medium text-blue-800 mb-1">Payment Link</p>
          <a href={invoice.stripePaymentLinkUrl} target="_blank" className="text-blue-600 underline break-all">
            {invoice.stripePaymentLinkUrl}
          </a>
        </div>
      )}
` : ""}
    </div>
  );
}
`;

    files["apps/web/src/app/invoices/new/page.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { Button } from "@${scope}/ui/components/button";
import { Input } from "@${scope}/ui/components/input";
import { Label } from "@${scope}/ui/components/label";
import { Textarea } from "@${scope}/ui/components/textarea";

interface LineItem { description: string; quantity: number; unitPrice: number }

export default function NewInvoicePage() {
  const router = useRouter();
  const [clientId,       setClientId]       = useState("");
  const [dueDate,        setDueDate]        = useState("");
  const [taxRate,        setTaxRate]        = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes,          setNotes]          = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => orpc.clients.list() });

  const createMut = useMutation({
    mutationFn: (data: any) => orpc.invoices.create(data),
    onSuccess:  (inv: any) => router.push(\`/invoices/\${inv.id}\`),
  });

  const addItem    = () => setItems((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, f: keyof LineItem, v: any) =>
    setItems((p) => p.map((item, idx) => (idx === i ? { ...item, [f]: v } : item)));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total    = subtotal + Math.round((subtotal * taxRate) / 100) - discountAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      clientId,
      dueDate:        new Date(dueDate).toISOString(),
      taxRate,
      discountAmount,
      notes,
      items,
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-8">New Invoice</h1>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label htmlFor="client">Client</Label>
            <select
              id="client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Select client…</option>
              {(clients as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="dueDate">Due Date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="mt-1" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Line Items</h2>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-6" placeholder="Description" value={item.description}
                  onChange={(e) => updateItem(i, "description", e.target.value)} required />
                <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={item.quantity}
                  onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} />
                <Input className="col-span-3" type="number" min={0} placeholder="Price (cents)" value={item.unitPrice}
                  onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))} />
                <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-destructive text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label>Tax Rate (%)</Label>
            <Input type="number" min={0} max={100} value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label>Discount (cents)</Label>
            <Input type="number" min={0} value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))} className="mt-1" />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
        </div>

        <div className="text-right text-sm space-y-1 border-t pt-4">
          <p className="text-muted-foreground">Subtotal: {(subtotal / 100).toFixed(2)}</p>
          <p className="font-bold text-base">Total: {(total / 100).toFixed(2)}</p>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={createMut.isPending}>
            {createMut.isPending ? "Creating…" : "Create Invoice"}
          </Button>
        </div>
      </form>
    </div>
  );
}
`;

    files["apps/web/src/app/admin/invoices/page.tsx"] = `
import { orpc } from "@/lib/server-orpc";
import { Badge } from "@${scope}/ui/components/badge";

const statusVariant: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  draft:     "secondary",
  sent:      "default",
  paid:      "outline",
  overdue:   "destructive",
  cancelled: "secondary",
};

export default async function AdminInvoicesPage() {
  const { items } = await orpc.admin.invoices.listAll({ limit: 50 });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">All Invoices</h1>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Number</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(items as any[]).map(({ invoice, client }) => (
              <tr key={invoice.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-mono">{invoice.number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant[invoice.status]}>{invoice.status}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-center py-12 text-muted-foreground">No invoices.</p>}
      </div>
    </div>
  );
}
`;

    return files;
  },
};
