#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sudo service postgresql start
sudo -u postgres psql -c "DROP DATABASE IF EXISTS teamhub_test;"
sudo -u postgres psql -c "CREATE DATABASE teamhub_test;"
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f scripts/auth_stub.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170001_base.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170002_social.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170003_client_profile.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f scripts/rls_checks.sql
echo "RLS checks passed"
