#!/usr/bin/env bash
# Seed a demo user into the deployed user pool (self sign-up is disabled).
#
# Usage:
#   ./scripts/create-demo-user.sh <user-pool-id> <email> [password]
#
# The password must satisfy the pool policy (12+ chars, upper/lower/digit/symbol).
set -euo pipefail

USER_POOL_ID="${1:?usage: create-demo-user.sh <user-pool-id> <email> [password]}"
EMAIL="${2:?usage: create-demo-user.sh <user-pool-id> <email> [password]}"
PASSWORD="${3:-Demo#Pass-2026}"

# Idempotent: skip creation when the user already exists (re-runs of deploy.sh).
if aws cognito-idp admin-get-user --user-pool-id "$USER_POOL_ID" --username "$EMAIL" >/dev/null 2>&1; then
  echo "User $EMAIL already exists — resetting password only"
else
  aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS
fi

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

echo "Demo user ready: $EMAIL"
