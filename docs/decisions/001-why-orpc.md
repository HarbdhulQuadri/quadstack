# ADR 001 — Why ORPC

## Decision

Use **ORPC** as the primary API layer instead of tRPC.

## Context

Both ORPC and tRPC provide end-to-end type safety between Next.js server and client. We chose ORPC for the following reasons:

1. **HTTP-native**: ORPC procedures are real HTTP routes (`GET /api/rpc/auth/me`). They can be called from any HTTP client — mobile apps, external services, curl — without a tRPC-specific adapter.

2. **No extra server**: Procedures are mounted as Next.js Route Handlers directly. No standalone Express/Fastify server required.

3. **OpenAPI-friendly**: ORPC can generate OpenAPI specs from the same router definition, enabling SDK generation and documentation without duplication.

4. **Standard middleware**: ORPC middleware receives a plain `context` object. Auth, DB injection, and permission checks are plain async functions — no tRPC-specific patterns.

## Trade-offs

- Smaller ecosystem than tRPC (fewer community plugins).
- Less documentation/tutorials available.
- `@orpc/react` query integration is less mature than `@trpc/react-query`.

## How it works

```
apps/web/src/app/api/rpc/[...rest]/route.ts
    └── RPCHandler(appRouter)
            └── packages/api/src/orpc-routers/index.ts
                    └── { auth: authRouter, ... }
```

Each procedure lives in `packages/api/src/orpc-routers/`. New features get a new file there, exported from `index.ts`. The route handler is a one-liner that never changes.

**Client usage (React component):**

```tsx
import { orpc } from "@/lib/orpc";
import { useQuery } from "@tanstack/react-query";

const { data } = useQuery(orpc.auth.me.queryOptions());
```

**Server usage (Server Component / Route Handler):**

```ts
import { createApiClient } from "@quadstack/api/client";
const api = createApiClient(process.env.NEXT_PUBLIC_WEB_URL!);
const me = await api.auth.me();
```
