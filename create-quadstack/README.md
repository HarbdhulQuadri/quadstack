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
- **App type** — Blank, SaaS, E-commerce, LMS, Blog, Marketplace
- **Apps** — Web, Admin (select both or either)
- **Auth providers** — Email/password + optional Google, GitHub, Facebook
- **Payment providers** — Stripe, Paystack (optional, template-aware)
- **Database host** — Supabase, Neon, or local
- **Media uploads** — Cloudinary (recommended)
- **Deployment platform** — Vercel, Railway, Fly.io, or none
- **Git + install** — initialise repo and run `pnpm install`

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

Every template also generates:
- `packages/api/src/procedures.ts` — `pub`, `priv`, `adminPriv` procedure builders
- `apps/web/src/lib/server-orpc.ts` — in-process server caller (no HTTP round-trip in server components)
- `apps/admin/src/lib/server-orpc.ts` — same for the admin app

## App types

### Blank
Start from scratch. Only the base monorepo structure — no domain schema.

### SaaS
Multi-tenant organisations with billing.

**Schema:** `staff_role`, `organization`, `organization_member`, `invite`, `subscription`

**Generated:**
- Org CRUD (create, update, delete, list user's orgs)
- Token-based invite flow (7-day expiry, accept/reject)
- Member role management (`owner`, `admin`, `member`) + leave + remove
- Stripe: checkout session for plan upgrades, billing portal, subscription webhook lifecycle (`checkout.session.completed` → provision, `customer.subscription.updated` → sync, `invoice.payment_failed` → mark past_due, `customer.subscription.deleted` → downgrade to free)
- Admin router: list all orgs, get org detail with members + subscription
- Pages: org list, create org, org dashboard, members, billing, settings, invite accept

### E-commerce
Full online shop with cart, checkout, and order tracking.

**Schema:** `staff_role`, `category`, `product`, `product_variant`, `product_media`, `cart`, `cart_item`, `address`, `delivery_zone`, `promo_code`, `order`, `order_item`, `review`, `wishlist`

**Generated:**
- Product CRUD + featured / new-arrivals / on-sale / best-sellers queries
- Cart (get-or-create, add, update quantity, remove, clear)
- Orders (price calculation, promo validation, shipping, cart clear on confirm)
- Addresses + delivery zones + promo codes
- Reviews (rating + comment, one per order item)
- Wishlist (add/remove/list)
- Conditional payment routers: Stripe checkout + webhook / Paystack initiate + webhook
- SSE order status tracker (`/api/orders/[id]/events`)
- Cached homepage sections via `server-orpc.ts`
- Pages: homepage, product listing, product detail, cart, order detail with live status, user dashboard
- Admin pages: products table (with stock badges), orders table

### LMS
Online courses with video lessons, enrollments, and progress tracking.

**Schema:** `staff_role`, `course`, `section`, `lesson`, `enrollment`, `lesson_progress`

**Generated:**
- Course CRUD gated behind `adminPriv` (instructor role)
- Sections for grouping lessons
- Free enrollment direct; paid courses require Stripe checkout → webhook activates enrollment
- `completeLesson` checks enrollment for paid lessons
- Progress tracking (`myProgress` returns completion %)
- Cached course listing via `server-orpc.ts`
- Pages: homepage, courses listing, course detail + enroll button, lesson player with mark-complete, my courses, admin courses table

### Blog / CMS
Editorial site with posts, categories, tags, comments, and author ownership.

**Schema:** `staff_role`, `post`, `category`, `post_category`, `tag`, `post_tag`, `comment`

**Generated:**
- Post CRUD with author ownership enforced on update/delete
- Category + tag management gated behind `adminPriv`
- Comments system (requires approval, moderation via `adminPriv`)
- Paginated post listing with cursor + search/category/tag filters
- Cached categories, tags, recent posts via `server-orpc.ts`
- Pages: homepage, blog listing, post detail with comments, admin posts table

### Marketplace
Multi-vendor listings with bookings, reviews, and seller payouts.

**Schema:** `seller_profile`, `listing`, `booking`, `review`, `payout`

**Generated:**
- Seller profile (create, update) — required before creating listings (`sellerPriv`)
- Listing CRUD with ownership check, paginated listing with search/category/location/price filters, avg rating via LEFT JOIN
- Bookings: create (prevents self-booking, checks active listing), confirm (seller only), cancel (buyer or seller), complete (seller only), review (buyer, only after completed booking)
- Payment-gated booking: Stripe checkout or Paystack initiate depending on config
- Webhook queues `payout` record after payment (10% platform fee)
- Cached listings via `server-orpc.ts`
- Pages: homepage, listings grid, listing detail + booking form, booking detail + actions, sell/new, seller dashboard, admin listings table

## Publishing a new version

```bash
cd create-quadstack
# bump version in package.json first
npm publish --access public
```
