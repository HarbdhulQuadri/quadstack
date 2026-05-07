import type { AppTemplate } from "./types";

export const community: AppTemplate = {
  id:                   "community",
  name:                 "Community / Forum",
  description:          "Channels, threads, replies, votes, and moderation",
  hint:                 "Reddit / Discourse lite — discussion boards",
  defaultPayments:      [],
  defaultAuthProviders: ["email", "google"],

  generate: (scope, _config) => {
    const files: Record<string, string> = {};

    // ─── DB Schema ─────────────────────────────────────────────────────────────
    files["packages/db/src/schema.ts"] = `
export * from "./auth-schema";

import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const voteTarget  = pgEnum("vote_target",  ["thread", "reply"]);
export const voteValue   = pgEnum("vote_value",   ["up", "down"]);
export const reportStatus = pgEnum("report_status", ["pending", "resolved", "dismissed"]);

// ─── Staff / Moderators ───────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("moderator"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Channels ─────────────────────────────────────────────────────────────────
export const channel = pgTable("channel", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  icon:        text("icon").default("💬"),
  isPrivate:   boolean("is_private").notNull().default(false),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

// ─── Threads ──────────────────────────────────────────────────────────────────
export const thread = pgTable("thread", {
  id:         uuid("id").primaryKey().defaultRandom(),
  channelId:  uuid("channel_id").notNull().references(() => channel.id, { onDelete: "cascade" }),
  authorId:   text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title:      text("title").notNull(),
  body:       text("body"),
  isPinned:   boolean("is_pinned").notNull().default(false),
  isLocked:   boolean("is_locked").notNull().default(false),
  replyCount: integer("reply_count").notNull().default(0),
  score:      integer("score").notNull().default(0),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Replies ──────────────────────────────────────────────────────────────────
export const reply = pgTable("reply", {
  id:        uuid("id").primaryKey().defaultRandom(),
  threadId:  uuid("thread_id").notNull().references(() => thread.id, { onDelete: "cascade" }),
  authorId:  text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  parentId:  uuid("parent_id"),
  body:      text("body").notNull(),
  score:     integer("score").notNull().default(0),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Votes ────────────────────────────────────────────────────────────────────
export const vote = pgTable("vote", {
  id:         uuid("id").primaryKey().defaultRandom(),
  userId:     text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  targetId:   uuid("target_id").notNull(),
  targetType: voteTarget("target_type").notNull(),
  value:      voteValue("vote_value").notNull(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── Reports ──────────────────────────────────────────────────────────────────
export const report = pgTable("report", {
  id:         uuid("id").primaryKey().defaultRandom(),
  reporterId: text("reporter_id").notNull().references(() => user.id),
  targetId:   uuid("target_id").notNull(),
  targetType: voteTarget("target_type").notNull(),
  reason:     text("reason").notNull(),
  status:     reportStatus("status").notNull().default("pending"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createChannelSchema = z.object({
  name:        z.string().min(1).max(60),
  slug:        z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  icon:        z.string().max(4).default("💬"),
  isPrivate:   z.boolean().default(false),
});

export const createThreadSchema = z.object({
  channelId: z.string().uuid(),
  title:     z.string().min(1).max(300),
  body:      z.string().max(50000).optional(),
});

export const createReplySchema = z.object({
  threadId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  body:     z.string().min(1).max(10000),
});

export const voteSchema = z.object({
  targetId:   z.string().uuid(),
  targetType: z.enum(["thread", "reply"]),
  value:      z.enum(["up", "down"]),
});

export const reportSchema = z.object({
  targetId:   z.string().uuid(),
  targetType: z.enum(["thread", "reply"]),
  reason:     z.string().min(1).max(500),
});

export const threadFiltersSchema = z.object({
  channelSlug: z.string().optional(),
  sort:        z.enum(["new", "top"]).default("new"),
  limit:       z.number().int().min(1).max(50).default(20),
  cursor:      z.string().optional(),
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

// Moderator / admin
export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select().from(staffRole).where(eq(staffRole.userId, context.user.id)).limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Moderator access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Channels Router ───────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/channels.ts"] = `
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { channel } from "@${scope}/db/schema";
import { createChannelSchema } from "@${scope}/validators";
import { adminPriv, pub } from "../procedures";

export const channelsRouter = {
  list: pub
    .route({ method: "GET", path: "/channels/list" })
    .handler(({ context }) =>
      context.db.select().from(channel).where(eq(channel.isPrivate, false)),
    ),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/channels/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(channel)
        .where(eq(channel.slug, input.slug))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  create: adminPriv
    .input(createChannelSchema)
    .route({ method: "POST", path: "/channels/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(channel).values(input).returning();
      return created;
    }),

  update: adminPriv
    .input(createChannelSchema.partial().extend({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/channels/update" })
    .handler(async ({ context, input }) => {
      const { id, ...data } = input;
      const [updated] = await context.db
        .update(channel)
        .set(data)
        .where(eq(channel.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/channels/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(channel).where(eq(channel.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Threads Router ────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/threads.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { channel, reply, report, thread, vote } from "@${scope}/db/schema";
import { createThreadSchema, reportSchema, threadFiltersSchema } from "@${scope}/validators";
import { adminPriv, priv, pub } from "../procedures";

export const threadsRouter = {
  list: pub
    .input(threadFiltersSchema)
    .route({ method: "GET", path: "/threads/list" })
    .handler(async ({ context, input }) => {
      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;

      let query = context.db
        .select({ thread, channelSlug: channel.slug, channelName: channel.name })
        .from(thread)
        .innerJoin(channel, eq(thread.channelId, channel.id))
        .$dynamic();

      if (input.channelSlug) {
        const [ch] = await context.db
          .select()
          .from(channel)
          .where(eq(channel.slug, input.channelSlug))
          .limit(1);
        if (ch) query = query.where(eq(thread.channelId, ch.id));
      }

      const orderCol = input.sort === "top" ? desc(thread.score) : desc(thread.createdAt);
      const rows = await query.orderBy(orderCol).limit(input.limit + 1).offset(offset);

      const hasMore    = rows.length > input.limit;
      const items      = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;
      return { items, hasMore, nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null };
    }),

  get: pub
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/threads/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(thread)
        .where(eq(thread.id, input.id))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");

      const replies = await context.db
        .select()
        .from(reply)
        .where(and(eq(reply.threadId, input.id), eq(reply.isDeleted, false)))
        .orderBy(desc(reply.score), reply.createdAt);

      return { ...found, replies };
    }),

  create: priv
    .input(createThreadSchema)
    .route({ method: "POST", path: "/threads/create" })
    .handler(async ({ context, input }) => {
      const [ch] = await context.db
        .select()
        .from(channel)
        .where(eq(channel.id, input.channelId))
        .limit(1);
      if (!ch) throw new ORPCError("NOT_FOUND");

      const [created] = await context.db
        .insert(thread)
        .values({ ...input, authorId: context.user.id })
        .returning();
      return created;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/threads/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(thread).where(eq(thread.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.authorId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(thread).where(eq(thread.id, input.id));
      return { success: true };
    }),

  reply: priv
    .input(z.object({ threadId: z.string().uuid(), parentId: z.string().uuid().optional(), body: z.string().min(1).max(10000) }))
    .route({ method: "POST", path: "/threads/reply" })
    .handler(async ({ context, input }) => {
      const [t] = await context.db.select().from(thread).where(eq(thread.id, input.threadId)).limit(1);
      if (!t) throw new ORPCError("NOT_FOUND");
      if (t.isLocked) throw new ORPCError("BAD_REQUEST", { message: "Thread is locked" });

      const [created] = await context.db
        .insert(reply)
        .values({ ...input, authorId: context.user.id })
        .returning();

      await context.db
        .update(thread)
        .set({ replyCount: sql\`\${thread.replyCount} + 1\` })
        .where(eq(thread.id, input.threadId));

      return created;
    }),

  deleteReply: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/threads/reply/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(reply).where(eq(reply.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.authorId !== context.user.id) throw new ORPCError("FORBIDDEN");
      // Soft delete to preserve thread structure
      await context.db.update(reply).set({ isDeleted: true, body: "[deleted]" }).where(eq(reply.id, input.id));
      return { success: true };
    }),

  vote: priv
    .input(z.object({ targetId: z.string().uuid(), targetType: z.enum(["thread","reply"]), value: z.enum(["up","down"]) }))
    .route({ method: "POST", path: "/threads/vote" })
    .handler(async ({ context, input }) => {
      const existing = await context.db
        .select()
        .from(vote)
        .where(and(eq(vote.userId, context.user.id), eq(vote.targetId, input.targetId)))
        .limit(1);

      const delta = input.value === "up" ? 1 : -1;

      if (existing[0]) {
        if (existing[0].value === input.value) {
          // Toggle off
          await context.db.delete(vote).where(eq(vote.id, existing[0].id));
          const undoDelta = input.value === "up" ? -1 : 1;
          if (input.targetType === "thread") {
            await context.db.update(thread).set({ score: sql\`\${thread.score} + \${undoDelta}\` }).where(eq(thread.id, input.targetId));
          } else {
            await context.db.update(reply).set({ score: sql\`\${reply.score} + \${undoDelta}\` }).where(eq(reply.id, input.targetId));
          }
          return { removed: true };
        }
        // Change vote
        await context.db.update(vote).set({ value: input.value }).where(eq(vote.id, existing[0].id));
        const changeDelta = input.value === "up" ? 2 : -2;
        if (input.targetType === "thread") {
          await context.db.update(thread).set({ score: sql\`\${thread.score} + \${changeDelta}\` }).where(eq(thread.id, input.targetId));
        } else {
          await context.db.update(reply).set({ score: sql\`\${reply.score} + \${changeDelta}\` }).where(eq(reply.id, input.targetId));
        }
      } else {
        await context.db.insert(vote).values({ ...input, userId: context.user.id });
        if (input.targetType === "thread") {
          await context.db.update(thread).set({ score: sql\`\${thread.score} + \${delta}\` }).where(eq(thread.id, input.targetId));
        } else {
          await context.db.update(reply).set({ score: sql\`\${reply.score} + \${delta}\` }).where(eq(reply.id, input.targetId));
        }
      }
      return { voted: true };
    }),

  report: priv
    .input(reportSchema)
    .route({ method: "POST", path: "/threads/report" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(report)
        .values({ ...input, reporterId: context.user.id })
        .returning();
      return created;
    }),

  // ── Moderation ────────────────────────────────────────────────────────────
  pin: adminPriv
    .input(z.object({ id: z.string().uuid(), pinned: z.boolean() }))
    .route({ method: "PATCH", path: "/threads/pin" })
    .handler(async ({ context, input }) => {
      await context.db.update(thread).set({ isPinned: input.pinned }).where(eq(thread.id, input.id));
      return { success: true };
    }),

  lock: adminPriv
    .input(z.object({ id: z.string().uuid(), locked: z.boolean() }))
    .route({ method: "PATCH", path: "/threads/lock" })
    .handler(async ({ context, input }) => {
      await context.db.update(thread).set({ isLocked: input.locked }).where(eq(thread.id, input.id));
      return { success: true };
    }),

  listReports: adminPriv
    .route({ method: "GET", path: "/threads/reports" })
    .handler(({ context }) =>
      context.db.select().from(report).where(eq(report.status, "pending")).orderBy(desc(report.createdAt)),
    ),

  resolveReport: adminPriv
    .input(z.object({ id: z.string().uuid(), status: z.enum(["resolved","dismissed"]) }))
    .route({ method: "PATCH", path: "/threads/reports/resolve" })
    .handler(async ({ context, input }) => {
      await context.db.update(report).set({ status: input.status }).where(eq(report.id, input.id));
      return { success: true };
    }),
};
`.trimStart();

    // ─── Root Router ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }    from "./auth";
import { channelsRouter } from "./channels";
import { threadsRouter }  from "./threads";

export const appRouter = {
  auth:     authRouter,
  channels: channelsRouter,
  threads:  threadsRouter,
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

export const getCachedChannels = unstable_cache(
  () => publicCaller.channels.list(),
  ["channels-list"],
  { revalidate: 300, tags: ["channels"] },
);
`.trimStart();

    // ─── Web Pages ─────────────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedChannels } from "@/lib/server-orpc";
import { getServerCaller } from "@/lib/server-orpc";

export default async function HomePage() {
  const [channels, { items }] = await Promise.all([
    getCachedChannels(),
    getServerCaller().then((c) => c.threads.list({ sort: "top", limit: 10 })),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6 lg:grid lg:grid-cols-3 lg:gap-8">
      <aside className="mb-8 lg:mb-0">
        <h2 className="mb-3 font-semibold text-sm uppercase tracking-wider text-muted-foreground">Channels</h2>
        <ul className="space-y-1">
          {channels.map((ch) => (
            <li key={ch.id}>
              <Link href={\`/c/\${ch.slug}\`} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent text-sm">
                <span>{ch.icon}</span>
                <span>{ch.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Top Discussions</h1>
          <Link href="/new" className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">New Post</Link>
        </div>
        <ul className="divide-y rounded-lg border">
          {items.map(({ thread: t, channelSlug, channelName }) => (
            <li key={t.id}>
              <Link href={\`/t/\${t.id}\`} className="block p-4 hover:bg-accent">
                <p className="font-medium">{t.title}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>in {channelName}</span>
                  <span>▲ {t.score}</span>
                  <span>{t.replyCount} replies</span>
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

    files["apps/web/src/app/c/[slug]/page.tsx"] = `
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { ThreadList } from "./_components/thread-list";

interface Props { params: Promise<{ slug: string }> }

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params;
  const caller   = await getServerCaller();
  let ch: Awaited<ReturnType<typeof caller.channels.get>>;
  try {
    ch = await caller.channels.get({ slug });
  } catch {
    notFound();
  }

  const { items } = await caller.threads.list({ channelSlug: slug, sort: "new" });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{ch.icon}</span>
          <h1 className="text-2xl font-bold">{ch.name}</h1>
        </div>
        <Link href={\`/new?channel=\${ch.id}\`} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          New Post
        </Link>
      </div>
      {ch.description && <p className="text-muted-foreground">{ch.description}</p>}
      <ThreadList initialItems={items} channelSlug={slug} />
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/c/[slug]/_components/thread-list.tsx"] = `
"use client";
import Link from "next/link";
import { useState } from "react";
import { orpc } from "@/lib/orpc";

interface Thread { thread: { id: string; title: string; score: number; replyCount: number; isPinned: boolean; createdAt: Date }; channelSlug: string; channelName: string }
interface Props  { initialItems: Thread[]; channelSlug: string }

export function ThreadList({ initialItems, channelSlug }: Props) {
  const [items, setItems]   = useState(initialItems);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const res = await orpc.threads.list({ channelSlug, cursor, sort: "new" });
    setItems((prev) => [...prev, ...res.items]);
    setCursor(res.nextCursor);
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {items.map(({ thread: t }) => (
          <li key={t.id}>
            <Link href={\`/t/\${t.id}\`} className={\`block p-4 hover:bg-accent \${t.isPinned ? "bg-primary/5" : ""}\`}>
              {t.isPinned && <span className="text-xs text-primary font-medium">📌 Pinned</span>}
              <p className="font-medium">{t.title}</p>
              <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                <span>▲ {t.score}</span>
                <span>{t.replyCount} replies</span>
                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {cursor && (
        <button onClick={loadMore} disabled={loading} className="w-full rounded-md border py-2 text-sm">
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/t/[id]/page.tsx"] = `
import { notFound } from "next/navigation";
import { getServerCaller } from "@/lib/server-orpc";
import { VoteButton } from "./_components/vote-button";
import { ReplyForm } from "./_components/reply-form";

interface Props { params: Promise<{ id: string }> }

export default async function ThreadPage({ params }: Props) {
  const { id }  = await params;
  const caller  = await getServerCaller();
  let data: Awaited<ReturnType<typeof caller.threads.get>>;
  try {
    data = await caller.threads.get({ id });
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <article className="space-y-4">
        <h1 className="text-2xl font-bold">{data.title}</h1>
        <div className="flex items-center gap-3">
          <VoteButton targetId={data.id} targetType="thread" score={data.score} />
        </div>
        {data.body && <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: data.body }} />}
      </article>

      {!data.isLocked && <ReplyForm threadId={data.id} />}
      {data.isLocked && <p className="text-sm text-muted-foreground rounded-md border p-3">🔒 This thread is locked.</p>}

      <section className="space-y-4">
        <h2 className="font-semibold">{data.replies.length} Replies</h2>
        <ul className="space-y-3">
          {data.replies.map((r) => (
            <li key={r.id} className={\`rounded-lg border p-4 space-y-2 \${r.parentId ? "ml-8 border-l-4" : ""}\`}>
              <p className="text-sm whitespace-pre-wrap">{r.isDeleted ? <em className="text-muted-foreground">[deleted]</em> : r.body}</p>
              <div className="flex items-center gap-3">
                <VoteButton targetId={r.id} targetType="reply" score={r.score} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/t/[id]/_components/vote-button.tsx"] = `
"use client";
import { useState } from "react";
import { orpc } from "@/lib/orpc";

interface Props { targetId: string; targetType: "thread"|"reply"; score: number }

export function VoteButton({ targetId, targetType, score: initialScore }: Props) {
  const [score, setScore]   = useState(initialScore);
  const [voted, setVoted]   = useState<"up"|"down"|null>(null);
  const [loading, setLoading] = useState(false);

  async function vote(value: "up"|"down") {
    if (loading) return;
    setLoading(true);
    try {
      const res = await orpc.threads.vote({ targetId, targetType, value });
      if ("removed" in res) {
        setScore((s) => s + (voted === "up" ? -1 : 1));
        setVoted(null);
      } else {
        const delta = voted ? (value === "up" ? 2 : -2) : (value === "up" ? 1 : -1);
        setScore((s) => s + delta);
        setVoted(value);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button onClick={() => vote("up")} disabled={loading} className={\`px-1 \${voted === "up" ? "text-primary font-bold" : "text-muted-foreground"}\`}>▲</button>
      <span className="font-medium">{score}</span>
      <button onClick={() => vote("down")} disabled={loading} className={\`px-1 \${voted === "down" ? "text-destructive font-bold" : "text-muted-foreground"}\`}>▼</button>
    </div>
  );
}
`.trimStart();

    files["apps/web/src/app/t/[id]/_components/reply-form.tsx"] = `
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { orpc } from "@/lib/orpc";

interface Props { threadId: string }

export function ReplyForm({ threadId }: Props) {
  const router = useRouter();
  const [body, setBody]     = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      await orpc.threads.reply({ threadId, body });
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={3}
        className="w-full rounded-md border px-3 py-2 text-sm resize-none"
        required
      />
      <button type="submit" disabled={loading || !body.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {loading ? "Posting…" : "Reply"}
      </button>
    </form>
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
