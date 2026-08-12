# booking-calendar-utils

A scheduling and matching back office: providers list resources, customers ask for specific days, and admins assign resources to bookings on a calendar board. Built with Next.js 15 (App Router, Server Components, Route Handlers), React 19 and Supabase (Postgres), deployed on Cloud Run.

This repository is a **public mirror of a private production codebase**, synced automatically on every merge:

- **The code is complete**: pages, API routes, the pure-logic `lib/` modules, SQL migrations and the test suites (Vitest unit and Route Handler integration tests, Playwright browser tests).
- **The domain is neutralized.** Every domain term is replaced by a neutral one, consistently across file paths, identifiers, SQL and UI copy: customers, providers, resources, locations (`locaa`, `locab`…), item types `alpha` / `beta`. Because the substitution is uniform, the mirror still type-checks and its whole test suite runs green.
- **Sensitive notes are removed**: comments about volumes, revenue, infrastructure and people are dropped paragraph by paragraph; deployment and database configuration files are not published.
- **The commit history mirrors the private repository one to one**: same order, same dates, same PR titles (with the same word substitutions).

## What's inside

| Area | Where |
|---|---|
| Calendar board: drag to create, resize, move and copy bookings; assign resources in place without a server round-trip | `app/admin/overview/` |
| Matching desk and provider-side calendar sharing one geometry model | `app/admin/matches/`, `app/provider/`, `lib/providerBoard.ts`, `lib/bandDays.ts` |
| Server-side assignment rules shared by every write path (status, validity periods, no double booking) | `lib/assignable.ts`, `lib/doubleBooking.ts` |
| Validity periods stored as Postgres `datemultirange` | `lib/validity.ts`, `supabase/migrations/` |
| Change history recorded by database triggers, not application code | `supabase/migrations/0001_init.sql`, `lib/changeLog.ts` |
| Transparent pagination past PostgREST's `max-rows` cap | `lib/fetchAllRows.ts` |
| Admin auth in middleware, RLS on with zero policies (service key only on the server) | `middleware.ts`, `lib/adminAuth.ts` |
| Referral commissions computed on read, only payouts stored | `lib/referral.ts`, `app/admin/referrals/` |

## Running the tests

```bash
npm install
npm test             # Vitest: lib/ unit tests + tests/ Route Handler integration tests (in-memory Supabase fake)
npx tsc --noEmit
npm run test:e2e     # Playwright against a stubbed database (E2E=1 build)
```

Comments are in Chinese (the working language of the original codebase).
