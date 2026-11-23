# Openfront Biogas

Software for a company that sells, installs and services household, farm and institutional biodigesters: enquiries and sizing, surveys, option quotes, orders and payment plans, installation and commissioning, warranties, service tickets, service plans and a parts shop. One company per deployment, with branches.

**This is real business software. Core actions must work on the live site; local checks alone are not launch acceptance.**

## Architecture

- Next.js 16 / React 19, Keystone 6, Prisma and PostgreSQL.
- `app/`: thin route wrappers.
- `features/keystone/`: models, named GraphQL operations, transactional domain services and onboarding.
- `features/platform/`: role-aware staff workflows at `/dashboard/platform`.
- `features/storefront/`: public storefront and customer account.
- `features/integrations/payment/`: real payment adapters. Cash, mobile money and bank transfers use submitted references verified by staff; they require no card keys.
- Money is integer minor units plus currency. Named status mutations enforce permissions, compare-and-set and audit records. Date-driven states are derived on read. External events leave by webhook, not background notification machinery.

See [the feature matrix](docs/feature-matrix.md), [storefront click paths](docs/STOREFRONT-MATRIX.md), [staff operations](docs/staff-operations.md) and [storefront operations](docs/storefront-operations.md).

## Configuration and migrations

Use the repository's supported Node engine and installed lockfile dependencies. Set `DATABASE_URL` and a private `SESSION_SECRET`; configure the public frontend URL for customer links. Never put credentials in commits or reports.

```sh
npm run migrate          # deploy committed migrations
npm run build
npm start
```

Schema changes use `npm run migrate:gen` against an isolated scratch database, then reviewed committed migrations. **Never use `prisma db push`.** The build script also applies committed migrations; inspect the target before running it.

First-run dashboard onboarding creates the company's reference data and policy defaults. `npm run seed -- --country=US --name="Juniper Biogas"` runs the same onboarding and initial activity; it is idempotent. It prints newly created login credentials once, so keep its output private. Do not re-seed a business database without authorization.

### Payments and uploads

Offline references work without Stripe. Card payments require the Stripe credentials used by the adapter. Configure Stripe's webhook URL as `/api/payments/stripe/webhook` and set its signing secret in `STRIPE_WEBHOOK_SECRET`. The handler verifies the raw body and correlates amount, currency and session before capture. Reconcile uncertain card results from Payments → Read card outcomes; never guess success.

Local files live under `public/images` and `public/files`. Production needs persistent storage for those folders or the configured object-storage adapter; ephemeral filesystem storage is not durable evidence retention. Never expose business attachments publicly without reviewing their intended audience and access requirements.

## Verification

```sh
npx tsc --noEmit -p .
node --test tests/*.cjs
# With BIOGAS_TEST_DATABASE_URL naming an isolated migrated schema=vitest:
npx vitest run
```

Database tests must use the isolated `vitest` schema, never business data: suite setup truncates application tables in that schema. A skipped database suite is not a pass. The inherited verify wrapper and several state-suite helpers are not yet committed; see the feature matrix's launch gates before treating a clean checkout as verified.

Current evidence: a combined run of the three state suites passed **49 tests without skips**. Staff workflow screenshots are under `~/Code/Euler/state/screenshots/b7-biogas/platform/`. Neither that result nor route presence establishes production readiness: the main action must still be performed on the live deployment as customer and staff, with URL and record IDs reported.
