import type { AppTemplate } from "./types";

export const jobboard: AppTemplate = {
  id:                   "jobboard",
  name:                 "Job Board",
  description:          "Job listings, applications, and applicant tracking pipeline",
  hint:                 "Lever / Greenhouse lite — post jobs, track candidates",
  defaultPayments:      [],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, _config) => {
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
export const jobStatus         = pgEnum("job_status",         ["draft", "published", "closed", "archived"]);
export const jobType           = pgEnum("job_type",           ["full_time", "part_time", "contract", "freelance", "internship"]);
export const workMode          = pgEnum("work_mode",          ["onsite", "remote", "hybrid"]);
export const applicationStatus = pgEnum("application_status", ["submitted", "reviewing", "interviewing", "offer", "rejected", "withdrawn"]);

// ─── Staff / Admin ────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Company Profiles ─────────────────────────────────────────────────────────
export const company = pgTable("company", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  website:     text("website"),
  logoUrl:     text("logo_url"),
  description: text("description"),
  location:    text("location"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const job = pgTable("job", {
  id:           uuid("id").primaryKey().defaultRandom(),
  companyId:    uuid("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
  title:        text("title").notNull(),
  slug:         text("slug").notNull().unique(),
  description:  text("description").notNull(),
  requirements: text("requirements"),
  benefits:     text("benefits"),
  location:     text("location"),
  salaryMin:    text("salary_min"),
  salaryMax:    text("salary_max"),
  salaryCurrency: text("salary_currency").notNull().default("USD"),
  type:         jobType("type").notNull().default("full_time"),
  workMode:     workMode("work_mode").notNull().default("onsite"),
  status:       jobStatus("status").notNull().default("draft"),
  applyUrl:     text("apply_url"),
  publishedAt:  timestamp("published_at"),
  expiresAt:    timestamp("expires_at"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Applications ─────────────────────────────────────────────────────────────
export const application = pgTable("application", {
  id:           uuid("id").primaryKey().defaultRandom(),
  jobId:        uuid("job_id").notNull().references(() => job.id, { onDelete: "cascade" }),
  candidateId:  text("candidate_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status:       applicationStatus("status").notNull().default("submitted"),
  coverLetter:  text("cover_letter"),
  resumeUrl:    text("resume_url"),
  portfolioUrl: text("portfolio_url"),
  answers:      text("answers"), // JSON string for custom questions
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Application Notes (recruiter internal) ───────────────────────────────────
export const applicationNote = pgTable("application_note", {
  id:            uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id").notNull().references(() => application.id, { onDelete: "cascade" }),
  authorId:      text("author_id").notNull().references(() => user.id),
  body:          text("body").notNull(),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

// ─── Saved Jobs ───────────────────────────────────────────────────────────────
export const savedJob = pgTable("saved_job", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  jobId:     uuid("job_id").notNull().references(() => job.id, { onDelete: "cascade" }),
  savedAt:   timestamp("saved_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createCompanySchema = z.object({
  name:        z.string().min(1).max(100),
  slug:        z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  website:     z.string().url().optional(),
  logoUrl:     z.string().url().optional(),
  description: z.string().max(2000).optional(),
  location:    z.string().max(200).optional(),
});

export const createJobSchema = z.object({
  title:          z.string().min(1).max(200),
  slug:           z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description:    z.string().min(1),
  requirements:   z.string().optional(),
  benefits:       z.string().optional(),
  location:       z.string().optional(),
  salaryMin:      z.string().optional(),
  salaryMax:      z.string().optional(),
  salaryCurrency: z.string().length(3).default("USD"),
  type:           z.enum(["full_time","part_time","contract","freelance","internship"]).default("full_time"),
  workMode:       z.enum(["onsite","remote","hybrid"]).default("onsite"),
  applyUrl:       z.string().url().optional(),
  expiresAt:      z.coerce.date().optional(),
});

export const updateJobSchema = createJobSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft","published","closed","archived"]).optional(),
});

export const applySchema = z.object({
  jobId:        z.string().uuid(),
  coverLetter:  z.string().max(5000).optional(),
  resumeUrl:    z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
});

export const updateApplicationStatusSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(["submitted","reviewing","interviewing","offer","rejected","withdrawn"]),
});

export const jobFiltersSchema = z.object({
  type:     z.enum(["full_time","part_time","contract","freelance","internship"]).optional(),
  workMode: z.enum(["onsite","remote","hybrid"]).optional(),
  search:   z.string().optional(),
  limit:    z.number().int().min(1).max(50).default(20),
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
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Jobs Router ───────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/jobs.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { application, company, job, savedJob } from "@${scope}/db/schema";
import { createJobSchema, jobFiltersSchema, updateJobSchema } from "@${scope}/validators";
import { priv, pub } from "../procedures";

export const jobsRouter = {
  list: pub
    .input(jobFiltersSchema)
    .route({ method: "GET", path: "/jobs/list" })
    .handler(async ({ context, input }) => {
      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;
      const conditions = [eq(job.status, "published")];
      if (input.type)     conditions.push(eq(job.type, input.type));
      if (input.workMode) conditions.push(eq(job.workMode, input.workMode));
      if (input.search)   conditions.push(
        or(ilike(job.title, \`%\${input.search}%\`), ilike(job.description, \`%\${input.search}%\`))!,
      );

      const rows = await context.db
        .select({ job, company })
        .from(job)
        .innerJoin(company, eq(job.companyId, company.id))
        .where(and(...conditions))
        .orderBy(desc(job.publishedAt))
        .limit(input.limit + 1)
        .offset(offset);

      const hasMore    = rows.length > input.limit;
      const items      = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;
      return { items, hasMore, nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null };
    }),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/jobs/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ job, company })
        .from(job)
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(job.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  mine: priv
    .route({ method: "GET", path: "/jobs/mine" })
    .handler(async ({ context }) => {
      const myCompany = await context.db
        .select()
        .from(company)
        .where(eq(company.ownerId, context.user.id))
        .limit(1);
      if (!myCompany[0]) return [];
      return context.db
        .select()
        .from(job)
        .where(eq(job.companyId, myCompany[0].id))
        .orderBy(desc(job.createdAt));
    }),

  create: priv
    .input(createJobSchema.extend({ companyId: z.string().uuid() }))
    .route({ method: "POST", path: "/jobs/create" })
    .handler(async ({ context, input }) => {
      const [comp] = await context.db
        .select()
        .from(company)
        .where(and(eq(company.id, input.companyId), eq(company.ownerId, context.user.id)))
        .limit(1);
      if (!comp) throw new ORPCError("FORBIDDEN");

      const [created] = await context.db.insert(job).values(input).returning();
      return created;
    }),

  update: priv
    .input(updateJobSchema)
    .route({ method: "PATCH", path: "/jobs/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [found] = await context.db
        .select({ job, company })
        .from(job)
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(job.id, id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.company.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const publishedAt = data.status === "published" && !found.job.publishedAt ? new Date() : undefined;
      const [updated] = await context.db
        .update(job)
        .set({ ...data, ...(publishedAt ? { publishedAt } : {}), updatedAt: new Date() })
        .where(eq(job.id, id))
        .returning();
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/jobs/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ job, company })
        .from(job)
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(job.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.company.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(job).where(eq(job.id, input.id));
      return { success: true };
    }),

  save: priv
    .input(z.object({ jobId: z.string().uuid() }))
    .route({ method: "POST", path: "/jobs/save" })
    .handler(async ({ context, input }) => {
      await context.db
        .insert(savedJob)
        .values({ userId: context.user.id, jobId: input.jobId })
        .onConflictDoNothing();
      return { saved: true };
    }),

  unsave: priv
    .input(z.object({ jobId: z.string().uuid() }))
    .route({ method: "DELETE", path: "/jobs/save" })
    .handler(async ({ context, input }) => {
      await context.db
        .delete(savedJob)
        .where(and(eq(savedJob.userId, context.user.id), eq(savedJob.jobId, input.jobId)));
      return { removed: true };
    }),

  savedJobs: priv
    .route({ method: "GET", path: "/jobs/saved" })
    .handler(({ context }) =>
      context.db
        .select({ job, company })
        .from(savedJob)
        .innerJoin(job, eq(savedJob.jobId, job.id))
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(savedJob.userId, context.user.id)),
    ),
};
`.trimStart();

    // ─── Applications Router ───────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/applications.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { application, applicationNote, company, job } from "@${scope}/db/schema";
import { applySchema, updateApplicationStatusSchema } from "@${scope}/validators";
import { priv } from "../procedures";

export const applicationsRouter = {
  apply: priv
    .input(applySchema)
    .route({ method: "POST", path: "/applications/apply" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(job)
        .where(and(eq(job.id, input.jobId), eq(job.status, "published")))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Job not found or closed" });

      const existing = await context.db
        .select()
        .from(application)
        .where(and(eq(application.jobId, input.jobId), eq(application.candidateId, context.user.id)))
        .limit(1);
      if (existing[0]) throw new ORPCError("CONFLICT", { message: "Already applied to this job" });

      const [created] = await context.db
        .insert(application)
        .values({ ...input, candidateId: context.user.id })
        .returning();
      return created;
    }),

  mine: priv
    .route({ method: "GET", path: "/applications/mine" })
    .handler(({ context }) =>
      context.db
        .select({ application, job, company })
        .from(application)
        .innerJoin(job, eq(application.jobId, job.id))
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(application.candidateId, context.user.id))
        .orderBy(desc(application.createdAt)),
    ),

  withdraw: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/applications/withdraw" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(application)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(and(eq(application.id, input.id), eq(application.candidateId, context.user.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  // ── Employer / Recruiter ───────────────────────────────────────────────────
  listForJob: priv
    .input(z.object({ jobId: z.string().uuid() }))
    .route({ method: "GET", path: "/applications/by-job" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ job, company })
        .from(job)
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(job.id, input.jobId))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.company.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      return context.db
        .select()
        .from(application)
        .where(eq(application.jobId, input.jobId))
        .orderBy(desc(application.createdAt));
    }),

  updateStatus: priv
    .input(updateApplicationStatusSchema)
    .route({ method: "PATCH", path: "/applications/status" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ application, job, company })
        .from(application)
        .innerJoin(job, eq(application.jobId, job.id))
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(application.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.company.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const [updated] = await context.db
        .update(application)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(application.id, input.id))
        .returning();
      return updated;
    }),

  addNote: priv
    .input(z.object({ applicationId: z.string().uuid(), body: z.string().min(1).max(3000) }))
    .route({ method: "POST", path: "/applications/notes" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select({ application, job, company })
        .from(application)
        .innerJoin(job, eq(application.jobId, job.id))
        .innerJoin(company, eq(job.companyId, company.id))
        .where(eq(application.id, input.applicationId))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.company.ownerId !== context.user.id) throw new ORPCError("FORBIDDEN");

      const [created] = await context.db
        .insert(applicationNote)
        .values({ applicationId: input.applicationId, authorId: context.user.id, body: input.body })
        .returning();
      return created;
    }),
};
`.trimStart();

    // ─── Companies Router ──────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/companies.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { company } from "@${scope}/db/schema";
import { createCompanySchema } from "@${scope}/validators";
import { priv, pub } from "../procedures";
import { z } from "zod";

export const companiesRouter = {
  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/companies/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(company)
        .where(eq(company.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  mine: priv
    .route({ method: "GET", path: "/companies/mine" })
    .handler(({ context }) =>
      context.db.select().from(company).where(eq(company.ownerId, context.user.id)),
    ),

  create: priv
    .input(createCompanySchema)
    .route({ method: "POST", path: "/companies/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(company)
        .values({ ...input, ownerId: context.user.id })
        .returning();
      return created;
    }),

  update: priv
    .input(createCompanySchema.partial().extend({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/companies/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(company)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(company.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),
};
`.trimStart();

    // ─── Root Router ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }         from "./auth";
import { jobsRouter }         from "./jobs";
import { applicationsRouter } from "./applications";
import { companiesRouter }    from "./companies";

export const appRouter = {
  auth:         authRouter,
  jobs:         jobsRouter,
  applications: applicationsRouter,
  companies:    companiesRouter,
};

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

export const getCachedJobs = unstable_cache(
  (input?: Parameters<typeof publicCaller.jobs.list>[0]) =>
    publicCaller.jobs.list(input ?? {}),
  ["jobs-list"],
  { revalidate: 120, tags: ["jobs"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedJobs } from "@/lib/server-orpc";

const TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract",
  freelance: "Freelance", internship: "Internship",
};
const MODE_LABELS: Record<string, string> = { onsite: "On-site", remote: "Remote", hybrid: "Hybrid" };

export default async function HomePage() {
  const { items } = await getCachedJobs({ limit: 10 });

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <section className="py-10 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Find your next role.</h1>
        <p className="mt-4 text-lg text-muted-foreground">Curated jobs from top companies.</p>
        <Link href="/jobs" className="mt-6 inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground">
          Browse All Jobs
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Latest Openings</h2>
        <ul className="divide-y rounded-lg border">
          {items.map(({ job: j, company: c }) => (
            <li key={j.id}>
              <Link href={\`/jobs/\${j.slug}\`} className="flex items-center gap-4 p-4 hover:bg-accent">
                {c.logoUrl && <img src={c.logoUrl} alt={c.name} className="h-10 w-10 rounded object-contain" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{j.title}</p>
                  <p className="text-sm text-muted-foreground">{c.name} · {j.location ?? "Remote"}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className="text-xs rounded-full border px-2 py-0.5">{TYPE_LABELS[j.type]}</span>
                  <span className="text-xs rounded-full border px-2 py-0.5">{MODE_LABELS[j.workMode]}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
`.trimStart();

    files["apps/web/src/app/jobs/page.tsx"] = `
import Link from "next/link";
import { getCachedJobs } from "@/lib/server-orpc";

interface Props { searchParams: Promise<{ type?: string; workMode?: string; search?: string }> }

export default async function JobsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { items, hasMore } = await getCachedJobs({
    type:     sp.type as never,
    workMode: sp.workMode as never,
    search:   sp.search,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Jobs ({items.length})</h1>
        <Link href="/employer/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Post a Job
        </Link>
      </div>

      <ul className="divide-y rounded-lg border">
        {items.map(({ job: j, company: c }) => (
          <li key={j.id}>
            <Link href={\`/jobs/\${j.slug}\`} className="flex items-center gap-4 p-5 hover:bg-accent">
              {c.logoUrl && <img src={c.logoUrl} alt={c.name} className="h-10 w-10 rounded object-contain" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{j.title}</p>
                <p className="text-sm text-muted-foreground">{c.name} · {j.location ?? "Remote"}</p>
                {(j.salaryMin || j.salaryMax) && (
                  <p className="text-sm text-muted-foreground">
                    {j.salaryMin && \`\${j.salaryCurrency} \${j.salaryMin}\`}
                    {j.salaryMin && j.salaryMax && " – "}
                    {j.salaryMax && j.salaryMax}
                  </p>
                )}
              </div>
              <span className="text-xs rounded-full border px-2 py-0.5 capitalize shrink-0">{j.workMode}</span>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="p-12 text-center text-muted-foreground">No jobs found.</li>
        )}
      </ul>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/jobs/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { ApplyButton } from "./_components/apply-button";

interface Props { params: Promise<{ slug: string }> }

export default async function JobDetailPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.jobs.get>>;
  try {
    data = await caller.jobs.get({ slug });
  } catch {
    notFound();
  }

  const { job: j, company: c } = data;

  return (
    <div className="mx-auto max-w-4xl gap-8 p-6 lg:grid lg:grid-cols-3">
      <article className="lg:col-span-2 space-y-6">
        <h1 className="text-3xl font-bold">{j.title}</h1>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border px-3 py-1 text-sm capitalize">{j.type.replace("_"," ")}</span>
          <span className="rounded-full border px-3 py-1 text-sm capitalize">{j.workMode}</span>
          {j.location && <span className="rounded-full border px-3 py-1 text-sm">{j.location}</span>}
        </div>
        <section className="prose max-w-none" dangerouslySetInnerHTML={{ __html: j.description }} />
        {j.requirements && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Requirements</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: j.requirements }} />
          </section>
        )}
        {j.benefits && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Benefits</h2>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: j.benefits }} />
          </section>
        )}
      </article>

      <aside className="space-y-4">
        <div className="sticky top-4 rounded-lg border p-6 space-y-4">
          {c.logoUrl && <img src={c.logoUrl} alt={c.name} className="h-14 w-14 rounded object-contain" />}
          <div>
            <p className="font-semibold">{c.name}</p>
            {c.location && <p className="text-sm text-muted-foreground">{c.location}</p>}
            {c.website && <a href={c.website} className="text-sm text-primary underline" target="_blank">Website</a>}
          </div>
          {(j.salaryMin || j.salaryMax) && (
            <p className="font-medium">
              {j.salaryCurrency} {j.salaryMin}{j.salaryMin && j.salaryMax ? " – " : ""}{j.salaryMax}
            </p>
          )}
          <ApplyButton jobId={j.id} applyUrl={j.applyUrl} />
        </div>
      </aside>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/jobs/[slug]/_components/apply-button.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { jobId: string; applyUrl: string | null }

export function ApplyButton({ jobId, applyUrl }: Props) {
  const router = useRouter();
  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState({ coverLetter: "", resumeUrl: "", portfolioUrl: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  if (applyUrl) {
    return (
      <a href={applyUrl} target="_blank" className="block w-full rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground">
        Apply on Company Site
      </a>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await orpc.applications.apply({
        jobId,
        coverLetter:  form.coverLetter || undefined,
        resumeUrl:    form.resumeUrl   || undefined,
        portfolioUrl: form.portfolioUrl || undefined,
      });
      router.push("/dashboard/applications");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground">
        Apply Now
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        placeholder="Cover letter (optional)"
        rows={4}
        className="w-full rounded-md border px-3 py-2 text-sm resize-none"
        value={form.coverLetter}
        onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
      />
      <input
        type="url"
        placeholder="Resume URL (optional)"
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={form.resumeUrl}
        onChange={(e) => setForm((f) => ({ ...f, resumeUrl: e.target.value }))}
      />
      <input
        type="url"
        placeholder="Portfolio URL (optional)"
        className="w-full rounded-md border px-3 py-2 text-sm"
        value={form.portfolioUrl}
        onChange={(e) => setForm((f) => ({ ...f, portfolioUrl: e.target.value }))}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={loading} className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Submitting…" : "Submit Application"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="w-full text-sm text-muted-foreground underline">Cancel</button>
    </form>
  );
}
`.trimStart();

    files["apps/web/src/app/dashboard/applications/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";

const STATUS_COLORS: Record<string, string> = {
  submitted:    "bg-blue-100 text-blue-800",
  reviewing:    "bg-yellow-100 text-yellow-800",
  interviewing: "bg-purple-100 text-purple-800",
  offer:        "bg-green-100 text-green-800",
  rejected:     "bg-red-100 text-red-800",
  withdrawn:    "bg-gray-100 text-gray-800",
};

export default async function MyApplicationsPage() {
  const caller = await getServerCaller();
  let apps: Awaited<ReturnType<typeof caller.applications.mine>>;
  try {
    apps = await caller.applications.mine();
  } catch {
    redirect("/auth/sign-in");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Applications</h1>
      {apps.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No applications yet.</p>
          <Link href="/jobs" className="mt-3 inline-block text-sm text-primary underline">Browse jobs</Link>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {apps.map(({ application: a, job: j, company: c }) => (
            <li key={a.id} className="flex items-center justify-between p-4">
              <div>
                <Link href={\`/jobs/\${j.slug}\`} className="font-medium hover:text-primary">{j.title}</Link>
                <p className="text-sm text-muted-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={\`rounded-full px-2 py-1 text-xs capitalize \${STATUS_COLORS[a.status] ?? ""}\`}>
                {a.status.replace("_"," ")}
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
