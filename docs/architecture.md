# Architecture

## Directory Map

```
quadstack/
├── apps/
│   ├── web/          Public-facing Next.js app (port 3000)
│   ├── admin/        Internal admin dashboard  (port 3001)
│   └── expo/         React Native mobile app   (optional, add via CLI)
│
├── packages/
│   ├── api/          ORPC routers, middlewares, OpenAPI spec generator
│   ├── auth/         Better Auth instance + email send hooks
│   ├── db/           Drizzle schema, client, seed script, PGlite test helper
│   ├── email/        React Email templates (welcome, reset, invite, receipt) + Resend helper
│   ├── media/        Cloudinary: server-side signed uploads, CloudImage/CloudVideo, useUpload hook
│   ├── ui/           shadcn/ui component library (shared across all apps)
│   └── validators/   Zod schemas shared across apps and API
│
├── tooling/
│   ├── eslint/       Shared ESLint flat config
│   ├── prettier/     Shared Prettier config
│   ├── tailwind/     Shared Tailwind preset
│   └── typescript/   tsconfig bases (base, nextjs, react-library)
│
├── create-quadstack/ CLI — published to npm as `create-quadstack`
│   └── src/
│       ├── commands/
│       │   ├── add-app.ts      npx create-quadstack add app <name>
│       │   └── add-mobile.ts   npx create-quadstack add mobile
│       ├── templates/          Per-app-type schema + router generators
│       │   ├── blank.ts
│       │   ├── saas.ts
│       │   ├── ecommerce.ts
│       │   ├── lms.ts
│       │   ├── blog.ts
│       │   └── marketplace.ts
│       ├── generators/
│       │   └── files.ts        Writes generated files to disk
│       ├── prompts.ts          Interactive CLI prompts
│       └── scaffold.ts         Clone + patch + env + deploy config
│
└── docs/
    ├── getting-started.md
    ├── architecture.md         (this file)
    ├── contributing/
    │   ├── frontend.md
    │   ├── backend.md
    │   └── database.md
    └── decisions/
        ├── 001-why-orpc.md
        ├── 002-why-better-auth.md
        └── 003-switching-auth.md
```

## How a Request Flows

### Web / Admin

```
Browser
  │  HTTP request
  ▼
Next.js Route Handler
  apps/web/src/app/api/rpc/[...rest]/route.ts   ← one-liner, never changes
  │
  │  ORPC RPCHandler
  ▼
appRouter   (packages/api/src/orpc-routers/index.ts)
  │
  │  middleware chain:
  │    pub  → injects `db` (Drizzle client) into context
  │    priv → reads Better Auth session, injects `user` + `session`
  │           throws UNAUTHORIZED if not logged in
  ▼
procedure handler  (packages/api/src/orpc-routers/*.ts)
  │
  │  Drizzle ORM query
  ▼
PostgreSQL  (Supabase / Neon / local)
```

### Mobile (Expo)

```
React Native app
  │  HTTP request via ORPC client
  │  URL: EXPO_PUBLIC_API_URL/api/rpc/...
  ▼
Same appRouter on the deployed web app
  └── Same procedure handlers, same types
```

The mobile app shares `@{scope}/api` types but calls the deployed HTTP endpoint — no server code runs on-device.

### File Uploads (Cloudinary)

```
Client (browser or mobile)
  │  1. Fetch signed upload params
  ▼
/api/upload/sign   (verifies auth, returns signed params)
  │
  │  2. Upload directly to Cloudinary (file bytes never hit your server)
  ▼
Cloudinary CDN
  │
  │  3. Save public_id to database
  ▼
PostgreSQL
```

## Package Dependency Graph

```
apps/web ────────────────────┐
apps/admin ──────────────────┤──► @quadstack/api ──► @quadstack/auth ──► @quadstack/email
apps/expo (types only) ──────┘         │                    │
                                        │                    └──► @quadstack/db
                                        └──────────────────────► @quadstack/db

apps/web   ──► @quadstack/ui
apps/admin ──► @quadstack/ui
apps/web   ──► @quadstack/media
apps/admin ──► @quadstack/media
apps/web   ──► @quadstack/email
apps/admin ──► @quadstack/email

packages/api        ──► @quadstack/validators
packages/auth       ──► @quadstack/db
packages/email      (no internal deps — no circular risk)
packages/media      (no internal deps)
```

## Key Conventions

### Procedure builders

```ts
// packages/api/src/procedures.ts
pub   // any request — adds `db` to context
priv  // authenticated request — adds `db`, `user`, `session`
```

Apply rate limiting by composing:
```ts
const pubRl = pub.use(rateLimitByIp);
```

### Context object

| Builder | Available in context |
|---|---|
| `pub` | `db`, `headers` |
| `priv` | `db`, `headers`, `user`, `session` |

### File naming

| What | Convention | Example |
|---|---|---|
| Router file | `<feature>.ts` | `posts.ts` |
| DB table | snake_case | `blog_post` |
| Zod schema | `<action><Model>Schema` | `createPostSchema` |
| React component | PascalCase | `PostCard.tsx` |
| Server util | `<verb>-<noun>.ts` | `get-posts.ts` |

### Env vars

Each app and package validates its own env via `@t3-oss/env-core` or `@t3-oss/env-nextjs`. Never access `process.env` directly — always use the typed `env` object from the local `env.ts`.

### Pagination

```ts
import { paginate, cursorPageSchema } from "@quadstack/api/lib/paginate";

// In a router:
list: pub
  .input(cursorPageSchema.optional())
  .handler(async ({ context, input }) => {
    return paginate(
      context.db.select().from(post).$dynamic(),
      post.createdAt,
      input ?? {},
    );
  }),
// Returns: { items, nextCursor, hasMore }
```

### Email

```ts
import { sendEmail } from "@quadstack/email";

await sendEmail({ type: "welcome", to: user.email, props: { name, appName, loginUrl } });
await sendEmail({ type: "receipt", to: user.email, props: { orderId, items, total, ... } });
```

### Media uploads

```tsx
// Server: generate signed params (called from /api/upload/sign)
import { getSignedUploadParams } from "@quadstack/media";

// Client: upload hook
import { useUpload, CloudImage } from "@quadstack/media/client";
const { upload, uploading } = useUpload("avatars");

// Display
<CloudImage publicId={user.avatarId} width={80} height={80} />
```

## CI / CD

```
Push / PR  →  CI  (lint → typecheck → test → build)
Push main  →  CD  (deploy web → deploy admin)
```

Tests use PGlite — Postgres as WASM, zero install, fully isolated per run.
