import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * `next/link` with prefetching off by default — use it for every link to a
 * page behind auth (ESLint enforces this outside the public pages).
 *
 * Those pages are all dynamic, per-user and per-club. Default prefetching
 * requested every visible link's route on each page load and again after
 * each save (a save clears the router cache): ~15–18 extra server requests per
 * action in production logs, and most of this app's Vercel function CPU.
 * Those prefetches did not make clicks faster either: benchmarked on a
 * production build with 80ms of network latency, a click took 165ms with them
 * and 169ms without. A `loading.tsx` boundary made it worse, not better.
 *
 * In the App Router `prefetch={false}` disables hover prefetching too, so a
 * click always does a fresh server round trip.
 */
export function AppLink({
  prefetch = false,
  ...props
}: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...props} />;
}
