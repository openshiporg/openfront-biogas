# Openfront Biogas

THIS IS NOT A MOCK, A SANDBOX OR A DEMO. It is sold to real biogas companies. Quoting, paying, installing and servicing must work on the live site.

- Product: for companies that sell, install and service small biodigesters (home, farm, institutional kitchens): leads and sizing, site surveys, quotes with options, orders and instalment plans, installs and commissioning, follow-ups, warranty and repair tickets, service plans, a parts shop. Not for digester plant operators or waste collectors.
- The design is `~/Code/Euler/state/dossiers/b7/biogas-dissertation.md`. Its Feature Matrix (section 6) is binding: every S row must be reachable on the storefront and every P row on a platform page. The storefront holds customer actions only; most work is on platform pages.
- Layout: `app/` stays thin; code lives in `features/`. Models in `features/keystone/models`, GraphQL operations in `features/keystone/mutations`, dashboard slices in `features/platform`, storefront in `features/storefront`, payment adapters in `features/integrations/payment`.
- One company per deployment, with branches. A customer sees only their own records; guests reach a record only by its unguessable public code.
- Status changes go through named mutations with compare-and-set and an audit row. Money is an integer in minor units with a currency code.
- No cron, workers, outbox, texting or email machinery. Clock-driven states are derived from dates on read. External events leave by webhook only.
- Mobile-money, bank and cash payments recorded by reference and verified by staff are real payments, and they work with no keys set. Never gate a core action behind an env var that is unset on live.
- Never `prisma db push`. Use `npm run migrate:gen` and `npm run migrate` (scratch database per the `openfront-prisma-migrations` skill).
- No words like demo, sample, test, mock or sandbox in seed data, UI text, routes or tables.
