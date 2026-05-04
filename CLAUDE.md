# CLAUDE.md — QuadStack

QuadStack is a Turborepo monorepo template. Every project built on it shares this
same architecture. Read this before touching any code.

## Monorepo Layout

```
apps/          Deployable Next.js applications
packages/      Shared internal libraries (never deployed alone)
tooling/       Shared configs (eslint, prettier, tailwind, typescript)
docs/          Architecture decisions and guides
```

## Adding a New API Endpoint

1. Create handler in `packages/api/src/orpc-routers/[domain].ts`
2. Export from `packages/api/src/orpc-routers/index.ts`
3. Call from any app via the typed `orpc` client

```typescript
// packages/api/src/orpc-routers/products.ts
export const getProducts = base
  .use(publicMiddleware)
  .input(z.object({ category: z.string().optional() }))
  .handler(async ({ input }) => {
    return db.query.products.findMany({ ... });
  });
```

Middleware options:
- `publicMiddleware` — no auth required (browsing, public pages)
- `authMiddleware`  — user must be logged in
- `adminMiddleware` — admin/owner role required

## Adding a Database Table

1. Add table to `packages/db/src/schema.ts`
2. Run `pnpm db:push` — syncs schema to database
3. Import in your router: `import { myTable } from "@quadstack/db/schema"`

Never edit `packages/db/drizzle/` — that is auto-generated.

## Auth

Default: Better Auth. Config lives in `packages/auth/src/index.ts`.
To switch providers, see `docs/decisions/003-switching-auth.md`.

After changing auth config, regenerate DB schema:
```bash
pnpm auth:generate
```

## Environment Variables

Validated at startup via `@t3-oss/env-core`.
- Add new vars to `packages/auth/env.ts` AND `.env.example`
- Missing required vars will throw at boot — not silently fail

## Development Commands

```bash
pnpm dev              # all apps
pnpm dev:web          # storefront only
pnpm dev:admin        # admin only
pnpm db:push          # sync schema to database
pnpm db:studio        # open Drizzle Studio
pnpm lint:fix         # fix lint errors
pnpm format:fix       # fix formatting
pnpm typecheck        # check types across all packages
```

## Commit Convention

Conventional commits enforced:
```
feat(scope): add new feature
fix(scope): fix a bug
refactor(scope): restructure without behavior change
chore: update deps, config
```

## Rules

- Never run `pnpm db:push` on production without reviewing the diff first
- Never skip commit hooks unless you have manually run lint + format + typecheck
- Business logic lives in `packages/api` — never write it inside an app
- Env vars are validated — never use `process.env.X` directly outside of `env.ts`
