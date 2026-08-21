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
# Only a definitive UserNotFoundException falls through to creation; any other
# failure (network, throttling, wrong pool id) aborts instead of being misread
# as "user missing" — that misread would crash a later re-run with
# UsernameExistsException.
if LOOKUP_ERR="$(aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" --username "$EMAIL" 2>&1 >/dev/null)"; then
  echo "User $EMAIL already exists — resetting password only"
elif [[ "$LOOKUP_ERR" == *UserNotFoundException* ]]; then
  aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS
else
  echo "ERROR: could not check whether $EMAIL exists:" >&2
  echo "$LOOKUP_ERR" >&2
  exit 1
fi

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

echo "Demo user ready: $EMAIL"
