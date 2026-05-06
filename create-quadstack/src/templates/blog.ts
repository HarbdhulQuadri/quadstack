import type { AppTemplate } from "./types";

export const blog: AppTemplate = {
  id:                   "blog",
  name:                 "Blog / CMS",
  description:          "Posts, categories, tags, comments, and editorial workflow",
  hint:                 "Content site, editorial workflow",
  defaultPayments:      [],
  defaultAuthProviders: ["email"],

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
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const postStatus = pgEnum("post_status", ["draft", "published", "archived"]);

// ─── Staff / Admin ────────────────────────────────────────────────────────────
export const staffRole = pgTable("staff_role", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("editor"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const post = pgTable("post", {
  id:          uuid("id").primaryKey().defaultRandom(),
  title:       text("title").notNull(),
  slug:        text("slug").notNull().unique(),
  excerpt:     text("excerpt"),
  content:     text("content"),
  coverImage:  text("cover_image"),
  metaTitle:   text("meta_title"),
  metaDesc:    text("meta_desc"),
  status:      postStatus("status").notNull().default("draft"),
  authorId:    text("author_id").notNull().references(() => user.id),
  publishedAt: timestamp("published_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const category = pgTable("category", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  slug:        text("slug").notNull().unique(),
  description: text("description"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export const postCategory = pgTable("post_category", {
  postId:     uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => category.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.postId, t.categoryId] })]);

export const tag = pgTable("tag", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  slug:      text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const postTag = pgTable("post_tag", {
  postId: uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
  tagId:  uuid("tag_id").notNull().references(() => tag.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.postId, t.tagId] })]);

export const comment = pgTable("comment", {
  id:        uuid("id").primaryKey().defaultRandom(),
  postId:    uuid("post_id").notNull().references(() => post.id, { onDelete: "cascade" }),
  authorId:  text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  body:      text("body").notNull(),
  approved:  boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
`.trimStart();

    // ─── Validators ────────────────────────────────────────────────────────────
    files["packages/validators/src/index.ts"] = `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createPostSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  excerpt:     z.string().max(500).optional(),
  content:     z.string().optional(),
  coverImage:  z.string().url().optional(),
  metaTitle:   z.string().max(200).optional(),
  metaDesc:    z.string().max(300).optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
  tagIds:      z.array(z.string().uuid()).default([]),
});
export const updatePostSchema = createPostSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const createCategorySchema = z.object({
  name:        z.string().min(1).max(100),
  slug:        z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});
export const createTagSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
});
export const createCommentSchema = z.object({
  postId: z.string().uuid(),
  body:   z.string().min(1).max(2000),
});

export const postFiltersSchema = z.object({
  categorySlug: z.string().optional(),
  tagSlug:      z.string().optional(),
  search:       z.string().optional(),
  limit:        z.number().int().min(1).max(50).default(12),
  cursor:       z.string().optional(),
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

// Platform admin — grants access to category/tag management and comment moderation.
// Grant: INSERT INTO staff_role (user_id) VALUES ('<user-id>');
export const adminPriv = priv.use(
  o.middleware(async ({ context, next }) => {
    const [staff] = await context.db
      .select().from(staffRole).where(eq(staffRole.userId, context.user.id)).limit(1);
    if (!staff) throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
    return next({ context: { ...context, staffRole: staff.role } });
  }),
);
`.trimStart();

    // ─── Posts Router ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/posts.ts"] = `
import { ORPCError } from "@orpc/server";
import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { category, comment, post, postCategory, postTag, tag } from "@${scope}/db/schema";
import {
  createCategorySchema,
  createCommentSchema,
  createPostSchema,
  createTagSchema,
  postFiltersSchema,
  updatePostSchema,
} from "@${scope}/validators";
import { adminPriv, priv, pub } from "../procedures";

export const postsRouter = {
  list: pub
    .input(postFiltersSchema)
    .route({ method: "GET", path: "/posts/list" })
    .handler(async ({ context, input }) => {
      const offset = input.cursor ? parseInt(Buffer.from(input.cursor, "base64").toString()) : 0;
      const conditions = [eq(post.status, "published")];
      if (input.search) conditions.push(ilike(post.title, \`%\${input.search}%\`));

      const rows = await context.db
        .select()
        .from(post)
        .where(and(...conditions))
        .orderBy(desc(post.publishedAt))
        .limit(input.limit + 1)
        .offset(offset);

      const hasMore   = rows.length > input.limit;
      const items     = hasMore ? rows.slice(0, input.limit) : rows;
      const nextOffset = offset + items.length;
      return { items, hasMore, nextCursor: hasMore ? Buffer.from(String(nextOffset)).toString("base64") : null };
    }),

  get: pub
    .input(z.object({ slug: z.string() }))
    .route({ method: "GET", path: "/posts/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(post)
        .where(and(eq(post.slug, input.slug), eq(post.status, "published")))
        .limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      return found;
    }),

  create: priv
    .input(createPostSchema)
    .route({ method: "POST", path: "/posts/create" })
    .handler(async ({ context, input }) => {
      const { categoryIds, tagIds, ...data } = input;
      const [created] = await context.db
        .insert(post)
        .values({ ...data, authorId: context.user.id })
        .returning();
      if (categoryIds.length) {
        await context.db.insert(postCategory).values(categoryIds.map((categoryId) => ({ postId: created!.id, categoryId })));
      }
      if (tagIds.length) {
        await context.db.insert(postTag).values(tagIds.map((tagId) => ({ postId: created!.id, tagId })));
      }
      return created!;
    }),

  update: priv
    .input(updatePostSchema)
    .route({ method: "PATCH", path: "/posts/update" })
    .handler(async ({ context, input }) => {
      const { id, categoryIds, tagIds, ...data } = input;
      const publishedAt = data.status === "published" ? new Date() : undefined;

      const [updated] = await context.db
        .update(post)
        .set({ ...data, ...(publishedAt ? { publishedAt } : {}), updatedAt: new Date() })
        .where(and(eq(post.id, id), eq(post.authorId, context.user.id)))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");

      if (categoryIds !== undefined) {
        await context.db.delete(postCategory).where(eq(postCategory.postId, id));
        if (categoryIds.length) await context.db.insert(postCategory).values(categoryIds.map((categoryId) => ({ postId: id, categoryId })));
      }
      if (tagIds !== undefined) {
        await context.db.delete(postTag).where(eq(postTag.postId, id));
        if (tagIds.length) await context.db.insert(postTag).values(tagIds.map((tagId) => ({ postId: id, tagId })));
      }
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/posts/delete" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db.select().from(post).where(eq(post.id, input.id)).limit(1);
      if (!found) throw new ORPCError("NOT_FOUND");
      if (found.authorId !== context.user.id) throw new ORPCError("FORBIDDEN");
      await context.db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),

  myPosts: priv
    .route({ method: "GET", path: "/posts/mine" })
    .handler(({ context }) =>
      context.db.select().from(post).where(eq(post.authorId, context.user.id)).orderBy(desc(post.createdAt)),
    ),

  // ── Comments ──────────────────────────────────────────────────────────────
  listComments: pub
    .input(z.object({ postId: z.string().uuid() }))
    .route({ method: "GET", path: "/posts/comments" })
    .handler(({ context, input }) =>
      context.db.select().from(comment)
        .where(and(eq(comment.postId, input.postId), eq(comment.approved, true)))
        .orderBy(desc(comment.createdAt)),
    ),

  addComment: priv
    .input(createCommentSchema)
    .route({ method: "POST", path: "/posts/comments/add" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(comment)
        .values({ ...input, authorId: context.user.id })
        .returning();
      return created!;
    }),

  // ── Admin ─────────────────────────────────────────────────────────────────
  adminListAll: adminPriv
    .route({ method: "GET", path: "/admin/posts/list" })
    .handler(({ context }) =>
      context.db.select().from(post).orderBy(desc(post.createdAt)),
    ),

  approveComment: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "PATCH", path: "/admin/comments/approve" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(comment).set({ approved: true }).where(eq(comment.id, input.id)).returning();
      return updated!;
    }),

  deleteComment: adminPriv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/admin/comments/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(comment).where(eq(comment.id, input.id));
      return { success: true };
    }),

  listCategories: pub
    .route({ method: "GET", path: "/posts/categories/list" })
    .handler(({ context }) => context.db.select().from(category).orderBy(category.name)),

  createCategory: adminPriv
    .input(createCategorySchema)
    .route({ method: "POST", path: "/admin/categories/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(category).values(input).returning();
      return created!;
    }),

  listTags: pub
    .route({ method: "GET", path: "/posts/tags/list" })
    .handler(({ context }) => context.db.select().from(tag).orderBy(tag.name)),

  createTag: adminPriv
    .input(createTagSchema)
    .route({ method: "POST", path: "/admin/tags/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(tag).values(input).returning();
      return created!;
    }),
};
`.trimStart();

    // ─── Router index ──────────────────────────────────────────────────────────
    files["packages/api/src/orpc-routers/index.ts"] = `
import { authRouter }  from "./auth";
import { postsRouter } from "./posts";

export const appRouter = {
  auth:  authRouter,
  posts: postsRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart();

    // ─── server-orpc.ts ────────────────────────────────────────────────────────
    files["apps/web/src/lib/server-orpc.ts"] = `
import "server-only";
import { createRouterClient } from "@orpc/server";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { appRouter } from "@${scope}/api";

export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, { context: { headers: h as unknown as Headers } });
}

const publicCaller = createRouterClient(appRouter, { context: { headers: new Headers() } });
export { publicCaller };

export const getCachedCategories = unstable_cache(
  () => publicCaller.posts.listCategories(),
  ["categories"], { revalidate: 600, tags: ["categories"] },
);

export const getCachedTags = unstable_cache(
  () => publicCaller.posts.listTags(),
  ["tags"], { revalidate: 600, tags: ["tags"] },
);

export const getCachedRecentPosts = unstable_cache(
  () => publicCaller.posts.list({ limit: 6 }),
  ["posts-recent"], { revalidate: 300, tags: ["posts"] },
);
`.trimStart();

    // ─── Web UI: Homepage ──────────────────────────────────────────────────────
    files["apps/web/src/app/page.tsx"] = `
import Link from "next/link";
import { getCachedRecentPosts, getCachedCategories } from "@/lib/server-orpc";

export default async function HomePage() {
  const [{ items: posts }, categories] = await Promise.all([
    getCachedRecentPosts(),
    getCachedCategories(),
  ]);

  return (
    <main className="min-h-screen">
      <section className="bg-slate-900 text-white text-center py-24 px-4">
        <h1 className="text-5xl font-bold mb-4">Our Blog</h1>
        <p className="text-slate-300 text-lg max-w-xl mx-auto">Insights, tutorials, and stories from our team.</p>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-6">Latest Posts</h2>
            <div className="space-y-6">
              {posts.map((p) => (
                <article key={p.id} className="flex gap-4 border-b border-slate-100 pb-6">
                  {p.coverImage && (
                    <img src={p.coverImage} alt={p.title} className="w-32 h-24 object-cover rounded-xl shrink-0" />
                  )}
                  <div>
                    <Link href={\`/blog/\${p.slug}\`} className="text-lg font-semibold hover:text-slate-600 line-clamp-2">{p.title}</Link>
                    {p.excerpt && <p className="text-slate-500 text-sm mt-1 line-clamp-2">{p.excerpt}</p>}
                    <p className="text-xs text-slate-400 mt-2">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-8">
              <Link href="/blog" className="border border-slate-300 px-5 py-2 rounded-full text-sm hover:bg-slate-50">
                All posts →
              </Link>
            </div>
          </div>

          <aside className="w-full lg:w-56 shrink-0">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Categories</h2>
            <div className="space-y-1">
              {categories.map((c) => (
                <Link key={c.id} href={\`/blog?category=\${c.slug}\`}
                  className="block text-sm text-slate-600 hover:text-slate-900 py-1">{c.name}</Link>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
`.trimStart();

    // ─── Web UI: Blog listing ──────────────────────────────────────────────────
    files["apps/web/src/app/blog/page.tsx"] = `
import Link from "next/link";
import { publicCaller, getCachedCategories } from "@/lib/server-orpc";

interface Props { searchParams: Promise<{ category?: string; search?: string; cursor?: string }> }

export default async function BlogPage({ searchParams }: Props) {
  const params     = await searchParams;
  const categories = await getCachedCategories();
  const { items: posts, hasMore, nextCursor } = await publicCaller.posts.list({
    search: params.search,
    cursor: params.cursor,
    limit: 12,
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">All Posts</h1>
      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1">
          <div className="grid md:grid-cols-2 gap-6">
            {posts.map((p) => (
              <article key={p.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                {p.coverImage && <img src={p.coverImage} alt={p.title} className="w-full h-40 object-cover" />}
                <div className="p-4">
                  <Link href={\`/blog/\${p.slug}\`} className="font-semibold hover:text-slate-600 line-clamp-2">{p.title}</Link>
                  {p.excerpt && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.excerpt}</p>}
                  <p className="text-xs text-slate-400 mt-2">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""}</p>
                </div>
              </article>
            ))}
          </div>
          {posts.length === 0 && <p className="text-slate-400 text-center py-12">No posts yet.</p>}
          {hasMore && nextCursor && (
            <div className="mt-8 text-center">
              <a href={\`?cursor=\${nextCursor}\`} className="border border-slate-300 px-6 py-2 rounded-full text-sm hover:bg-slate-50">
                Load more
              </a>
            </div>
          )}
        </div>
        <aside className="w-full lg:w-48 shrink-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Categories</p>
          <Link href="/blog" className={\`block text-sm py-1 \${!params.category ? "font-semibold" : "text-slate-600 hover:text-slate-900"}\`}>All</Link>
          {categories.map((c) => (
            <Link key={c.id} href={\`/blog?category=\${c.slug}\`}
              className={\`block text-sm py-1 \${params.category === c.slug ? "font-semibold" : "text-slate-600 hover:text-slate-900"}\`}>
              {c.name}
            </Link>
          ))}
        </aside>
      </div>
    </main>
  );
}
`.trimStart();

    // ─── Web UI: Post detail ───────────────────────────────────────────────────
    files["apps/web/src/app/blog/[slug]/page.tsx"] = `
import { notFound } from "next/navigation";
import Link from "next/link";
import { publicCaller } from "@/lib/server-orpc";

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const p = await publicCaller.posts.get({ slug });
    return { title: p.metaTitle ?? p.title, description: p.metaDesc ?? p.excerpt ?? undefined };
  } catch { return { title: "Post not found" }; }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  let post: Awaited<ReturnType<typeof publicCaller.posts.get>>;
  try { post = await publicCaller.posts.get({ slug }); } catch { notFound(); }

  const [comments] = await Promise.allSettled([
    publicCaller.posts.listComments({ postId: post.id }),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/blog" className="text-sm text-slate-400 hover:text-slate-700 mb-6 inline-block">← All posts</Link>
      {post.coverImage && <img src={post.coverImage} alt={post.title} className="w-full h-64 object-cover rounded-2xl mb-6" />}
      <h1 className="text-4xl font-bold mb-2">{post.title}</h1>
      {post.publishedAt && <p className="text-sm text-slate-400 mb-8">{new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>}
      {post.content && (
        <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: post.content }} />
      )}

      {comments.status === "fulfilled" && comments.value.length > 0 && (
        <div className="mt-12 border-t border-slate-100 pt-8">
          <h2 className="font-semibold mb-4">{comments.value.length} Comment{comments.value.length !== 1 ? "s" : ""}</h2>
          <div className="space-y-4">
            {comments.value.map((c) => (
              <div key={c.id} className="bg-slate-50 rounded-xl p-4">
                <p className="text-sm">{c.body}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(c.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
`.trimStart();

    // ─── Admin: Posts page ─────────────────────────────────────────────────────
    files["apps/admin/src/app/(protected)/posts/page.tsx"] = `
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@${scope}/auth";
import { db } from "@${scope}/db/client";
import { post, staffRole } from "@${scope}/db/schema";
import { desc, eq } from "drizzle-orm";

export default async function AdminPostsPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");
  const [staff] = await db.select().from(staffRole).where(eq(staffRole.userId, session.user.id)).limit(1);
  if (!staff) redirect("/dashboard");

  const posts = await db.select().from(post).orderBy(desc(post.createdAt));

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Posts ({posts.length})</h1>
        <Link href="/posts/new" className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700">
          + New Post
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Published</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {posts.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{p.title}</td>
                <td className="px-4 py-3">
                  <span className={\`text-xs px-2 py-0.5 rounded-full font-medium \${
                    p.status === "published" ? "bg-green-100 text-green-700" :
                    p.status === "archived"  ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"
                  }\`}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {posts.length === 0 && <p className="text-center text-slate-400 py-12">No posts yet.</p>}
      </div>
    </main>
  );
}
`.trimStart();

    return files;
  },
};
