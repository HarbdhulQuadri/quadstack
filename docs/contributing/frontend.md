# Frontend Contribution Guide

This guide covers everything you need to build UI features without prior knowledge of the codebase.

## Where things live

```
apps/web/src/
├── app/                   # Next.js App Router
│   ├── (auth)/            # Auth pages (login, signup, etc.)
│   ├── (protected)/       # Pages that require a logged-in user
│   ├── api/               # Route handlers (don't touch — auto-managed)
│   └── layout.tsx         # Root layout — Providers are set up here
├── components/
│   └── providers.tsx      # QueryClientProvider (add global providers here)
├── features/              # Feature-scoped components + logic
│   └── posts/
│       ├── post-card.tsx
│       └── posts-list.tsx
├── hooks/                 # Custom React hooks
├── lib/
│   ├── auth.ts            # Better Auth client (signIn, signUp, useSession)
│   └── orpc.ts            # ORPC client (typed API calls)
└── middleware.ts           # Route protection (edit PROTECTED_PATHS here)
```

## Provider setup (already done — for reference)

The root layout wraps everything in `<Providers>`, which sets up TanStack Query:

```tsx
// apps/web/src/components/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

If you need to add another global provider (e.g. a toast library), add it inside `providers.tsx`.

## Adding a new page

Create a file inside `apps/web/src/app/`:

```
app/
└── blog/
    └── page.tsx           ← maps to /blog
```

```tsx
// apps/web/src/app/blog/page.tsx
export default function BlogPage() {
  return <div>Blog</div>;
}
```

For protected pages, put them under `(protected)/`:

```
app/
└── (protected)/
    └── dashboard/
        └── page.tsx       ← maps to /dashboard, requires login
```

Then add `/dashboard` to `PROTECTED_PATHS` in `src/middleware.ts`.

## Fetching data from the API

### In a Server Component (preferred for initial data)

Server Components run on the server, so you can call procedures directly without HTTP:

```tsx
// apps/web/src/app/blog/page.tsx
import { headers } from "next/headers";
import { getSession } from "@quadstack/auth";
import { db } from "@quadstack/db/client";
import { post } from "@quadstack/db/schema";

export default async function BlogPage() {
  // Query the database directly in a Server Component
  const posts = await db.select().from(post).orderBy(post.createdAt);
  return <PostsList posts={posts} />;
}
```

For authenticated data:

```tsx
import { headers } from "next/headers";
import { getSession } from "@quadstack/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  // session.user is available here
  return <div>Hello, {session.user.name}</div>;
}
```

### In a Client Component (for interactive / user-triggered calls)

Import `useQuery` from `@tanstack/react-query` and the `orpc` client from `@/lib/orpc`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function PostsList() {
  const { data, isLoading, error } = useQuery(orpc.posts.list.queryOptions());

  if (isLoading) return <div className="animate-pulse h-8 w-full rounded bg-muted" />;
  if (error)     return <p className="text-destructive">Failed to load posts</p>;

  return (
    <ul>
      {data?.map((p) => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
}
```

### Mutations (creating, updating, deleting)

```tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function CreatePostForm() {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    ...orpc.posts.create.mutationOptions(),
    onSuccess: () => {
      // Invalidate the list so it refetches
      void queryClient.invalidateQueries(orpc.posts.list.queryOptions());
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        mutate({ title: data.get("title") as string });
      }}
    >
      <input name="title" className="border px-2 py-1 rounded" />
      <button type="submit" disabled={isPending} className="ml-2 px-4 py-1 bg-primary text-primary-foreground rounded">
        {isPending ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

## Using auth in the frontend

### Check if user is logged in (client component)

```tsx
"use client";

import { useSession } from "@/lib/auth";

export function UserBadge() {
  const { data: session } = useSession();

  if (!session) return <a href="/login">Sign in</a>;
  return <span>{session.user.name}</span>;
}
```

### Get current user in a Server Component

```tsx
import { getSession } from "@quadstack/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getSession(await headers());
  if (!session) redirect("/login");

  return <div>Hello, {session.user.name}</div>;
}
```

### Sign in / sign up

```tsx
"use client";

import { signIn, signUp, signOut } from "@/lib/auth";

// Email + password sign in
await signIn.email({ email, password, callbackURL: "/dashboard" });

// Email + password sign up
await signUp.email({ name, email, password, callbackURL: "/dashboard" });

// Google OAuth
await signIn.social({ provider: "google", callbackURL: "/dashboard" });

// Sign out
await signOut({ fetchOptions: { onSuccess: () => router.push("/") } });
```

## Using UI components

Components live in `packages/ui/src/components/`. Add new ones via:

```bash
# Run from the monorepo root
pnpm ui-add
# Then select e.g. "button", "dialog", "card"
```

After adding, re-export from `packages/ui/src/index.ts`:

```ts
export * from "./components/button";
```

Import in your app:

```tsx
import { Button } from "@quadstack/ui/components/button";
import { cn } from "@quadstack/ui";

<Button variant="outline" className={cn("mt-4", isActive && "bg-primary")}>
  Click me
</Button>
```

## Styling

Tailwind CSS v4. Design tokens (colors, radius, etc.) are CSS variables defined in `packages/ui/src/globals.css`. Override them in your app's `globals.css` if needed.

```tsx
// Good — Tailwind classes
<div className="flex items-center gap-4 rounded-lg bg-card p-4 text-card-foreground" />

// cn() merges and deduplicates classes safely
<div className={cn("p-4", isError && "border-destructive")} />
```

## Forms and validation

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUpSchema } from "@quadstack/validators";
import type { z } from "zod";

type FormData = z.infer<typeof signUpSchema>;

export function SignUpForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (data: FormData) => {
    await signUp.email({ ...data, callbackURL: "/dashboard" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <input {...register("email")} placeholder="Email" className="border px-2 py-1 rounded w-full" />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
```

## Common patterns

### Loading skeleton

```tsx
if (isLoading) return <div className="h-8 w-48 animate-pulse rounded bg-muted" />;
```

### Error boundary

```tsx
// app/blog/error.tsx — Next.js catches errors per-segment
"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-4 text-center">
      <p className="text-destructive">{error.message}</p>
      <button onClick={reset} className="mt-2 underline">Try again</button>
    </div>
  );
}
```

### Redirects

```tsx
// Server Component
import { redirect } from "next/navigation";
if (!session) redirect("/login");

// Client Component
import { useRouter } from "next/navigation";
const router = useRouter();
router.push("/dashboard");
```
