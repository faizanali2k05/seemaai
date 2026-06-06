"""Alembic migration environment — async PostgreSQL support."""
import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

import os

config = context.config

# Pick the DB URL Alembic should use.
#
# Migrations need DDL privileges (CREATE TABLE, ALTER, RLS policies). The
# normal application user (`seema_app`) is intentionally non-superuser —
# it can SELECT/INSERT/UPDATE/DELETE but cannot run DDL. Resolution order:
#
#   1. MIGRATION_DATABASE_URL — explicit override for "this URL is for
#      migrations" (preferred when you want a separate role).
#   2. ADMIN_DATABASE_URL — the existing BYPASSRLS / `seema_admin` role,
#      which also holds CREATE privileges on schema `public`. This is
#      the same role Prisma uses for `migrate deploy` (see task #10).
#   3. DATABASE_URL — last resort, fine for local dev where the app user
#      is the postgres superuser.
#
# This mirrors Prisma's `DATABASE_URL` (app) / `DIRECT_URL` (migrations)
# split.
database_url = (
    os.environ.get("MIGRATION_DATABASE_URL")
    or os.environ.get("ADMIN_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
)
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import all models so Alembic can detect them
import sys
sys.path.insert(0, ".")
from database import Base
from models import *  # noqa: F401,F403

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online():
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
