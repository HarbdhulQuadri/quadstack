import type { AppTemplate } from "./types";

export const lms: AppTemplate = {
  id:                   "lms",
  name:                 "LMS",
  description:          "Courses, lessons, enrollments, and progress tracking",
  hint:                 "Online school, video courses, certificates",
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
export const courseStatus     = pgEnum("course_status",     ["draft", "published", "archived"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["pending_payment", "active", "completed"]);

// ─── Staff / Admin ────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("instructor"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Courses ──────────────────────────────────────────────────────────────────
export const course = pgTable("course", {
  id:           uuid("id").primaryKey().defaultRandom(),
  title:        text("title").notNull(),
  slug:         text("slug").notNull().unique(),
  description:  text("description"),
  coverImage:   text("cover_image"),
  price:        numeric("price", { precision: 12, scale: 2 }).notNull().default("0.00"),
  isFree:       boolean("is_free").notNull().default(false),
  status:       courseStatus("status").notNull().default("draft"),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const section = pgTable("section", {
  id:        uuid("id").primaryKey().defaultRandom(),
  courseId:  uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
  title:     text("title").notNull(),
  order:     integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lesson = pgTable("lesson", {
  id:          uuid("id").primaryKey().defaultRandom(),
  courseId:    uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
  sectionId:   uuid("section_id").references(() => section.id, { onDelete: "set null" }),
  title:       text("title").notNull(),
  description: text("description"),
  videoUrl:    text("video_url"),
  content:     text("content"),
  duration:    integer("duration"),
  order:       integer("order").notNull().default(0),
  isFree:      boolean("is_free").notNull().default(false),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const enrollment = pgTable("enrollment", {
  id:                uuid("id").primaryKey().defaultRandom(),
  userId:            text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId:          uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
  status:            enrollmentStatus("status").notNull().default("pending_payment"),
  stripePaymentId:   text("stripe_payment_id"),
  stripeSessionId:   text("stripe_session_id"),
  completedAt:       timestamp("completed_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

export const lessonProgress = pgTable("lesson_progress", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lessonId:    uuid("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createCourseSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  coverImage:  z.string().url().optional(),
  price:       z.string().regex(/^\d+\.\d{2}$/).default("0.00"),
  isFree:      z.boolean().default(false),
});

export const updateCourseSchema = createCourseSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const createSectionSchema = z.object({
  courseId: z.string().uuid(),
  title:    z.string().min(1).max(200),
  order:    z.number().int().min(0).default(0),
});

export const createLessonSchema = z.object({
  courseId:    z.string().uuid(),
  sectionId:   z.string().uuid().optional(),
  title:       z.string().min(1).max(200),
  description: z.string().optional(),
  videoUrl:    z.string().url().optional(),
  content:     z.string().optional(),
  duration:    z.number().int().min(0).optional(),
  order:       z.number().int().min(0).default(0),
  isFree:      z.boolean().default(false),
});

export const updateLessonSchema = createLessonSchema.partial().extend({ id: z.string().uuid() });

export const enrollSchema = z.object({ courseId: z.string().uuid() });
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

// Instructor / admin — grants access to course management.
// Grant: INSERT INTO staff_role (user_id, role) VALUES ('<user-id>', 'instructor');
export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select().from(staffRole).where(eq(staffRole.userId, context.user.id)).limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Instructor access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Courses Router ────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/courses.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";

import { course, enrollment, lesson, lessonProgress, section } from "@${scope}/db/schema";
import {
  createCourseSchema,
  createLessonSchema,
  createSectionSchema,
  enrollSchema,
  updateCourseSchema,
  updateLessonSchema,
} from "@${scope}/validators";
import { adminPriv, priv, pub } from "../procedures";

export const coursesRouter = {
  list: pub
    .route({ method: "GET", path: "/courses/list" })
    .handler(({ context }) =>
      context.db.select().from(course).where(eq(course.status, "published")),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/courses/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(course)
        .where(and(eq(course.slug, input.slug), eq(course.status, "published")))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const sections = await context.db
        .select()
        .from(section)
        .where(eq(section.courseId, found.id))
        .orderBy(asc(section.order));

      const lessons = await context.db
        .select()
        .from(lesson)
        .where(eq(lesson.courseId, found.id))
        .orderBy(asc(lesson.order));

      return { ...found, sections, lessons };
    }),

  create: adminPriv
    .input(createCourseSchema)
    .route({ method: "POST", path: "/courses/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(course)
        .values({ ...input, instructorId: context.user.id })
        .returning();
      return created;
    }),

  update: adminPriv
    .input(updateCourseSchema)
    .route({ method: "PATCH", path: "/courses/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(course)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(course.id, id), eq(course.instructorId, context.user.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/courses/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(course).where(eq(course.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.instructorId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(course).where(eq(course.id, input.id));
      return { success: true };
    }),

  addSection: adminPriv
    .input(createSectionSchema)
    .route({ method: "POST", path: "/courses/sections/add" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(section).values(input).returning();
      return created;
    }),

  addLesson: adminPriv
    .input(createLessonSchema)
    .route({ method: "POST", path: "/courses/lessons/add" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(lesson).values(input).returning();
      return created;
    }),

  updateLesson: adminPriv
    .input(updateLessonSchema)
    .route({ method: "PATCH", path: "/courses/lessons/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(lesson)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(lesson.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  enroll: priv
    .input(enrollSchema)
    .route({ method: "POST", path: "/courses/enroll" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(course)
        .where(eq(course.id, input.courseId))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const existing = await context.db
        .select()
        .from(enrollment)
        .where(and(eq(enrollment.userId, context.user.id), eq(enrollment.courseId, input.courseId)))
        .limit(1);
      if (existing[0]) throw new ORPCError("CONFLICT", { message: "Already enrolled" });

      // Free courses enroll immediately; paid courses require Stripe (see /courses/checkout)
      if (!found.isFree && parseFloat(found.price ?? "0") > 0) {
        throw new ORPCError("BAD_REQUEST", { message: "This course requires payment — use the checkout endpoint" });
      }

      const [created] = await context.db
        .insert(enrollment)
        .values({ userId: context.user.id, courseId: input.courseId, status: "active" })
        .returning();
      return created;
    }),

  completeLesson: priv
    .input(z.object({ lessonId: z.string().uuid() }))
    .route({ method: "POST", path: "/courses/lessons/complete" })
    .handler(async ({ context, input }) => {
      const [ls] = await context.db
        .select()
        .from(lesson)
        .where(eq(lesson.id, input.lessonId))
        .limit(1);
      if (!ls) throw new ORPCError("NOT_FOUND");

      const enrolled = await context.db
        .select()
        .from(enrollment)
        .where(and(
          eq(enrollment.userId, context.user.id),
          eq(enrollment.courseId, ls.courseId),
          eq(enrollment.status, "active"),
        ))
        .limit(1);
      if (!enrolled[0] && !ls.isFree) throw new ORPCError("FORBIDDEN", { message: "Not enrolled" });

      const [created] = await context.db
        .insert(lessonProgress)
        .values({ userId: context.user.id, lessonId: input.lessonId })
        .onConflictDoNothing()
        .returning();
      return created ?? { alreadyCompleted: true };
    }),

  myEnrollments: priv
    .route({ method: "GET", path: "/courses/my-enrollments" })
    .handler(({ context }) =>
      context.db
        .select({ enrollment, course })
        .from(enrollment)
        .innerJoin(course, eq(enrollment.courseId, course.id))
        .where(eq(enrollment.userId, context.user.id)),
    ),

  myProgress: priv
    .input(z.object({ courseId: z.string().uuid() }))
    .route({ method: "GET", path: "/courses/my-progress" })
    .handler(async ({ context, input }) => {
      const lessons = await context.db
        .select()
        .from(lesson)
        .where(eq(lesson.courseId, input.courseId));

      const progress = await context.db
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.userId, context.user.id));

      const completedIds = new Set(progress.map((p) => p.lessonId));
      const total = lessons.length;
      const completed = lessons.filter((l) => completedIds.has(l.id)).length;

      return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
    }),
};
`.trimStart();

    // ─── Billing / Checkout Router ─────────────────────────────────────────────
    if (hasStripe) {
      files["packages/api/src/orpc-routers/checkout.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

import { course, enrollment } from "@${scope}/db/schema";
import { priv } from "../procedures";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" });

export const checkoutRouter = {
  createSession: priv
    .input(z.object({ courseId: z.string().uuid() }))
    .route({ method: "POST", path: "/checkout/course" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(course)
        .where(eq(course.id, input.courseId))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.isFree || parseFloat(found.price ?? "0") === 0) {
        throw new ORPCError("BAD_REQUEST", { message: "Course is free — use the enroll endpoint" });
      }

      const existing = await context.db
        .select()
        .from(enrollment)
        .where(and(eq(enrollment.userId, context.user.id), eq(enrollment.courseId, input.courseId)))
        .limit(1);
      if (existing[0]?.status === "active") throw new ORPCError("CONFLICT", { message: "Already enrolled" });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          quantity: 1,
          price_data: {
            currency:     "usd",
            unit_amount:  Math.round(parseFloat(found.price) * 100),
            product_data: { name: found.title, images: found.coverImage ? [found.coverImage] : [] },
          },
        }],
        success_url: \`\${process.env.NEXT_PUBLIC_WEB_URL}/learn/\${found.slug}?enrolled=1\`,
        cancel_url:  \`\${process.env.NEXT_PUBLIC_WEB_URL}/courses/\${found.slug}\`,
        metadata:    { courseId: input.courseId, userId: context.user.id },
      });

      // Pre-create enrollment in pending state
      if (existing[0]) {
        await context.db
          .update(enrollment)
          .set({ status: "pending_payment", stripeSessionId: session.id })
          .where(eq(enrollment.id, existing[0].id));
      } else {
        await context.db.insert(enrollment).values({
          userId:          context.user.id,
          courseId:        input.courseId,
          status:          "pending_payment",
          stripeSessionId: session.id,
        });
      }

      return { url: session.url };
    }),
};
`.trimStart();

      files["apps/web/src/app/api/stripe/webhook/route.ts"] = `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@${scope}/db/client";
import { enrollment } from "@${scope}/db/schema";
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
    if (session.mode !== "payment") return NextResponse.json({ received: true });

    const courseId = session.metadata?.courseId;
    const userId   = session.metadata?.userId;
    if (!courseId || !userId) return NextResponse.json({ received: true });

    await db
      .update(enrollment)
      .set({ status: "active", stripePaymentId: session.payment_intent as string })
      .where(eq(enrollment.stripeSessionId, session.id));
  }

  return NextResponse.json({ received: true });
}
`.trimStart();
    }

    // ─── Root Router ──────────────────────────────────────────────────────────
    const checkoutImport = hasStripe ? `import { checkoutRouter } from "./checkout";\n` : "";
    const checkoutEntry  = hasStripe ? `  checkout: checkoutRouter,\n` : "";

    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }    from "./auth";
import { coursesRouter } from "./courses";
${checkoutImport}
export const appRouter = {
  auth:     authRouter,
  courses:  coursesRouter,
${checkoutEntry}};

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

export const getCachedCourses = unstable_cache(
  () => publicCaller.courses.list(),
  ["courses-list"],
  { revalidate: 300, tags: ["courses"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedCourses } from "@/lib/server-orpc";

export default async function HomePage() {
  const courses = await getCachedCourses();

  return (
    <main className="mx-auto max-w-6xl space-y-12 p-6">
      <section className="py-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Learn Anything.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Expert-led courses to grow your skills.</p>
        <Link href="/courses" className="mt-6 inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
          Browse Courses
        </Link>
      </section>

      {courses.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold">Featured Courses</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.slice(0, 6).map((c) => (
              <Link key={c.id} href={\`/courses/\${c.slug}\`} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
                {c.coverImage && (
                  <img src={c.coverImage} alt={c.title} className="h-40 w-full object-cover" />
                )}
                <div className="p-4 space-y-1">
                  <h3 className="font-semibold group-hover:text-primary">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.isFree ? "Free" : \`$\${c.price}\`}</p>
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

    files["apps/web/src/app/courses/page.tsx"] = `
import Link from "next/link";
import { getCachedCourses } from "@/lib/server-orpc";

export default async function CoursesPage() {
  const courses = await getCachedCourses();

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <h1 className="text-3xl font-bold">All Courses</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <Link key={c.id} href={\`/courses/\${c.slug}\`} className="group rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
            {c.coverImage && (
              <img src={c.coverImage} alt={c.title} className="h-40 w-full object-cover" />
            )}
            <div className="p-4 space-y-2">
              <h2 className="font-semibold group-hover:text-primary">{c.title}</h2>
              {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
              <p className="text-sm font-medium">{c.isFree ? "Free" : \`$\${c.price}\`}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/courses/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { CourseEnrollButton } from "./_components/enroll-button";

interface Props { params: Promise<{ slug: string }> }

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let course: Awaited<ReturnType<typeof caller.courses.get>>;
  try {
    course = await caller.courses.get({ slug });
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {course.coverImage && (
        <img src={course.coverImage} alt={course.title} className="h-64 w-full rounded-lg object-cover" />
      )}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">{course.title}</h1>
        {course.description && <p className="text-muted-foreground">{course.description}</p>}
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold">{course.isFree ? "Free" : \`$\${course.price}\`}</span>
          <CourseEnrollButton courseId={course.id} isFree={course.isFree} price={course.price} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Curriculum ({course.lessons.length} lessons)</h2>
        <ul className="divide-y rounded-lg border">
          {course.lessons.map((l, i) => (
            <li key={l.id} className="flex items-center justify-between p-4">
              <span className="text-sm">{i + 1}. {l.title}</span>
              {l.isFree && <span className="text-xs text-primary">Free preview</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/courses/[slug]/_components/enroll-button.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { courseId: string; isFree: boolean; price: string }

export function CourseEnrollButton({ courseId, isFree, price }: Props) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleEnroll() {
    setLoading(true);
    try {
      if (isFree || parseFloat(price) === 0) {
        await orpc.courses.enroll({ courseId });
        router.push("/dashboard/courses");
      } else {
        const { url } = await orpc.checkout.createSession({ courseId });
        if (url) window.location.href = url;
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleEnroll}
      disabled={loading}
      className="rounded-md bg-primary px-6 py-2 font-medium text-primary-foreground disabled:opacity-50"
    >
      {loading ? "Processing…" : isFree || parseFloat(price) === 0 ? "Enroll Free" : \`Buy — $\${price}\`}
    </button>
  );
}
`.trimStart();

    files["apps/web/src/app/learn/[slug]/page.tsx"] = `
import { notFound, redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { LessonPlayer } from "./_components/lesson-player";

interface Props { params: Promise<{ slug: string }>; searchParams: Promise<{ lesson?: string }> }

export default async function LearnPage({ params, searchParams }: Props) {
  const { slug }          = await params;
  const { lesson: qLesson } = await searchParams;

  const caller = await getServerCaller();
  let course: Awaited<ReturnType<typeof caller.courses.get>>;
  try {
    course = await caller.courses.get({ slug });
  } catch {
    notFound();
  }

  let enrollments: Awaited<ReturnType<typeof caller.courses.myEnrollments>>;
  try {
    enrollments = await caller.courses.myEnrollments();
  } catch {
    redirect(\`/courses/\${slug}\`);
  }

  const enrolled = enrollments.some((e) => e.course.id === course.id && e.enrollment.status === "active");
  if (!enrolled) redirect(\`/courses/\${slug}\`);

  const currentLesson = course.lessons.find((l) => l.id === qLesson) ?? course.lessons[0];

  return (
    <div className="flex h-screen">
      <aside className="w-72 overflow-y-auto border-r">
        <div className="p-4 font-semibold">{course.title}</div>
        <ul className="divide-y">
          {course.lessons.map((l) => (
            <li key={l.id}>
              <a
                href={\`/learn/\${slug}?lesson=\${l.id}\`}
                className={\`block p-3 text-sm hover:bg-accent \${l.id === currentLesson?.id ? "bg-accent font-medium" : ""}\`}
              >
                {l.title}
              </a>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        {currentLesson ? (
          <LessonPlayer lesson={currentLesson} courseId={course.id} />
        ) : (
          <p className="text-muted-foreground">No lessons yet.</p>
        )}
      </main>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/learn/[slug]/_components/lesson-player.tsx"] = `
"use client";
import { useState } from "react";
import { orpc } from "@/lib/orpc";

interface Lesson { id: string; title: string; videoUrl: string | null; content: string | null }
interface Props  { lesson: Lesson; courseId: string }

export function LessonPlayer({ lesson, courseId }: Props) {
  const [done, setDone] = useState(false);

  async function markComplete() {
    await orpc.courses.completeLesson({ lessonId: lesson.id });
    setDone(true);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{lesson.title}</h1>
      {lesson.videoUrl && (
        <video src={lesson.videoUrl} controls className="w-full rounded-lg aspect-video bg-black" />
      )}
      {lesson.content && (
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: lesson.content }} />
      )}
      <button
        onClick={markComplete}
        disabled={done}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {done ? "✓ Completed" : "Mark as Complete"}
      </button>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/courses/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

export default async function MyCoursesPage() {
  const caller = await getServerCaller();
  let enrollments: Awaited<ReturnType<typeof caller.courses.myEnrollments>>;
  try {
    enrollments = await caller.courses.myEnrollments();
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Courses</h1>
      {enrollments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No courses yet.</p>
          <Link href="/courses" className="mt-3 inline-block text-sm text-primary underline">Browse courses</Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {enrollments.map(({ course, enrollment: en }) => (
            <Link key={en.id} href={\`/learn/\${course.slug}\`} className="group rounded-lg border p-4 hover:shadow-md transition-shadow">
              <h2 className="font-semibold group-hover:text-primary">{course.title}</h2>
              <p className="mt-1 text-xs capitalize text-muted-foreground">{en.status}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
`.trimStart();

    // ─── Admin Pages ───────────────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/courses/page.tsx"] = `
import Link from "next/link";
import { getServerCaller } from "@/lib/server-orpc";

export default async function AdminCoursesPage() {
  const caller  = await getServerCaller();
  const courses = await caller.courses.list();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link href="/courses/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          New Course
        </Link>
      </div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Title</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {courses.map((c) => (
              <tr key={c.id} className="hover:bg-muted/25">
                <td className="px-4 py-3 font-medium">{c.title}</td>
                <td className="px-4 py-3 capitalize">{c.status}</td>
                <td className="px-4 py-3">{c.isFree ? "Free" : \`$\${c.price}\`}</td>
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
