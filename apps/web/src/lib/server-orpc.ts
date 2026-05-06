// Direct in-process ORPC caller for Server Components — zero HTTP round-trip.
// Use this instead of lib/orpc.ts in any async server component or route handler.
//
// For public data (no auth needed) use the pre-built callers below.
// For authenticated data, call getServerCaller() which forwards request headers.
import "server-only";
import { createRouterClient } from "@orpc/server";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { appRouter } from "@quadstack/api";

// ── Authenticated caller ───────────────────────────────────────────────────────
// Forwards Next.js request headers so auth middleware can read the session.
export async function getServerCaller() {
  const h = await headers();
  return createRouterClient(appRouter, {
    context: { headers: h as unknown as Headers },
  });
}

// ── Public (unauthenticated) caller ───────────────────────────────────────────
// No headers needed — safe to use at module scope for cache wrappers below.
const publicCaller = createRouterClient(appRouter, {
  context: { headers: new Headers() },
});

// Re-export for direct use in server components that don't need caching.
export { publicCaller };

// ── Cached wrappers (5-minute TTL) ────────────────────────────────────────────
// These call the DB directly (no HTTP) and cache the result with Next.js's data
// cache. Ideal for homepage sections and any data that changes infrequently.
//
// Invalidate programmatically with: revalidateTag("products") etc.
export const getCachedCategories = unstable_cache(
  () => publicCaller.categories.list(),
  ["categories"],
  { revalidate: 300, tags: ["categories"] },
);

export const getCachedFeaturedProducts = unstable_cache(
  () => publicCaller.products.featured(),
  ["products-featured"],
  { revalidate: 300, tags: ["products"] },
);

export const getCachedNewArrivals = unstable_cache(
  () => publicCaller.products.newArrivals(),
  ["products-new-arrivals"],
  { revalidate: 300, tags: ["products"] },
);

export const getCachedOnSale = unstable_cache(
  () => publicCaller.products.onSale(),
  ["products-on-sale"],
  { revalidate: 300, tags: ["products"] },
);

export const getCachedBestSellers = unstable_cache(
  () => publicCaller.products.bestSellers(),
  ["products-best-sellers"],
  { revalidate: 300, tags: ["products"] },
);
