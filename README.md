# QuadStack

A production-ready Turborepo monorepo template. Full-stack TypeScript — web, admin, and mobile from one codebase, one set of types, one deployment command.

## Quick Start

```bash
npx create-quadstack@latest my-project
```

The CLI walks you through app type, auth providers, payments, media uploads, and deployment platform — then generates a working project tailored to your choices.

Or clone manually:

```bash
git clone https://github.com/HarbdhulQuadri/quadstack my-project
cd my-project
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

## What's Inside

| Layer | Technology |
|---|---|
| Apps | Next.js 15, React 19 |
| Mobile | Expo SDK 54, Expo Router, NativeWind v4 |
| API | ORPC (type-safe HTTP-native routes + OpenAPI spec) |
| Auth | Better Auth (email/password + OAuth, swappable) |
| Database | Drizzle ORM + PostgreSQL |
| UI | shadcn/ui + Tailwind CSS v4 |
| Email | React Email templates + Resend |
| Media | Cloudinary (signed server-side uploads, no bytes through your server) |
| Validation | Zod |
| Rate limiting | Upstash Redis (falls back to no-op without config) |
| Testing | Vitest + PGlite (in-memory Postgres, no Docker) |
| Monorepo | Turborepo + pnpm workspaces |

## Directory Overview

```
apps/
  web/          Public-facing Next.js app          → localhost:3000
  admin/        Internal admin dashboard            → localhost:3001
  expo/         React Native mobile app (optional)

packages/
  api/          ORPC routers, middlewares, OpenAPI spec
  auth/         Better Auth config + email hooks
  db/           Drizzle schema, client, seed, PGlite test helper
  email/        React Email templates + Resend send helper
  media/        Cloudinary server utils + CloudImage/CloudVideo components
  ui/           Shared shadcn/ui components
  validators/   Shared Zod schemas

tooling/
  eslint/       ESLint flat config
  prettier/     Prettier config
  tailwind/     Tailwind preset
  typescript/   tsconfig bases

create-quadstack/   CLI (published to npm)
docs/               Architecture, guides, decisions
```

## App Templates

When you scaffold a project the CLI generates a complete, working domain schema, validators, ORPC routers, and UI pages — not just a skeleton.

| Template | What you get |
|---|---|
| **Blank** | Base monorepo only |
| **SaaS** | Orgs, members, token invites, Stripe subscription lifecycle, billing portal |
| **E-commerce** | 14-table schema, cart, orders, promo codes, SSE order tracker, Stripe + Paystack |
| **LMS** | Courses, sections, lessons, enrollment gated behind payment, progress tracking |
| **Blog / CMS** | Posts, categories, tags, comments, author ownership, admin moderation |
| **Marketplace** | Seller profiles, listings with ratings, bookings, payment-gated confirm, payout queue |

Every template includes:
- `pub` / `priv` / `adminPriv` procedure builders with `staff_role` table
- `server-orpc.ts` — direct in-process caller for server components (zero HTTP round-trip)
- Cached wrappers via `unstable_cache` for public data

## CLI Commands

```bash
# Scaffold a new project
npx create-quadstack my-project

# Add a mobile app to an existing project
npx create-quadstack add mobile

# Add any new Next.js / API-only / docs app
npx create-quadstack add app <name>
```

## Development Commands

```bash
pnpm dev             # Start all apps
pnpm dev:web         # Web only  (localhost:3000)
pnpm dev:admin       # Admin only (localhost:3001)

pnpm db:push         # Sync schema to database (dev)
pnpm db:migrate      # Apply migrations (prod)
pnpm db:studio       # Open Drizzle Studio
pnpm db:seed         # Seed database with faker data

pnpm test            # Run all tests (PGlite, no Docker needed)

pnpm auth:generate   # Regenerate auth DB schema after auth config changes

pnpm lint            # ESLint
pnpm typecheck       # TypeScript
pnpm format:fix      # Prettier

pnpm ui-add          # Add a shadcn/ui component

pnpm deploy:web      # Deploy web app → Vercel (prod)
pnpm deploy:admin    # Deploy admin app → Vercel (prod)
```

## API Docs

When the dev server is running:

- **`/api/docs`** — Swagger UI (browse and test all endpoints)
- **`/api/docs/openapi.json`** — OpenAPI 3.1 spec (import into Postman, Insomnia, or run `openapi-typescript` for type generation)

The spec is auto-generated from ORPC router definitions — no manual annotation needed.

## Backend Architecture

No separate backend server. Business logic lives in `packages/api` and mounts into each Next.js app as a single Route Handler:

```
Browser / Mobile
  → /api/rpc/[...rest]          (one-liner route, never changes)
      → packages/api/orpc-routers/  (your feature logic)
          → packages/db/            (Drizzle queries)
              → PostgreSQL
```

The ORPC client in each app is a typed proxy — zero codegen, types flow end-to-end.

## Switching Auth

The auth contract is four exports in one file (`packages/auth/src/index.ts`):
`auth`, `getSession`, `Session`, `User`. Replace that file to swap providers.

See `docs/decisions/003-switching-auth.md` for step-by-step guides to Clerk, NextAuth v5, Supabase Auth, and Lucia.

## Deploying

The CLI generates all deployment config during scaffold. For manual setup:

| App | Host | Why |
|---|---|---|
| `apps/web` | Vercel | Edge CDN, ISR, zero-config monorepo |
| `apps/admin` | Vercel / Railway | Fixed cost, always-on |
| Database | Supabase / Neon | Managed Postgres + backups |
| Email | Resend | Deliverability + React Email rendering |
| Media | Cloudinary | CDN + transforms, free tier covers most projects |
| Rate limiting | Upstash | Serverless Redis, no persistent connection needed |

CI runs on every push/PR (lint → typecheck → test → build).  
CD deploys to Vercel on every push to `main`.
