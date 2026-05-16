"""Migrate data from SQLite demo database to PostgreSQL production database.

Usage:
    python scripts/migrate_sqlite_to_pg.py --sqlite-path ./data/demo-workflows.db --pg-url postgresql://seema:pass@localhost:5432/seema --firm-id <uuid>

This script:
1. Reads all data from the SQLite demo database
2. Adds firm_id to every record (multi-tenancy)
3. Inserts all records into PostgreSQL
"""
import argparse
import sqlite3
import uuid
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime


# Tables that DON'T need firm_id (global tables)
GLOBAL_TABLES = {"industries"}

# Tables and their columns (order matters for foreign keys)
TABLE_ORDER = [
    "industries",
    "staff_members",
    "user_accounts",
    "user_sessions",
    "staff_training",
    "staff_file_reviews",
    "staff_actions",
    "supervision_schedule",
    "compliance_alerts",
    "compliance_checks",
    "compliance_tasks",
    "risk_scores",
    "sra_audit_items",
    "sra_feed_log",
    "client_intake",
    "policy_documents",
    "policy_update_queue",
    "breach_reports",
    "breach_report_steps",
    "regulatory_updates",
    "regulatory_impact_analysis",
    "remediation_plans",
    "remediation_steps",
    "evidence_locker",
    "audit_reports",
    "audit_trail",
    "email_queue",
    "email_settings",
    "chaser_log",
    "matter_checklists",
    "matter_checklist_items",
    "law_clients",
    "law_cases",
    "law_deadlines",
    "law_documents",
    "law_communications",
    "law_time_entries",
    "workflows",
    "workflow_steps",
    "workflow_runs",
    "run_step_logs",
    "import_logs",
]


def get_sqlite_schema(cursor, table_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [(col[1], col[2]) for col in cursor.fetchall()]


def migrate(sqlite_path: str, pg_url: str, firm_id: str):
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()

    pg_conn = psycopg2.connect(pg_url)
    pg_cursor = pg_conn.cursor()

    print(f"Migrating from {sqlite_path} to PostgreSQL")
    print(f"Firm ID: {firm_id}")
    total_records = 0

    for table in TABLE_ORDER:
        try:
            sqlite_cursor.execute(f"SELECT * FROM {table}")
            rows = sqlite_cursor.fetchall()
        except sqlite3.OperationalError:
            print(f"  SKIP {table} (not found in SQLite)")
            continue

        if not rows:
            print(f"  SKIP {table} (empty)")
            continue

        columns = [desc[0] for desc in sqlite_cursor.description]
        needs_firm_id = table not in GLOBAL_TABLES

        # Check if firm_id column already exists in SQLite
        has_firm_id = "firm_id" in columns

        if needs_firm_id and not has_firm_id:
            columns.append("firm_id")

        col_str = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))

        insert_sql = f"INSERT INTO {table} ({col_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

        values = []
        for row in rows:
            row_data = list(row)
            if needs_firm_id and not has_firm_id:
                row_data.append(firm_id)
            values.append(tuple(row_data))

        try:
            pg_cursor.executemany(insert_sql, values)
            pg_conn.commit()
            print(f"  OK {table}: {len(values)} records")
            total_records += len(values)
        except Exception as e:
            pg_conn.rollback()
            print(f"  ERROR {table}: {e}")

    sqlite_conn.close()
    pg_conn.close()
    print(f"\nDone! Migrated {total_records} total records.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SQLite demo data to PostgreSQL")
    parser.add_argument("--sqlite-path", required=True, help="Path to demo-workflows.db")
    parser.add_argument("--pg-url", required=True, help="PostgreSQL connection URL")
    parser.add_argument("--firm-id", default=str(uuid.uuid4()), help="Firm UUID (auto-generated if omitted)")
    args = parser.parse_args()
    migrate(args.sqlite_path, args.pg_url, args.firm_id)
