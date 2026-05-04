# Backend Contribution Guide

The backend has no separate server. It runs as **Next.js Route Handlers** using ORPC. Everything lives in `packages/api/` and `packages/db/`.

## Where things live

```
packages/
├── api/src/
│   ├── procedures.ts      # pub + priv builders — the only file that wires middleware
│   ├── orpc-routers/
│   │   ├── index.ts       # Root router — register new routers here
│   │   ├── auth.ts        # Auth-related procedures
│   │   └── posts.ts       # Example feature router (add yours here)
│   └── lib/
│       └── context.ts     # TypeScript types for the context object
└── db/src/
    ├── schema.ts           # Your app tables (edit this)
    ├── auth-schema.ts      # Auto-generated auth tables (don't edit)
    └── client.ts           # Drizzle db client
```

## The two procedure builders

These are defined in `packages/api/src/procedures.ts` and imported in every router:

```ts
import { pub, priv } from "../procedures";
```

| Builder | Context available | Use for |
|---|---|---|
| `pub` | `db`, `headers` | Public endpoints anyone can call |
| `priv` | `db`, `headers`, `user`, `session` | Endpoints that require login |

## The full workflow: adding a new feature

### Step 1 — Define the database table

Edit `packages/db/src/schema.ts`:

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const post = pgTable("post", {
  id:        uuid("id").primaryKey().defaultRandom(),
  title:     text("title").notNull(),
  content:   text("content"),
  authorId:  text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
```

Sync to the database:

```bash
pnpm db:push
```

### Step 2 — Define validators

Add Zod schemas to `packages/validators/src/index.ts`:

```ts
import { z } from "zod";

export const createPostSchema = z.object({
  title:   z.string().min(1).max(200),
  content: z.string().optional(),
});

export const updatePostSchema = createPostSchema.partial().extend({
  id: z.string().uuid(),
});
```

### Step 3 — Write the router

Create `packages/api/src/orpc-routers/posts.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { post } from "@quadstack/db/schema";
import { createPostSchema, updatePostSchema } from "@quadstack/validators";

import { priv, pub } from "../procedures";

export const postsRouter = {
  // GET /api/rpc/posts/list — no login required
  list: pub
    .route({ method: "GET", path: "/posts/list" })
    .handler(async ({ context }) => {
      return context.db.select().from(post).orderBy(post.createdAt);
    }),

  // GET /api/rpc/posts/get?input={"id":"..."} — no login required
  get: pub
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "GET", path: "/posts/get" })
    .handler(async ({ context, input }) => {
      const [found] = await context.db
        .select()
        .from(post)
        .where(eq(post.id, input.id))
        .limit(1);

      if (!found) throw new ORPCError("NOT_FOUND", { message: "Post not found" });
      return found;
    }),

  // POST /api/rpc/posts/create — login required
  create: priv
    .input(createPostSchema)
    .route({ method: "POST", path: "/posts/create" })
    .handler(async ({ context, input }) => {
      const [created] = await context.db
        .insert(post)
        .values({ ...input, authorId: context.user.id })
        .returning();
      return created;
    }),

  // PATCH /api/rpc/posts/update — login required
  update: priv
    .input(updatePostSchema)
    .route({ method: "PATCH", path: "/posts/update" })
    .handler(async ({ context, input }) => {
      const [updated] = await context.db
        .update(post)
        .set({ title: input.title, content: input.content, updatedAt: new Date() })
        .where(eq(post.id, input.id))
        .returning();

      if (!updated) throw new ORPCError("NOT_FOUND");
      return updated;
    }),

  // DELETE /api/rpc/posts/delete — login required
  delete: priv
    .input(z.object({ id: z.string().uuid() }))
    .route({ method: "DELETE", path: "/posts/delete" })
    .handler(async ({ context, input }) => {
      await context.db.delete(post).where(eq(post.id, input.id));
      return { success: true };
    }),
};
```

### Step 4 — Register the router

Add it to `packages/api/src/orpc-routers/index.ts`:

```ts
import { postsRouter } from "./posts";

