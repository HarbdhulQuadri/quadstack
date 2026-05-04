# ADR 003 — Switching Auth Providers

QuadStack ships with **Better Auth** by default. The auth contract is isolated to a single file:

```
packages/auth/src/index.ts
```

That file exports exactly four things used by the rest of the system:

| Export | Type | Used by |
|---|---|---|
| `auth` | Better Auth instance | `apps/*/api/auth/[...all]/route.ts` |
| `getSession` | `(headers: Headers) => Promise<{ user, session } \| null>` | `packages/api/src/middlewares/auth.ts` |
| `Session` | Type | Context types |
| `User` | Type | Context types |

To swap providers, replace those four exports in `packages/auth/src/index.ts`. Nothing else needs to change.

---

## Switching to Clerk

### 1. Install

```bash
pnpm add @clerk/nextjs --filter=@quadstack/web --filter=@quadstack/admin
```

### 2. Replace `packages/auth/src/index.ts`

```ts
import { clerkClient, currentUser } from "@clerk/nextjs/server";

// Clerk doesn't have a single auth object — this is a no-op placeholder.
export const auth = null;

export type User = Awaited<ReturnType<typeof currentUser>>;
export type Session = { userId: string };

export async function getSession(headers: Headers) {
  // Extract clerk session from the cookie Clerk sets automatically.
  // In Route Handlers / middleware Clerk provides currentUser() directly.
  // This helper is called from within the ORPC middleware which receives headers.
  const { sessionId, userId } = await clerkClient.authenticateRequest({ headers });
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  return { user: user as unknown as User, session: { userId } };
}
```

### 3. Mount Clerk in each app layout

```tsx
// apps/web/src/app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html><body>{children}</body></html>
    </ClerkProvider>
  );
}
```

### 4. Remove the auth route handler

Clerk uses its own middleware — delete `apps/*/src/app/api/auth/[...all]/route.ts` and follow Clerk's Next.js middleware setup.

### 5. Update env vars

Remove `BETTER_AUTH_*` from `.env`. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

---

## Switching to NextAuth / Auth.js v5

### 1. Install

```bash
pnpm add next-auth@beta --filter=@quadstack/web --filter=@quadstack/admin
```

### 2. Create `packages/auth/src/next-auth-config.ts`

```ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { auth: nextAuthInstance, handlers, signIn, signOut } = NextAuth({
  providers: [GitHub],
});
```

### 3. Replace `packages/auth/src/index.ts`

```ts
export { nextAuthInstance as auth } from "./next-auth-config";

export type Session = { expires: string; user: { id: string; name: string; email: string } };
export type User = Session["user"];

export async function getSession(headers: Headers) {
  // Auth.js v5 provides auth() which reads from the request automatically.
  const session = await nextAuthInstance();
  if (!session?.user) return null;
  return { user: session.user as User, session: session as Session };
}
```

### 4. Mount the route handler

```ts
// apps/web/src/app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@quadstack/auth";
```

---

## Switching to Supabase Auth

### 1. Install

```bash
pnpm add @supabase/supabase-js @supabase/ssr --filter=@quadstack/web
```

### 2. Replace `packages/auth/src/index.ts`

```ts
import { createServerClient } from "@supabase/ssr";

export const auth = null; // Supabase doesn't expose a single auth object

export type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
export type User = NonNullable<Session>["user"];

export async function getSession(headers: Headers) {
  const cookieHeader = headers.get("cookie") ?? "";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieHeader.split(";").map((c) => {
            const [name, ...rest] = c.trim().split("=");
            return { name: name!, value: rest.join("=") };
          });
        },
        setAll() {},
      },
    },
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return { session, user: session.user as User };
}
```

### 3. Remove Better Auth artifacts

- Delete `packages/auth/src/index.ts` Better Auth config
- Remove `BETTER_AUTH_*` env vars
- The auth DB tables (`user`, `session`, etc.) become Supabase-managed — run the Supabase auth migration instead

---

## Switching to Lucia Auth

### 1. Install

```bash
pnpm add lucia @lucia-auth/adapter-drizzle --filter=@quadstack/auth
```

### 2. Replace `packages/auth/src/index.ts`

```ts
import { Lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { db } from "@quadstack/db/client";
import { session, user } from "@quadstack/db/schema";

const adapter = new DrizzlePostgreSQLAdapter(db, session, user);

export const auth = new Lucia(adapter, {
  sessionCookie: { attributes: { secure: process.env.NODE_ENV === "production" } },
  getUserAttributes: (attrs) => ({ email: attrs.email, name: attrs.name }),
});

export type Session = Awaited<ReturnType<typeof auth.validateSession>>["session"];
export type User = Awaited<ReturnType<typeof auth.validateSession>>["user"];

export async function getSession(headers: Headers) {
  const cookieHeader = headers.get("cookie") ?? "";
  const sessionId = auth.readSessionCookie(cookieHeader);
  if (!sessionId) return null;
  const result = await auth.validateSession(sessionId);
  if (!result.session) return null;
  return { session: result.session, user: result.user };
}
```

---

## Summary

| Provider | Route handler | Middleware | DB tables |
|---|---|---|---|
| Better Auth (default) | `toNextJsHandler(auth)` | Cookie check | Auto-generated via `pnpm auth:generate` |
| Clerk | None (Clerk middleware) | `clerkMiddleware()` | Clerk-managed |
| NextAuth v5 | `{ GET, POST } from next-auth` | `auth()` wrapper | Auth.js adapter |
| Supabase Auth | None (Supabase client) | `createServerClient` | Supabase-managed |
| Lucia | Custom route handler | Cookie check | Drizzle adapter, manual migration |
