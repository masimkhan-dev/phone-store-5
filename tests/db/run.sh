#!/usr/bin/env bash
# Applies the migrations to a throwaway local database and runs the SQL tests.
# Usage: tests/db/run.sh   (needs a local PostgreSQL 15+ and a superuser psql login)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${TEST_DB:-mbmp_test}"
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/db/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "migrate $(basename "$f")"; $P -f "$f"; done
$P -f tests/db/01_seed.sql
$P -f tests/db/02_isolation.test.sql
$P -f tests/db/03_invoices.test.sql
bash tests/db/04_concurrency.test.sh "$DB"
$P -f tests/db/05_financial.test.sql
echo "ALL DATABASE TESTS PASSED"
