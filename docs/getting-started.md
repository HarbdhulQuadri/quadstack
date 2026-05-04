# Getting Started

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 22 | https://nodejs.org |
| pnpm | ≥ 10 | `npm i -g pnpm` |
| PostgreSQL | any (Supabase recommended) | https://supabase.com |

## First-time Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/your-project
cd your-project
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in `.env`. At minimum these are required to boot:

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=any-random-32-char-string
NEXT_PUBLIC_WEB_URL=http://localhost:3000
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
```

Generate a secret with: `openssl rand -base64 32`

### 3. Push the database schema

```bash
pnpm db:push
```

This creates all tables in your Postgres database (auth tables + your app tables).

### 4. Start development

```bash
# All apps at once
pnpm dev

# Or individually
pnpm dev:web    # http://localhost:3000
pnpm dev:admin  # http://localhost:3001
```

## Running checks before committing

```bash
pnpm lint        # ESLint across all packages
pnpm typecheck   # TypeScript across all packages
pnpm format      # Prettier check
pnpm format:fix  # Auto-fix formatting
```

## Database changes

After editing any table in `packages/db/src/schema.ts`:

```bash
pnpm db:push     # Sync schema to database (dev)
pnpm db:studio   # Open Drizzle Studio (visual DB browser)
```

For production, use migrations instead of push:

```bash
pnpm db:generate   # Generate SQL migration file
pnpm db:migrate    # Apply pending migrations
```

## Auth schema changes

After adding Better Auth plugins in `packages/auth/src/index.ts`:

```bash
pnpm auth:generate   # Regenerate packages/db/src/auth-schema.ts
pnpm db:push         # Sync to database
```

## Adding a shadcn/ui component

```bash
pnpm ui-add
# Select component (e.g. button, dialog, card)
# It lands in packages/ui/src/components/
```

Then re-export it from `packages/ui/src/index.ts`:

```ts
export * from "./components/button";
```

## Commit format

This repo uses conventional commits (enforced):

```
type(scope): subject

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
```

Examples:
```
feat(api): add posts router
fix(auth): handle null email on sign-in
docs(contributing): add backend guide
```
