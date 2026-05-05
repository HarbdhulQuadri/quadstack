# Getting Started

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 22 | https://nodejs.org |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| PostgreSQL | any | Supabase (recommended) or Neon — no local install needed |

## Option A: Create a new project with the CLI

```bash
npx create-quadstack@latest my-project
```

The CLI asks:
- **App type** — Blank, SaaS, E-commerce, LMS, Blog, Marketplace
- **Apps** — Web, Admin (select both or either)
- **Auth providers** — Email/password + optional Google, GitHub, Facebook
- **Payment providers** — Stripe, Paystack, PayPal (optional)
- **Database host** — Supabase, Neon, or local
- **Media uploads** — Cloudinary (recommended)
- **Deployment platform** — Vercel, Railway, Fly.io, or none
- **Git + install** — initialise repo and run `pnpm install`

Based on your choices it generates the schema, validators, routers, `.env`, deployment config, and CI/CD pipeline. All generated files are regular TypeScript — edit them freely.

## Option B: Clone the template

```bash
git clone https://github.com/HarbdhulQuadri/quadstack my-project
cd my-project
```

## First-time Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Minimum required to boot:

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=   # openssl rand -base64 32
NEXT_PUBLIC_WEB_URL=http://localhost:3000
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
```

For Cloudinary (media uploads):
```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

For rate limiting (optional — falls back to no-op without these):
```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 3. Push the database schema

```bash
pnpm db:push
```

Creates all tables (auth + your app tables) in Postgres.

### 4. Seed with sample data (optional)

```bash
pnpm db:seed
```

Generates realistic faker data so you have something to work with immediately.

### 5. Start development

```bash
pnpm dev          # All apps at once
pnpm dev:web      # http://localhost:3000
pnpm dev:admin    # http://localhost:3001
```

### 6. Browse the API docs

Open **http://localhost:3000/api/docs** — Swagger UI with every available endpoint, auto-generated from your ORPC routers.

---

## Adding Apps

### Add a mobile app

```bash
npx create-quadstack add mobile
```

Scaffolds a complete Expo app at `apps/expo/` — Expo Router, NativeWind, Better Auth (sessions in SecureStore), ORPC client, auth screens, tab navigation. Run with `pnpm dev` or `cd apps/expo && pnpm start`.

### Add another web app

```bash
npx create-quadstack add app <name>
```

Adds a new Next.js app (or API-only or docs variant) at `apps/<name>/`. Patches root `package.json` with `dev:<name>` and `deploy:<name>` scripts. Picks the next available port automatically.

---

## Database Changes

After editing `packages/db/src/schema.ts`:

```bash
pnpm db:push       # Dev — sync immediately, no migration file
pnpm db:generate   # Prod — generate SQL migration
pnpm db:migrate    # Prod — apply pending migrations
pnpm db:studio     # Visual database browser (Drizzle Studio)
```

## Auth Schema Changes

After modifying `packages/auth/src/index.ts` (adding plugins etc.):

```bash
pnpm auth:generate   # Regenerate packages/db/src/auth-schema.ts
pnpm db:push         # Sync to database
```

## Running Tests

```bash
pnpm test
```

Uses Vitest + PGlite (Postgres as WASM). No Docker, no external database needed. Tests run in-memory and are isolated per test file.

## Adding shadcn/ui Components

```bash
pnpm ui-add
```

Installs the component into `packages/ui/src/components/`, available in all apps immediately.

## Before Committing

```bash
pnpm lint
pnpm typecheck
pnpm format:fix
```

Conventional commits are enforced by commitlint + husky:

```
feat(api): add payments router
fix(auth): handle null email on sign-in
docs: update getting started guide
```

## Deploying

```bash
pnpm deploy:web      # Deploy web → Vercel (production)
pnpm deploy:admin    # Deploy admin → Vercel (production)
```

Or push to `main` — the CD pipeline in `.github/workflows/deploy.yml` deploys automatically.

For first-time Vercel setup, add these secrets to your GitHub repo:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_WEB_PROJECT_ID`
- `VERCEL_ADMIN_PROJECT_ID`
