import type { AppTemplate } from "./types";

export const lms: AppTemplate = {
  id:                   "lms",
  name:                 "LMS",
  description:          "Courses, lessons, enrollments, and progress tracking",
  hint:                 "Online school, video courses, certificates",
  defaultPayments:      ["stripe"],
  defaultAuthProviders: ["email", "google"],

  generate: (scope) => ({
    "packages/db/src/schema.ts": `
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

// ─── Enums ───────────────────────────────────────────────────────────────────
export const courseStatus = pgEnum("course_status", ["draft", "published", "archived"]);

// ─── Tables ──────────────────────────────────────────────────────────────────
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

export const lesson = pgTable("lesson", {
  id:          uuid("id").primaryKey().defaultRandom(),
  courseId:    uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
  title:       text("title").notNull(),
  description: text("description"),
  videoUrl:    text("video_url"),
  content:     text("content"),
  order:       integer("order").notNull().default(0),
  isFree:      boolean("is_free").notNull().default(false),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const enrollment = pgTable("enrollment", {
  id:                uuid("id").primaryKey().defaultRandom(),
  userId:            text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId:          uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
  stripePaymentId:   text("stripe_payment_id"),
  completedAt:       timestamp("completed_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

export const lessonProgress = pgTable("lesson_progress", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  lessonId:    uuid("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});
`.trimStart(),

    "packages/validators/src/index.ts": `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createCourseSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  coverImage:  z.string().url().optional(),
  price:       z.string().regex(/^\\d+\\.\\d{2}$/).default("0.00"),
  isFree:      z.boolean().default(false),
});

export const updateCourseSchema = createCourseSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const createLessonSchema = z.object({
  courseId:    z.string().uuid(),
  title:       z.string().min(1).max(200),
  description: z.string().optional(),
  videoUrl:    z.string().url().optional(),
  content:     z.string().optional(),
  order:       z.number().int().min(0).default(0),
  isFree:      z.boolean().default(false),
});

export const updateLessonSchema = createLessonSchema.partial().extend({ id: z.string().uuid() });

export const enrollSchema = z.object({ courseId: z.string().uuid() });
`.trimStart(),

    "packages/api/src/orpc-routers/courses.ts": `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { course, enrollment, lesson, lessonProgress } from "@${scope}/db/schema";
import { createCourseSchema, createLessonSchema, enrollSchema, updateCourseSchema, updateLessonSchema } from "@${scope}/validators";

import { priv, pub } from "../procedures";

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

      const lessons = await context.db
        .select()
        .from(lesson)
        .where(eq(lesson.courseId, found.id))
        .orderBy(lesson.order);

      return { ...found, lessons };
    }),

  create: priv
    .input(createCourseSchema)
    .route({ method: "POST", path: "/courses/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(course)
        .values({ ...input, instructorId: context.user.id })
        .returning();
      return created;
    }),

  update: priv
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

  addLesson: priv
    .input(createLessonSchema)
    .route({ method: "POST", path: "/courses/lessons/add" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(lesson).values(input).returning();
      return created;
    }),

  updateLesson: priv
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
      const existing = await context.db
        .select()
        .from(enrollment)
        .where(and(eq(enrollment.userId, context.user.id), eq(enrollment.courseId, input.courseId)))
        .limit(1);
      if (existing[0]) throw new ORPCError("CONFLICT", { message: "Already enrolled" });

      const [created] = await context.db
        .insert(enrollment)
        .values({ userId: context.user.id, courseId: input.courseId })
        .returning();
      return created;
    }),

  completeLesson: priv
    .input(z.object({ lessonId: z.string().uuid() }))
    .route({ method: "POST", path: "/courses/lessons/complete" })
    .handler(async ({ context, input }) => {
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
};
`.trimStart(),

    "packages/api/src/orpc-routers/index.ts": `
import { authRouter }    from "./auth";
import { coursesRouter } from "./courses";

export const appRouter = {
  auth:    authRouter,
  courses: coursesRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart(),
  }),
};
