"""Apply Supabase dashboard auth schema (profiles + login RPCs).

Requires database password from Supabase Dashboard:
  Settings → Database → Database password

Set in .env:
  SUPABASE_DB_PASSWORD=your-database-password

Or provide full connection string:
  DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv

load_dotenv(project_root / ".env")

AUTH_SQL = project_root / "supabase" / "auth_profiles.sql"


def _project_ref(supabase_url: str) -> str:
    host = urlparse(supabase_url).netloc
    return host.split(".")[0]


def _build_database_url() -> str | None:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    supabase_url = os.environ.get("SUPABASE_URL")
    db_password = os.environ.get("SUPABASE_DB_PASSWORD")
    if not supabase_url or not db_password:
        return None

    ref = _project_ref(supabase_url)
    return (
        f"postgresql://postgres:{db_password}@db.{ref}.supabase.co:5432/postgres"
        f"?sslmode=require"
    )


def apply_auth_sql(database_url: str) -> None:
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "Install psycopg2-binary: pip install psycopg2-binary"
        ) from exc

    sql = AUTH_SQL.read_text(encoding="utf-8")
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
    finally:
        conn.close()


def verify_auth_ready() -> tuple[bool, str]:
    from src.phase1_data_pipeline.supabase_client import get_supabase_client

    client = get_supabase_client()
    if not client:
        return False, "Supabase client unavailable (check SUPABASE_URL and SUPABASE_KEY)."

    try:
        client.rpc("is_username_available", {"p_username": "__setup_probe__"}).execute()
    except Exception as exc:
        return False, f"Auth RPC not ready: {exc}"

    try:
        client.table("profiles").select("id").limit(1).execute()
    except Exception as exc:
        return False, f"Profiles table not ready: {exc}"

    return True, "Auth schema ready (profiles + is_username_available + resolve_login_email)."


def main() -> int:
    ok, message = verify_auth_ready()
    if ok:
        print(f"OK: {message}")
        return 0

    print(f"Auth not ready: {message}")

    database_url = _build_database_url()
    if not database_url:
        print(
            "\nTo apply auth schema automatically, add to .env:\n"
            "  SUPABASE_DB_PASSWORD=<from Supabase Dashboard > Settings > Database>\n"
            "Then run: python scripts/setup_supabase_auth.py\n"
            "\nOr paste supabase/auth_profiles.sql into Supabase SQL Editor manually."
        )
        return 1

    print("Applying supabase/auth_profiles.sql …")
    apply_auth_sql(database_url)

    ok, message = verify_auth_ready()
    if ok:
        print(f"OK: {message}")
        return 0

    print(f"ERROR: {message}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
