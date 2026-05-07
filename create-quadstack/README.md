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
- **App type** — Blank, SaaS, E-commerce, LMS, Blog, Marketplace, Booking, Job Board, Community, Events, Invoicing
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

### Booking / Scheduling
Provider services with weekly availability, time-slot booking, and appointment management.

**Schema:** `staff_role`, `provider`, `service`, `provider_availability`, `availability_override`, `appointment`

**Generated:**
- Provider profile + service CRUD (duration in minutes, price, color, active/inactive)
- Weekly availability windows per day-of-week with override dates (blocked or custom hours)
- `getAvailableSlots` — steps through availability windows in `duration`-minute increments, subtracts existing appointments, respects overrides and blocked dates
- Booking: self-booking prevention, free services auto-confirmed, paid services → Stripe checkout
- Stripe webhook confirms appointment on `checkout.session.completed`
- Cached provider listing via `server-orpc.ts`
- Pages: homepage, provider detail + 3-step BookingWidget (date → slot → confirm), appointment detail, provider dashboard, admin appointments table

### Job Board
Company profiles with job listings, applications, employer review workflow, and saved jobs.

**Schema:** `staff_role`, `company`, `job`, `application`, `application_note`, `saved_job`

**Generated:**
- Company CRUD (owner enforced on update/delete, logo, slug)
- Job CRUD with `publishedAt` timestamp on first publish; type (`full_time`, `part_time`, `contract`, `internship`) and work-mode (`remote`, `hybrid`, `on_site`) enums; salary range + currency
- Job applications: duplicate check, closed-job guard, withdraw own only; `applyUrl` for external apply or inline cover letter / résumé form
- Employer endpoints: `listForJob`, `updateStatus`, `addNote` — all verify company ownership
- Save/unsave jobs per user
- Cached job listing with type/workMode/search filters via `server-orpc.ts`
- Pages: jobs listing, job detail + ApplyButton (external link or inline form), my applications, employer dashboard, post new job, admin jobs table

### Community / Forum
Channels, threaded discussion, nested replies, up/down votes, and admin moderation.

**Schema:** `staff_role`, `channel`, `thread`, `reply`, `vote`, `report`

**Generated:**
- Channel CRUD (`adminPriv` required, slug, icon, public/private)
- Thread CRUD with `isPinned`, `isLocked`, `replyCount` (incremented on reply), `score` (denormalized)
- Nested replies (`parentId` self-reference); soft-delete preserves thread structure (`isDeleted: true`, body → `"[deleted]"`)
- Vote toggle: same value → remove + undo delta; different value → change + ±2 swing; new → insert + ±1 delta
- Reports: submit (thread/reply), resolve/dismiss (`adminPriv`); lock/pin (`adminPriv`)
- Cached channel listing via `server-orpc.ts`
- Pages: channel list, thread list (load-more pagination), thread detail with VoteButton + ReplyForm, admin moderation queue

### Event Platform
Events with ticket tiers, capacity tracking, Stripe/Paystack checkout, and QR check-in.

**Schema:** `staff_role`, `event`, `ticket_tier`, `ticket`

**Generated:**
- Event CRUD (organizer-owned, slug, online/in-person, start/end time, timezone, `publishedAt`)
- Ticket tiers per event (capacity, `sold` counter, sales deadline, free flag, price)
- `claimFreeTicket` — capacity check + generates 16-char hex check-in code + increments `sold`
- Paid tickets: Stripe checkout or Paystack — webhook creates N tickets and increments `sold` atomically
- `checkIn` — verifies organizer ownership, checks `status === "paid"`, prevents double check-in, records `checkedInAt` + `checkedInBy`
- Cached event listing via `server-orpc.ts`
- Pages: events listing, event detail + TicketPurchase component, my tickets (check-in code in monospace box), admin events table

### Invoicing
Client management, invoices with line items, payment links, and payment history.

**Schema:** `staff_role`, `client`, `invoice`, `invoice_item`, `payment`

**Generated:**
- Client CRUD (owner-scoped: name, email, company, phone, address, tax ID)
- Invoice CRUD: auto-generated `INV-YYYYMM-XXXX` number, tax rate + discount, `dueDate`; only drafts can be edited
- Status lifecycle: `draft → sent → paid / overdue / cancelled`
- Line items (description, quantity, unit price); subtotal, tax, discount, total computed server-side
- `markOverdue` (`adminPriv`) bulk-transitions sent invoices past their due date
- Stripe payment links: `createPaymentLink` creates a Stripe Payment Link and stores URL on invoice; webhook marks paid on `payment_intent.succeeded`
- Manual mark-paid + payment record history
- Public invoice view (no auth) for sharing with clients
- Cached invoice listing via `server-orpc.ts`
- Pages: invoice list, invoice detail with payment link + mark-paid + payment history, new invoice builder with dynamic line items, admin all-invoices table

## Publishing a new version

```bash
cd create-quadstack
# bump version in package.json first
npm publish --access public
```
