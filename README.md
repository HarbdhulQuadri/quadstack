# QuadStack

A production-ready Turborepo monorepo template. Full-stack TypeScript with
Next.js, ORPC, Better Auth, Drizzle ORM, and Tailwind CSS v4.

## Quick Start

```bash
# Recommended — interactive CLI
npx create-quadstack@latest my-project

# Or clone manually
git clone https://github.com/your-org/quadstack my-project
cd my-project
cp .env.example .env   # fill in your keys
pnpm install
pnpm db:push
pnpm dev
```

## What's Inside

| Layer | Technology |
|---|---|
| Apps | Next.js 15, React 19 |
| API | ORPC (type-safe, HTTP-native routes) |
| Auth | Better Auth (swappable — see docs) |
| Database | Drizzle ORM + PostgreSQL |
| UI | shadcn/ui + Tailwind CSS v4 |
| Email | Resend |
| Validation | Zod |
| Monorepo | Turborepo + pnpm workspaces |

## Directory Overview

```
apps/
  web/          Public-facing Next.js app    → localhost:3000
  admin/        Internal admin dashboard     → localhost:3001

packages/
  api/          All ORPC routers + middlewares (the backend)
  auth/         Better Auth config + Resend email client
  db/           Drizzle schema + Postgres client
  ui/           Shared shadcn/ui components
  validators/   Shared Zod schemas

tooling/
  eslint/       ESLint flat config
  prettier/     Prettier config
  tailwind/     Tailwind preset
  typescript/   tsconfig bases

create-quadstack/   CLI (published to npm separately)

docs/
  architecture.md               How the system is structured
  getting-started.md            Local setup from scratch
  contributing/
    frontend.md                 Adding pages, components, forms
    backend.md                  Adding routers, middleware, DB tables
    database.md                 Schema, migrations, Drizzle queries
  decisions/
    001-why-orpc.md
    002-why-better-auth.md
    003-switching-auth.md       How to swap to Clerk / NextAuth / Supabase
```

## Common Commands

```bash
pnpm dev             # Start all apps
pnpm dev:web         # Start web only
pnpm dev:admin       # Start admin only

pnpm db:push         # Sync schema to database (dev)
pnpm db:studio       # Open Drizzle Studio
pnpm db:generate     # Generate migration SQL (prod)
pnpm db:migrate      # Apply migrations (prod)

pnpm auth:generate   # Regenerate auth DB schema after auth config changes

pnpm lint            # ESLint
pnpm typecheck       # TypeScript
pnpm format:fix      # Prettier

pnpm ui-add          # Add a shadcn/ui component to packages/ui
```

## Backend Architecture

There is no separate backend server. The API lives inside each Next.js app as
Route Handlers, but the business logic is shared via `packages/api`.

```
Browser request
  → apps/web/src/app/api/rpc/[...rest]/route.ts   (one-liner, never changes)
      → packages/api/src/orpc-routers/             (your feature logic)
          → packages/db/                            (Drizzle queries)
              → PostgreSQL
```

The `orpc` client in each app is a typed proxy. Zero codegen. Types flow
end-to-end automatically from the router definition to the React component.

## Switching Auth

The auth contract is a single file: `packages/auth/src/index.ts`.
It exports `auth`, `getSession`, `Session`, and `User`.
Replace that file to swap providers.

See `docs/decisions/003-switching-auth.md` for step-by-step guides:
- → Clerk
- → NextAuth / Auth.js v5
- → Supabase Auth
- → Lucia Auth

## Deploying

| App | Host | Why |
|---|---|---|
| `apps/web` | Vercel | Edge CDN, ISR, zero-config |
| `apps/admin` | Railway | Fixed cost, always-on |
| Database | Supabase | Managed Postgres + backups |
| Email | Resend | Transactional email |
