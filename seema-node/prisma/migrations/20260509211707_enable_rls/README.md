# RLS rollout — runbook

What this migration does and exactly how to apply it. Read this end-to-end before touching production.

## What's protected

Row-Level Security is now enforced on **36 tenant-scoped tables** (every table with a `firm_id` column). Even if a route handler forgets to filter by `firmId`, Postgres will refuse to return cross-tenant rows.

The 3 non-tenant tables are intentionally left without RLS: `firms` (the tenant table itself), `regulatory_updates` (shared regulatory feed), `sra_feed_log` (system scraping log).

## How it works

Two Postgres roles:

`seema_admin` has the `BYPASSRLS` attribute and owns the schema. It runs migrations and is used by the application's `adminPrisma` client for system operations (login lookup, registration, Stripe webhooks, scraper writes to shared tables).

`seema_app` is the regular application role. RLS is enforced for it. Every query must execute inside a transaction that has set the GUC `app.current_firm_id` to the user's firm. Any query without the GUC set returns zero rows (fail-closed).

The Node.js client wires this up automatically: the `authenticate` middleware pushes `firmId` into AsyncLocalStorage, and the Prisma proxy in `src/lib/prisma.ts` wraps every model query in an interactive transaction that runs `SELECT set_config('app.current_firm_id', ...)` before the query.

## Apply order

Run these once, in order, on each environment.

1. Connect to your Postgres as a superuser (the `postgres` user inside the `db` container).

   ```bash
   docker compose exec db psql -U postgres -d seema
   ```

2. Inside psql, set the two role passwords (replace `CHANGE_ME_admin` and `CHANGE_ME_app` with output of `openssl rand -base64 32`):

   ```sql
   \i /path/inside/container/roles.sql
   ```

   Or copy the role-creation block from `roles.sql` and run it directly. After this, both roles exist.

3. Update environment variables:

   `seema-node/.env`:
   ```
   DATABASE_URL=postgresql://seema_app:<app_password>@db:5432/seema
   ADMIN_DATABASE_URL=postgresql://seema_admin:<admin_password>@db:5432/seema
   MIGRATE_DATABASE_URL=postgresql://seema_admin:<admin_password>@db:5432/seema
   ```

   `seema-api/.env`:
   ```
   DATABASE_URL=postgresql+asyncpg://seema_app:<app_password>@db:5432/seema
   ADMIN_DATABASE_URL=postgresql+asyncpg://seema_admin:<admin_password>@db:5432/seema
   ```

4. Apply the migration. Prisma's migration runner uses `DATABASE_URL` by default. To run migrations as `seema_admin` (so it can ALTER tables and create policies), temporarily switch:

   ```bash
   cd seema-node
   DATABASE_URL=$MIGRATE_DATABASE_URL npx prisma migrate deploy
   ```

5. Run the smoke test:

   ```bash
   docker compose exec -T db psql -U seema_admin -d seema < prisma/migrations/20260509211707_enable_rls/smoke_test.sql
   ```

   Verify the output matches the expected summary at the bottom of the script. If it does not, **stop** — RLS is not protecting your data correctly.

6. Restart the API containers so they pick up the new `DATABASE_URL`:

   ```bash
   docker compose restart node-api node-workers api
   ```

7. Hit a sample authenticated endpoint (e.g. `GET /api/dashboard`) with a valid JWT to confirm the wiring works end-to-end. If it returns 500 with `TenantContextMissingError`, a route is calling Prisma outside the AsyncLocalStorage scope — see the troubleshooting section.

## Workers and Stripe webhook (still TODO)

Background workers and the Stripe webhook handler do **not** go through the `authenticate` middleware, so they will throw `TenantContextMissingError` on every Prisma call until you wrap them. Three patterns:

For a worker that processes a job for one specific firm:
```ts
import { runWithFirm } from '../lib/tenantContext';
import prisma from '../lib/prisma';

worker.on('completed', async (job) => {
  await runWithFirm(job.data.firmId, async () => {
    await prisma.matter.update({ ... });
  });
});
```

For a worker that iterates over all firms:
```ts
import { runWithBypass, runWithFirm } from '../lib/tenantContext';

await runWithBypass('cron: nightly compliance scan over all firms', async () => {
  const firms = await prisma.firm.findMany();
  for (const firm of firms) {
    await runWithFirm(firm.id, async () => {
      await runComplianceScan();
    });
  }
});
```

For Stripe webhooks, look up the firm by `stripeCustomerId` under bypass, then process under firm scope:
```ts
const firm = await runWithBypass('stripe webhook: customer lookup', () =>
  prisma.firm.findFirst({ where: { stripeCustomerId: event.data.object.customer } })
);
if (!firm) return res.sendStatus(404);
await runWithFirm(firm.id, () => processStripeEvent(event));
```

## Troubleshooting

`TenantContextMissingError: ... ran outside any tenant context` — a Prisma call happened with no AsyncLocalStorage scope. Either the route is not behind `authenticate`, or the call is in a worker/webhook that needs explicit `runWithFirm`/`runWithBypass`.

`new row violates row-level security policy` on a write — the `firmId` in the data does not match `app.current_firm_id`. Almost always means the application is trying to insert a row for the wrong firm. Check the route handler.

Empty result sets where data exists — the GUC is not being set. Confirm the connection is going through the proxy (not via raw `$queryRaw` or a direct `pg` client). Confirm `authenticate` middleware ran.

Migrations fail with permission denied — you tried to run migrations as `seema_app`. Use the `MIGRATE_DATABASE_URL` (seema_admin) for migrations.

## Rollback

If you need to disable RLS temporarily (NOT recommended in production):

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'firms' AND tablename != 'regulatory_updates' AND tablename != 'sra_feed_log'
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.tablename);
  END LOOP;
END $$;
```

Then switch `DATABASE_URL` back to a `BYPASSRLS` role.
