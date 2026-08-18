#!/usr/bin/env bash
# One-command deployment of the full reference stack into the current AWS
# account/region: CDK deploy + demo user + web/.env.local generation.
#
# Usage:
#   ./scripts/deploy.sh [demo-email] [demo-password]
#
# Optional environment overrides:
#   STEP_UP_THRESHOLD   booking amount that triggers step-up (default 500)
#   SES_FROM_ADDRESS    verified SES sender for real OTP emails (default: unset,
#                       OTPs go to the CreateAuthChallenge CloudWatch log group)
#   WEB_ORIGIN          allowed CORS origin (default http://localhost:5173)
#
# Prerequisites: AWS CLI with credentials, Node.js >= 20.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_NAME="AnyCompanyHotelStepUpAuth"
EMAIL="${1:-demo@anycompany.example}"
PASSWORD="${2:-Demo#Pass-2026}"
THRESHOLD="${STEP_UP_THRESHOLD:-500}"
ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"
OUTPUTS_FILE="$ROOT/infra/outputs.json"

echo "==> Checking prerequisites"
command -v aws >/dev/null || { echo "ERROR: AWS CLI not found"; exit 1; }
command -v node >/dev/null || { echo "ERROR: Node.js not found"; exit 1; }
aws sts get-caller-identity --query Account --output text >/dev/null \
  || { echo "ERROR: no valid AWS credentials (aws sts get-caller-identity failed)"; exit 1; }

echo "==> Installing dependencies"
(cd "$ROOT/backend" && npm install --silent)
(cd "$ROOT/infra" && npm install --silent)

echo "==> Bootstrapping CDK (no-op if already bootstrapped)"
(cd "$ROOT/infra" && npx cdk bootstrap)

echo "==> Deploying stack $STACK_NAME (threshold=\$$THRESHOLD, origin=$ORIGIN)"
CDK_ARGS=(-c "stepUpThreshold=$THRESHOLD" -c "webOrigin=$ORIGIN")
if [[ -n "${SES_FROM_ADDRESS:-}" ]]; then
  CDK_ARGS+=(-c "sesFromAddress=$SES_FROM_ADDRESS")
  echo "    OTP delivery: SES email from $SES_FROM_ADDRESS"
else
  echo "    OTP delivery: CloudWatch Logs fallback (set SES_FROM_ADDRESS for real email)"
fi
(cd "$ROOT/infra" && npx cdk deploy "${CDK_ARGS[@]}" \
  --require-approval never --outputs-file "$OUTPUTS_FILE")

USER_POOL_ID="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].UserPoolId")"
CLIENT_ID="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].UserPoolClientId")"
API_URL="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].ApiUrl")"
REGION="$(aws configure get region || true)"
REGION="${REGION:-$(aws sts get-caller-identity --query Arn --output text | cut -d: -f4)}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$REGION}}"

echo "==> Seeding demo user $EMAIL"
"$ROOT/scripts/create-demo-user.sh" "$USER_POOL_ID" "$EMAIL" "$PASSWORD"

echo "==> Writing web/.env.local"
cat > "$ROOT/web/.env.local" <<EOF
VITE_AWS_REGION=$REGION
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$CLIENT_ID
VITE_API_URL=$API_URL
VITE_STEP_UP_THRESHOLD=$THRESHOLD
EOF

cat <<EOF

Deployment complete.

  User pool : $USER_POOL_ID
  App client: $CLIENT_ID
  API       : $API_URL
  Demo user : $EMAIL / $PASSWORD

Start the demo UI in live mode:

  cd web && npm install && npm run dev    # header shows 'live mode'

Without SES_FROM_ADDRESS, read OTPs from the CreateAuthChallenge Lambda's
CloudWatch log group. Tear everything down with: ./scripts/destroy.sh
EOF
