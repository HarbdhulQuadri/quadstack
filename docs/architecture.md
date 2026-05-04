# Architecture

## Directory Map

```
quadstack/
├── apps/
│   ├── web/          # Public-facing Next.js app (port 3000)
│   └── admin/        # Internal admin Next.js app (port 3001)
├── packages/
│   ├── api/          # ORPC routers + middlewares (the backend)
│   ├── auth/         # Better Auth instance + email client
│   ├── db/           # Drizzle ORM schema + DB client
│   ├── ui/           # shadcn/ui component library
│   └── validators/   # Zod schemas shared across apps and API
├── tooling/
│   ├── eslint/       # Shared ESLint flat config
│   ├── prettier/     # Shared Prettier config
│   ├── tailwind/     # Shared Tailwind preset
│   └── typescript/   # Shared tsconfig bases
└── create-quadstack/ # CLI (published to npm separately)
```

## How a Request Flows

```
Browser
  │
  │  HTTP request
  ▼
Next.js Route Handler  (apps/web/src/app/api/rpc/[...rest]/route.ts)
  │
  │  ORPC RPCHandler
  ▼
appRouter              (packages/api/src/orpc-routers/index.ts)
  │
  │  middleware chain runs in order:
  │    1. base     → injects `db` into context
  │    2. authed   → reads session from Better Auth, injects `user` + `session`
  ▼
procedure handler      (packages/api/src/orpc-routers/*.ts)
  │
  │  Drizzle ORM query
  ▼
PostgreSQL             (Supabase or any Postgres host)
```

## Package Dependency Graph

```
apps/web ──────────────────────────────────► @quadstack/api
apps/admin ─────────────────────────────────► @quadstack/api
                                                    │
                                          ┌─────────┴──────────┐
                                          ▼                     ▼
                                   @quadstack/auth        @quadstack/db
                                          │
                                   @quadstack/db

apps/web ──► @quadstack/ui
apps/admin ─► @quadstack/ui

apps/web ──► @quadstack/validators
apps/admin ─► @quadstack/validators
packages/api ─► @quadstack/validators
```

## Key Conventions

### Context object

Every ORPC procedure receives a `context` object. What's in it depends on the middleware applied:

| Middleware | Adds to context |
|---|---|
| `base` | `db` (Drizzle client) |
| `authed` | `db` + `user` + `session` |

### File naming

| What | Convention | Example |
|---|---|---|
| Router file | `<feature>.ts` | `posts.ts` |
| DB table | snake_case | `blog_post` |
| Zod schema | `<action><Model>Schema` | `createPostSchema` |
| React component | PascalCase | `PostCard.tsx` |
| Server action / server util | `<verb>-<noun>.ts` | `get-posts.ts` |

### Env vars

Each app and package validates its own env vars using `@t3-oss/env-core` or `@t3-oss/env-nextjs`. Never access `process.env` directly — always go through the typed `env` object from the local `env.ts`.

## Hosting

| App | Recommended | Notes |
|---|---|---|
| `web` | Vercel | Zero-config, edge-compatible |
| `admin` | Railway | Internal, no CDN needed |
| Database | Supabase | Managed Postgres + auth tables |
| Email | Resend | Via `@quadstack/auth` resend client |
