import type { AppTemplate } from "./types";

export const blog: AppTemplate = {
  id:                   "blog",
  name:                 "Blog / CMS",
  description:          "Posts, categories, tags, and author management",
  hint:                 "Content site, editorial workflow",
  defaultPayments:      [],
  defaultAuthProviders: ["email"],

  generate: (scope) => ({
    "packages/db/src/schema.ts": `
export * from "./auth-schema";

import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// ─── Enums ───────────────────────────────────────────────────────────────────
export const postStatus = pgEnum("post_status", ["draft", "published", "archived"]);

// ─── Tables ──────────────────────────────────────────────────────────────────
export const post = pgTable("post", {
  id:          uuid("id").primaryKey().defaultRandom(),
  title:       text("title").notNull(),
  slug:        text("slug").notNull().unique(),
  excerpt:     text("excerpt"),
  content:     text("content"),
  coverImage:  text("cover_image"),
  status:      postStatus("status").notNull().default("draft"),
  authorId:    text("author_id").notNull().references(() => user.id),
  publishedAt: timestamp("published_at"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const category = pgTable("category", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  slug:      text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
`.trimStart(),

    "packages/validators/src/index.ts": `
import { z } from "zod";

export const signInSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const signUpSchema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) });

export const createPostSchema = z.object({
  title:       z.string().min(1).max(200),
  slug:        z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  excerpt:     z.string().max(500).optional(),
  content:     z.string().optional(),
  coverImage:  z.string().url().optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
  tagIds:      z.array(z.string().uuid()).default([]),
});

export const updatePostSchema = createPostSchema.partial().extend({
  id:     z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
});
`.trimStart(),

    "packages/api/src/orpc-routers/posts.ts": `
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { category, post, postCategory, postTag, tag } from "@${scope}/db/schema";
import {
  createCategorySchema,
  createPostSchema,
  createTagSchema,
  updatePostSchema,
} from "@${scope}/validators";

import { priv, pub } from "../procedures";

export const postsRouter = {
  list: pub
    .input(z.object({ status: z.enum(["draft", "published", "archived"]).optional() }).optional())
    .route({ method: "GET", path: "/posts/list" })
    .handler(({ context, input }) => {
      const where = input?.status ? eq(post.status, input.status) : eq(post.status, "published");
      return context.db.select().from(post).where(where).orderBy(post.publishedAt);
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
        await context.db.insert(postCategory).values(
          categoryIds.map((categoryId) => ({ postId: created!.id, categoryId })),
        );
      }
      if (tagIds.length) {
        await context.db.insert(postTag).values(
          tagIds.map((tagId) => ({ postId: created!.id, tagId })),
        );
      }
      return created;
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
        .where(eq(post.id, id))
        .returning();
      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/posts/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),

  createCategory: priv
    .input(createCategorySchema)
    .route({ method: "POST", path: "/posts/categories/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(category).values(input).returning();
      return created;
    }),

  listCategories: pub
    .route({ method: "GET", path: "/posts/categories/list" })
    .handler(({ context }) => context.db.select().from(category)),

  createTag: priv
    .input(createTagSchema)
    .route({ method: "POST", path: "/posts/tags/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db.insert(tag).values(input).returning();
      return created;
    }),

  listTags: pub
    .route({ method: "GET", path: "/posts/tags/list" })
    .handler(({ context }) => context.db.select().from(tag)),
};
`.trimStart(),

    "packages/api/src/orpc-routers/index.ts": `
import { authRouter } from "./auth";
import { postsRouter } from "./posts";

export const appRouter = {
  auth:  authRouter,
  posts: postsRouter,
};

export type AppRouter = typeof appRouter;
`.trimStart(),
  }),
};