export const appRouter = {
  auth:  authRouter,
  posts: postsRouter,   // ← add here
};
```

That's it. The procedures are now callable from any app.

## Context reference

```ts
// What's available in pub procedures
context.db       // Drizzle client — fully typed against your schema
context.headers  // Raw request headers

// Additionally available in priv procedures
context.user     // { id, name, email, image, createdAt, updatedAt }
context.session  // { id, expiresAt, token, userId, ... }
```

## Writing a custom middleware

If you need a third access level (e.g. admin-only):

```ts
// packages/api/src/procedures.ts — add below the existing exports
import { eq } from "drizzle-orm";
import { user } from "@quadstack/db/schema";

export const adminOnly = priv.use(
  priv.middleware ? /* fallback */ os.$context<typeof priv extends ... >().middleware(
    async ({ context, next }) => {
      // Example: check a `role` column on your user table
      const [dbUser] = await context.db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, context.user.id))
        .limit(1);

      if (dbUser?.role !== "admin") {
        throw new ORPCError("FORBIDDEN", { message: "Admins only" });
      }

      return next({ context });
    }
  ) : (() => { throw new Error("unreachable"); })(),
);
```

A simpler pattern — inline guard at the top of a handler:

```ts
create: priv.handler(async ({ context }) => {
  if (context.user.role !== "admin") throw new ORPCError("FORBIDDEN");
  // ...
}),
```

## Drizzle ORM quick reference

```ts
import { db } from "@quadstack/db/client";
import { post } from "@quadstack/db/schema";
import { eq, and, desc, ilike } from "drizzle-orm";

// Select all
await db.select().from(post);

// Filter
await db.select().from(post).where(eq(post.authorId, userId));

// Multiple conditions
await db.select().from(post).where(and(
  eq(post.authorId, userId),
  ilike(post.title, "%search%"),
));

// Order + limit + offset (pagination)
await db.select().from(post)
  .orderBy(desc(post.createdAt))
  .limit(20)
  .offset(page * 20);

// Insert and return the created row
const [created] = await db.insert(post).values({ title: "Hello" }).returning();

// Update
await db.update(post).set({ title: "New title" }).where(eq(post.id, id));

// Delete
await db.delete(post).where(eq(post.id, id));

// Join
await db
  .select({ post: post, author: user })
  .from(post)
  .innerJoin(user, eq(post.authorId, user.id));
```

## Sending email

```ts
import { resend } from "@quadstack/auth/resend";
import { authEnv } from "@quadstack/auth/env";

const env = authEnv();

await resend.emails.send({
  from:    env.EMAIL_FROM,
  to:      "user@example.com",
  subject: "Welcome",
  html:    "<p>Hello!</p>",
});
```

## Error handling

Throw `ORPCError` for expected errors — ORPC serialises these to the client with the correct HTTP status:

```ts
import { ORPCError } from "@orpc/server";

throw new ORPCError("NOT_FOUND",           { message: "Post not found" });   // 404
throw new ORPCError("UNAUTHORIZED",        { message: "Not logged in" });    // 401
throw new ORPCError("FORBIDDEN",           { message: "No permission" });    // 403
throw new ORPCError("BAD_REQUEST",         { message: "Invalid input" });    // 400
throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Oops" });          // 500
```

Unhandled exceptions become 500s automatically.

## Testing a procedure with curl

Since procedures are real HTTP routes, you can test them without a browser:

```bash
# Public GET
curl "http://localhost:3000/api/rpc/posts/list"

# Authenticated POST (grab session cookie from browser DevTools → Application → Cookies)
curl -X POST "http://localhost:3000/api/rpc/posts/create" \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=<token>" \
  -d '{"title": "Hello World"}'
```
