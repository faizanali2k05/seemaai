# Seema database schema workflow

**Source of truth: Alembic + SQLAlchemy (Python side, `seema-api/`).**

Prisma schema in `seema-node/prisma/schema.prisma` is a **generated client** —
do not hand-edit it. It is regenerated from the live database via
`prisma db pull` after every Alembic migration.

This document captures the rules. Read it before changing the schema.

## Why Alembic owns the schema

The database was created by Alembic and the FastAPI/SQLAlchemy code is built
on the assumption that those models match reality. Prisma is a newer entrant;
introducing a second authority for schema changes invites destructive diffs
and silent breakage. We will revisit this decision once FastAPI is reduced
to a pure AI middleware layer (no longer touching tenant-scoped tables).

## The workflow for adding / changing columns

1. Edit the SQLAlchemy model in `seema-api/models/<table>.py`.
2. Generate an Alembic migration:
   ```bash
   docker compose exec -T api alembic revision -m "add foo column" --autogenerate
   ```
   Review the generated `seema-api/alembic/versions/<rev>_add_foo.py` file.
   `--autogenerate` is opportunistic; always check the output by hand.
3. Apply the migration in dev:
   ```bash
   docker compose exec -T api alembic upgrade head
   ```
4. Regenerate the Prisma schema and client:
   ```bash
   docker compose exec -T \
     -e DATABASE_URL="postgresql://seema:seema@db:5432/seema" \
     node-api npx prisma db pull
   docker compose exec -T \
     -e DATABASE_URL="postgresql://seema:seema@db:5432/seema" \
     node-api npx prisma generate
   ```
5. Rebuild the Node containers so the new client is in the runtime image:
   ```bash
   docker compose build node-api node-workers
   docker compose up -d node-api node-workers
   ```
6. Commit `seema-api/alembic/versions/<rev>_*.py` AND
   `seema-node/prisma/schema.prisma` together in one atomic commit.

## What is forbidden

* `prisma migrate dev` — would generate Prisma migrations and try to apply
  them, fighting Alembic. Don't.
* `prisma db push` — would rewrite the live schema based on `schema.prisma`
  and almost certainly destroy your RLS policies. Don't.
* Hand-editing `seema-node/prisma/schema.prisma`. Always regenerate via
  `prisma db pull`.
* Editing models in `seema-api/models/*.py` without writing the matching
  Alembic migration. The DB will silently lag behind and queries will fail
  at runtime.

## Row-Level Security policies

RLS lives in `seema-node/prisma/migrations/20260509211707_enable_rls/` and
is applied directly via `psql` (not via Prisma's migration runner). Reasons:
Prisma 5.22 has only partial RLS support and `prisma db pull` warns it
"is not yet fully supported."

If you add a new tenant-scoped table:
1. Define it in SQLAlchemy + Alembic (steps 1-3 above).
2. Add a corresponding `ALTER TABLE / ENABLE ROW LEVEL SECURITY / FORCE /
   CREATE POLICY` block to a NEW migration file under
   `seema-node/prisma/migrations/<timestamp>_enable_rls_<table>/migration.sql`.
3. Apply via `psql` as the schema owner (`seema`):
   ```bash
   docker compose exec -T -e PGPASSWORD=seema db \
     psql -U seema -d seema -v ON_ERROR_STOP=1 \
     < seema-node/prisma/migrations/<your_dir>/migration.sql
   ```
4. Mark applied in Prisma's tracking:
   ```bash
   docker compose exec -T \
     -e DATABASE_URL="postgresql://seema:seema@db:5432/seema" \
     node-api npx prisma migrate resolve --applied <your_migration_name>
   ```
5. Regenerate Prisma client (step 4 above).

## Database roles

`seema` — superuser, owns the schema. Used for migrations and DDL only.
Never used at runtime. Connection string: `postgresql://seema:seema@db:5432/seema`.

`seema_admin` — runtime BYPASSRLS role. Used for system operations:
login lookup before firm context exists, registration of new firms,
Stripe webhook handlers (firm lookup by stripeCustomerId), background
workers that iterate across firms. Has DML on all tables.
Connection string is `ADMIN_DATABASE_URL` in the `.env` files.

`seema_app` — runtime RLS-enforced role. Used for everything tenant-scoped.
Has DML on all tables but RLS policies filter every query.
Connection string is `DATABASE_URL` in the `.env` files.

## Future work

* When FastAPI is reduced to AI middleware only, swap authority: introspect
  the schema into Prisma, baseline a migration, mark applied, then write all
  future migrations through Prisma. Generate SQLAlchemy models from the DB
  on each FastAPI build via `sqlacodegen`. Retire the alembic/versions/ dir.
* Consider adding a CI check:
  `prisma db pull && git diff --exit-code prisma/schema.prisma` —
  fails the build if anyone forgets to regenerate after an Alembic migration.
