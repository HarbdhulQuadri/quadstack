# ADR 002 — Why Better Auth

## Decision

Use **Better Auth** as the default authentication library.

## Context

Authentication is the most-replaced part of any template. We chose Better Auth as the default because:

1. **Self-hosted**: No vendor lock-in. Tokens and sessions stay in your own PostgreSQL database.

2. **Batteries included**: Email/password, OAuth (Google, GitHub, Facebook), 2FA, magic links, and organization/teams support — all in one package.

3. **Drizzle adapter**: Schema is auto-generated into `packages/db/src/auth-schema.ts` via `pnpm auth:generate`. No manual migration files.

4. **Swappable**: The auth contract (`auth`, `getSession`, `Session`, `User`) is isolated to `packages/auth/src/index.ts`. See `003-switching-auth.md` for step-by-step guides for Clerk, NextAuth, Supabase, and Lucia.

## Trade-offs

- Newer library — less battle-tested than NextAuth or Clerk.
- No hosted dashboard for user management (use Drizzle Studio or build your own admin panel).
- OAuth setup requires creating apps in Google/GitHub/Facebook consoles.

## Configuration

Runtime config: `packages/auth/src/index.ts`  
Auth schema generation (CLI only): `packages/auth/script/auth-cli.ts` (not created in this template — `pnpm auth:generate` reads from the runtime config directly via Better Auth's `generateSchema` utility)  
DB output: `packages/db/src/auth-schema.ts`

After any change to auth plugins or providers, run:

```bash
pnpm auth:generate
pnpm db:push
```
