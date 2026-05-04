# create-quadstack

CLI to scaffold a new QuadStack project in seconds.

## Usage

```bash
# With npm
npm create quadstack my-app

# With pnpm
pnpm create quadstack my-app

# With npx
npx create-quadstack my-app
```

You'll be prompted to choose:
- Which apps to include (`web`, `admin`)
- OAuth providers (Google, Facebook, GitHub)
- Payment providers (Stripe, Paystack, PayPal)
- Database host (Supabase, Neon, local)
- Whether to initialise git and install dependencies

## What gets created

```
my-app/
├── apps/web/          # Next.js public app
├── apps/admin/        # Next.js admin app (if selected)
├── packages/api/      # ORPC backend routers
├── packages/auth/     # Better Auth config
├── packages/db/       # Drizzle ORM schema + client
├── packages/ui/       # shadcn/ui components
├── packages/validators/
├── tooling/           # Shared ESLint, Prettier, Tailwind, TypeScript
├── docs/              # Architecture + contribution guides
└── .env               # Pre-filled with your chosen providers
```

## Publishing a new version

```bash
cd create-quadstack
pnpm build
npm publish --access public
```

Bump the `version` in `package.json` before publishing.
