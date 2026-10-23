#!/usr/bin/env bash
# Writes an exact copy of the live database structure (tables, policies, functions, triggers) to supabase/schema.sql.
# The files in supabase/migrations are a history with notes; this file is the source of truth you can rebuild from.
# Needs the Supabase CLI and your database connection string (Supabase dashboard > Connect > Direct connection).
#   DB_URL="postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres" ./scripts/export-schema.sh
set -euo pipefail
: "${DB_URL:?Set DB_URL to your database connection string}"
cd "$(dirname "$0")/.."
npx supabase db dump --db-url "$DB_URL" --schema public,private -f supabase/schema.sql
echo "Saved supabase/schema.sql. Commit it after every migration."
