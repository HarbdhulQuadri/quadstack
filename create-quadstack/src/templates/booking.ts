import type { AppTemplate } from "./types";

export const booking: AppTemplate = {
  id:                   "booking",
  name:                 "Booking / Scheduling",
  description:          "Provider services, availability, time-slot booking, and appointments",
  hint:                 "Calendly / Cal.com style — provider + client flows",
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
export const bookingStatus = pgEnum("booking_status", ["pending", "confirmed", "cancelled", "completed", "no_show"]);
export const dayOfWeek     = pgEnum("day_of_week",    ["0","1","2","3","4","5","6"]);

// ─── Staff / Admin ────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Provider Profile ─────────────────────────────────────────────────────────
export const provider = pgTable("provider", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  bio:         text("bio"),
  avatarUrl:   text("avatar_url"),
  timezone:    text("timezone").notNull().default("UTC"),
  slug:        text("slug").notNull().unique(),
  isPublic:    boolean("is_public").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Services ─────────────────────────────────────────────────────────────────
export const service = pgTable("service", {
  id:          uuid("id").primaryKey().defaultRandom(),
  providerId:  uuid("provider_id").notNull().references(() => provider.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  description: text("description"),
  duration:    integer("duration").notNull().default(60), // minutes
  price:       numeric("price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  isFree:      boolean("is_free").notNull().default(false),
  color:       text("color").notNull().default("#6366f1"),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Weekly Availability ──────────────────────────────────────────────────────
export const providerAvailability = pgTable("provider_availability", {
  id:         uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => provider.id, { onDelete: "cascade" }),
  dayOfWeek:  dayOfWeek("day_of_week").notNull(), // 0 = Sunday
  startTime:  text("start_time").notNull(), // "HH:MM"
  endTime:    text("end_time").notNull(),   // "HH:MM"
});

// ─── Availability Overrides ───────────────────────────────────────────────────
export const availabilityOverride = pgTable("availability_override", {
  id:         uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => provider.id, { onDelete: "cascade" }),
  date:       text("date").notNull(), // "YYYY-MM-DD"
  isBlocked:  boolean("is_blocked").notNull().default(true),
  startTime:  text("start_time"), // override window if not blocked
  endTime:    text("end_time"),
  reason:     text("reason"),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────
export const appointment = pgTable("appointment", {
  id:              uuid("id").primaryKey().defaultRandom(),
  providerId:      uuid("provider_id").notNull().references(() => provider.id),
  serviceId:       uuid("service_id").notNull().references(() => service.id),
  clientId:        text("client_id").notNull().references(() => user.id),
  status:          bookingStatus("status").notNull().default("pending"),
  startTime:       timestamp("start_time").notNull(),
  endTime:         timestamp("end_time").notNull(),
  clientNote:      text("client_note"),
  providerNote:    text("provider_note"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentId: text("stripe_payment_id"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createProviderSchema = z.object({
  displayName: z.string().min(1).max(100),
  slug:        z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  bio:         z.string().max(1000).optional(),
  avatarUrl:   z.string().url().optional(),
  timezone:    z.string().default("UTC"),
});

export const createServiceSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  duration:    z.number().int().min(5).max(480).default(60),
  price:       z.string().regex(/^\d+\.\d{2}$/).default("0.00"),
  isFree:      z.boolean().default(false),
  color:       z.string().regex(/^#[0-9a-f]{6}$/i).default("#6366f1"),
});

export const setAvailabilitySchema = z.object({
  providerId: z.string().uuid(),
  slots: z.array(z.object({
    dayOfWeek: z.enum(["0","1","2","3","4","5","6"]),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime:   z.string().regex(/^\d{2}:\d{2}$/),
  })),
});

export const addOverrideSchema = z.object({
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isBlocked: z.boolean().default(true),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason:    z.string().max(200).optional(),
});

export const createAppointmentSchema = z.object({
  serviceId:  z.string().uuid(),
  startTime:  z.coerce.date(),
  clientNote: z.string().max(1000).optional(),
});

export const slotsQuerySchema = z.object({
  providerSlug: z.string(),
  serviceId:    z.string().uuid(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Providers Router ──────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/providers.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { appointment, availabilityOverride, provider, providerAvailability, service } from "@${scope}/db/schema";
import { addOverrideSchema, createProviderSchema, createServiceSchema, setAvailabilitySchema, slotsQuerySchema } from "@${scope}/validators";
import { priv, pub } from "../procedures";

export const providersRouter = {
  list: pub
    .route({ method: "GET", path: "/providers/list" })
    .handler(({ context }) =>
      context.db.select().from(provider).where(eq(provider.isPublic, true)),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/providers/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const services = await context.db
        .select()
        .from(service)
        .where(and(eq(service.providerId, found.id), eq(service.isActive, true)));

      return { ...found, services };
    }),

  getAvailableSlots: pub
    .input(slotsQuerySchema)
    .route({ method: "GET", path: "/providers/slots" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.slug, input.providerSlug))
        .limit(1);
      if (!prov) throw new ORPCError("NOT_FOUND");

      const [svc] = await context.db
        .select()
        .from(service)
        .where(and(eq(service.id, input.serviceId), eq(service.providerId, prov.id)))
        .limit(1);
      if (!svc) throw new ORPCError("NOT_FOUND");

      const dateObj    = new Date(input.date);
      const dayOfWeek  = String(dateObj.getUTCDay()) as "0"|"1"|"2"|"3"|"4"|"5"|"6";

      // Check overrides for this date
      const [override] = await context.db
        .select()
        .from(availabilityOverride)
        .where(and(eq(availabilityOverride.providerId, prov.id), eq(availabilityOverride.date, input.date)))
        .limit(1);

      if (override?.isBlocked) return { slots: [] };

      // Get weekly schedule for this day
      const availability = await context.db
        .select()
        .from(providerAvailability)
        .where(and(eq(providerAvailability.providerId, prov.id), eq(providerAvailability.dayOfWeek, dayOfWeek)));

      if (!availability.length) return { slots: [] };

      // Existing appointments that day
      const dayStart = new Date(\`\${input.date}T00:00:00Z\`);
      const dayEnd   = new Date(\`\${input.date}T23:59:59Z\`);
      const existing = await context.db
        .select()
        .from(appointment)
        .where(
          and(
            eq(appointment.providerId, prov.id),
            // appointments where startTime is within the day
          ),
        );
      const busySlots = existing.filter(
        (a) => a.startTime >= dayStart && a.startTime <= dayEnd && a.status !== "cancelled",
      );

      // Generate slots from availability windows
      const slots: string[] = [];
      const durationMs = svc.duration * 60 * 1000;

      for (const window of availability) {
        const [sh, sm] = window.startTime.split(":").map(Number);
        const [eh, em] = window.endTime.split(":").map(Number);
        let cursor = new Date(\`\${input.date}T\${String(sh).padStart(2,"0")}:\${String(sm).padStart(2,"0")}:00Z\`);
        const windowEnd = new Date(\`\${input.date}T\${String(eh).padStart(2,"0")}:\${String(em).padStart(2,"0")}:00Z\`);

        while (new Date(cursor.getTime() + durationMs) <= windowEnd) {
          const slotEnd = new Date(cursor.getTime() + durationMs);
          const isBusy  = busySlots.some(
            (a) => cursor < a.endTime && slotEnd > a.startTime,
          );
          if (!isBusy && cursor > new Date()) {
            slots.push(cursor.toISOString());
          }
          cursor = new Date(cursor.getTime() + durationMs);
        }
      }

      return { slots };
    }),

  createProfile: priv
    .input(createProviderSchema)
    .route({ method: "POST", path: "/providers/create" })
    .handler(async ({ context, input }) => {
      const existing = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (existing[0]) throw new ORPCError("CONFLICT", { message: "Provider profile already exists" });

      const [created] = await context.db
        .insert(provider)
        .values({ ...input, userId: context.user.id })
        .returning();
      return created;
    }),

  updateProfile: priv
    .input(createProviderSchema.partial())
    .route({ method: "PATCH", path: "/providers/update" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(provider)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(provider.userId, context.user.id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  addService: priv
    .input(createServiceSchema)
    .route({ method: "POST", path: "/providers/services/add" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov) throw new ORPCError("NOT_FOUND", { message: "Create a provider profile first" });

      const [created] = await context.db
        .insert(service)
        .values({ ...input, providerId: prov.id })
        .returning();
      return created;
    }),

  setAvailability: priv
    .input(setAvailabilitySchema)
    .route({ method: "PUT", path: "/providers/availability" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov || prov.id !== input.providerId) throw new ORPCError("FORBIDDEN");

      await context.db.delete(providerAvailability).where(eq(providerAvailability.providerId, prov.id));
      if (input.slots.length) {
        await context.db.insert(providerAvailability).values(
          input.slots.map((s) => ({ ...s, providerId: prov.id })),
        );
      }
      return { success: true };
    }),

  addOverride: priv
    .input(addOverrideSchema)
    .route({ method: "POST", path: "/providers/availability/override" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov) throw new ORPCError("NOT_FOUND");

      const [created] = await context.db
        .insert(availabilityOverride)
        .values({ ...input, providerId: prov.id })
        .returning();
      return created;
    }),
};
`.trimStart();

    // ─── Appointments Router ───────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/appointments.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import { appointment, provider, service } from "@${scope}/db/schema";
import { createAppointmentSchema } from "@${scope}/validators";
import { priv } from "../procedures";

export const appointmentsRouter = {
  mine: priv
    .route({ method: "GET", path: "/appointments/mine" })
    .handler(({ context }) =>
      context.db
        .select({ appointment, service })
        .from(appointment)
        .innerJoin(service, eq(appointment.serviceId, service.id))
        .where(eq(appointment.clientId, context.user.id))
        .orderBy(appointment.startTime),
    ),

  myProviderAppointments: priv
    .route({ method: "GET", path: "/appointments/provider/mine" })
    .handler(async ({ context }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov) return [];

      return context.db
        .select({ appointment, service })
        .from(appointment)
        .innerJoin(service, eq(appointment.serviceId, service.id))
        .where(eq(appointment.providerId, prov.id))
        .orderBy(appointment.startTime);
    }),

  book: priv
    .input(createAppointmentSchema.extend({ providerSlug: z.string() }))
    .route({ method: "POST", path: "/appointments/book" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.slug, input.providerSlug))
        .limit(1);
      if (!prov) throw new ORPCError("NOT_FOUND");

      const [svc] = await context.db
        .select()
        .from(service)
        .where(and(eq(service.id, input.serviceId), eq(service.providerId, prov.id), eq(service.isActive, true)))
        .limit(1);
      if (!svc) throw new ORPCError("NOT_FOUND", { message: "Service not found" });

      const endTime = new Date(input.startTime.getTime() + svc.duration * 60 * 1000);

      // Conflict check
      const conflicts = await context.db
        .select()
        .from(appointment)
        .where(
          and(
            eq(appointment.providerId, prov.id),
          ),
        );
      const hasConflict = conflicts.some(
        (a) =>
          a.status !== "cancelled" &&
          input.startTime < a.endTime &&
          endTime > a.startTime,
      );
      if (hasConflict) throw new ORPCError("CONFLICT", { message: "Slot no longer available" });

      if (prov.userId === context.user.id) {
        throw new ORPCError("BAD_REQUEST", { message: "Cannot book your own service" });
      }

      const [created] = await context.db
        .insert(appointment)
        .values({
          providerId:  prov.id,
          serviceId:   svc.id,
          clientId:    context.user.id,
          startTime:   input.startTime,
          endTime,
          clientNote:  input.clientNote,
          status:      svc.isFree || parseFloat(svc.price) === 0 ? "confirmed" : "pending",
        })
        .returning();
      return created;
    }),

  confirm: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/appointments/confirm" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(appointment)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(and(eq(appointment.id, input.id), eq(appointment.providerId, prov.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  cancel: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/appointments/cancel" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ appointment, provider })
        .from(appointment)
        .innerJoin(provider, eq(appointment.providerId, provider.id))
        .where(eq(appointment.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const isClient   = found.appointment.clientId === context.user.id;
      const isProvider = found.provider.userId === context.user.id;
      if (!isClient && !isProvider) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(appointment)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(appointment.id, input.id))
        .returning();
      return updated;
    }),

  addProviderNote: priv
    .input(z.object({ id: z.string().uuid(), note: z.string().max(2000) }))
    .route({ method: "PATCH", path: "/appointments/note" })
    .handler(async ({ context, input }) => {
      const [prov] = await context.db
        .select()
        .from(provider)
        .where(eq(provider.userId, context.user.id))
        .limit(1);
      if (!prov) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(appointment)
        .set({ providerNote: input.note, updatedAt: new Date() })
        .where(and(eq(appointment.id, input.id), eq(appointment.providerId, prov.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),
};
`.trimStart();

    // ─── Stripe Webhook ────────────────────────────────────────────────────────
    if (hasStripe) {
      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@${scope}/db/client";
import { appointment } from "@${scope}/db/schema";
import { eq } from "drizzle-orm";

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
    const session = event.data.object as Stripe.Checkout.Session;
    const apptId  = session.metadata?.appointmentId;
    if (!apptId) return NextResponse.json({ received: true });

    await db
      .update(appointment)
      .set({ status: "confirmed", stripePaymentId: session.payment_intent as string, updatedAt: new Date() })
      .where(eq(appointment.id, apptId));
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Root Router ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }         from "./auth";
import { providersRouter }    from "./providers";
import { appointmentsRouter } from "./appointments";

export const appRouter = {
  auth:         authRouter,
  providers:    providersRouter,
  appointments: appointmentsRouter,
};

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

export const getCachedProviders = unstable_cache(
  () => publicCaller.providers.list(),
  ["providers-list"],
  { revalidate: 300, tags: ["providers"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedProviders } from "@/lib/server-orpc";

export default async function HomePage() {
  const providers = await getCachedProviders();

  return (
    <main className="mx-auto max-w-5xl space-y-12 p-6">
      <section className="py-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Book a session.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Find an expert, pick a time, get it done.</p>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">Available Providers</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <Link key={p.id} href={\`/book/\${p.slug}\`} className="group rounded-lg border p-6 hover:shadow-md transition-shadow space-y-2">
              {p.avatarUrl && <img src={p.avatarUrl} alt={p.displayName} className="h-12 w-12 rounded-full object-cover" />}
              <h3 className="font-semibold group-hover:text-primary">{p.displayName}</h3>
              {p.bio && <p className="text-sm text-muted-foreground line-clamp-2">{p.bio}</p>}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/book/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { BookingWidget } from "./_components/booking-widget";

interface Props { params: Promise<{ slug: string }> }

export default async function ProviderPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.providers.get>>;
  try {
    data = await caller.providers.get({ slug });
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="flex items-start gap-4">
        {data.avatarUrl && <img src={data.avatarUrl} alt={data.displayName} className="h-16 w-16 rounded-full object-cover" />}
        <div>
          <h1 className="text-2xl font-bold">{data.displayName}</h1>
          {data.bio && <p className="mt-1 text-muted-foreground">{data.bio}</p>}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Services</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.services.map((svc) => (
            <div key={svc.id} className="rounded-lg border p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: svc.color }} />
                <h3 className="font-medium">{svc.name}</h3>
              </div>
              {svc.description && <p className="text-sm text-muted-foreground">{svc.description}</p>}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{svc.duration} min</span>
                <span className="font-medium">{svc.isFree ? "Free" : \`$\${svc.price}\`}</span>
              </div>
              <BookingWidget providerSlug={slug} service={svc} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/book/[slug]/_components/booking-widget.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Service { id: string; name: string; duration: number; price: string; isFree: boolean }
interface Props   { providerSlug: string; service: Service }

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getNextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().split("T")[0]!;
  });
}

export function BookingWidget({ providerSlug, service }: Props) {
  const router   = useRouter();
  const [step, setStep]     = useState<"date"|"slot"|"confirm">("date");
  const [date, setDate]     = useState("");
  const [slots, setSlots]   = useState<string[]>([]);
  const [slot, setSlot]     = useState("");
  const [note, setNote]     = useState("");
  const [loading, setLoading] = useState(false);

  const days = getNextDays(14);

  async function selectDate(d: string) {
    setDate(d);
    setLoading(true);
    try {
      const res = await orpc.providers.getAvailableSlots({ providerSlug, serviceId: service.id, date: d });
      setSlots(res.slots);
      setStep("slot");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    try {
      const appt = await orpc.appointments.book({
        providerSlug,
        serviceId:  service.id,
        startTime:  new Date(slot),
        clientNote: note || undefined,
      });
      router.push(\`/dashboard/appointments\`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  if (step === "date") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Pick a date</p>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const dayIdx = new Date(d).getUTCDay();
            return (
              <button
                key={d}
                onClick={() => selectDate(d)}
                className="flex flex-col items-center rounded-md border p-2 text-xs hover:bg-primary hover:text-primary-foreground"
              >
                <span className="text-muted-foreground">{DAYS[dayIdx]}</span>
                <span className="font-medium">{d.split("-")[2]}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (step === "slot") {
    return (
      <div className="space-y-2">
        <button onClick={() => setStep("date")} className="text-xs text-muted-foreground underline">← {date}</button>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading slots…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No availability on this day.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {slots.map((s) => (
              <button
                key={s}
                onClick={() => { setSlot(s); setStep("confirm"); }}
                className="rounded-md border px-2 py-1 text-xs hover:bg-primary hover:text-primary-foreground"
              >
                {new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setStep("slot")} className="text-xs text-muted-foreground underline">← {new Date(slot).toLocaleString()}</button>
      <textarea
        placeholder="Any notes for the provider? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full rounded-md border px-3 py-2 text-sm resize-none"
      />
      <button
        onClick={confirm}
        disabled={loading}
        className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Booking…" : service.isFree ? "Confirm Booking" : \`Book — $\${service.price}\`}
      </button>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/appointments/page.tsx"] = `
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  pending:   "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
  no_show:   "bg-gray-100 text-gray-800",
};

export default async function MyAppointmentsPage() {
  const caller = await getServerCaller();
  let appts: Awaited<ReturnType<typeof caller.appointments.mine>>;
  try {
    appts = await caller.appointments.mine();
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Appointments</h1>
      {appts.length === 0 ? (
        <p className="text-muted-foreground">No appointments yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {appts.map(({ appointment: a, service: svc }) => (
            <li key={a.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{svc.name}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(a.startTime).toLocaleString()}
                </p>
              </div>
              <span className={\`rounded-full px-2 py-1 text-xs capitalize \${STATUS_COLORS[a.status] ?? ""}\`}>
                {a.status}
              </span>
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

    return files;
  },
};
