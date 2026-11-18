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
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170004_calendar.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170005_calendar_times.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170006_member_accounts.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170007_strategy_grid.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170008_admin_reset_password.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170009_avatars.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170010_last_sign_in.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170011_client_readonly.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411170012_contact_logs.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411180001_customer_fields.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f supabase/migrations/202411180002_customer_grade.sql
sudo -u postgres psql -d teamhub_test -v ON_ERROR_STOP=1 -f scripts/rls_checks.sql
echo "RLS checks passed"
