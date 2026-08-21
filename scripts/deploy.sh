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
# Every step below is idempotent, so a transient failure (network blip,
# throttling) is recovered by simply re-running the script.
trap 'echo "
ERROR: deploy.sh failed at line $LINENO (see the message above).
Every step is idempotent — fix the cause and re-run ./scripts/deploy.sh." >&2' ERR

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
WEB_BUCKET="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].WebBucketName")"
DISTRIBUTION_ID="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].WebDistributionId")"
WEB_URL="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].WebUrl")"
TABLE_NAME="$(node -p "require('$OUTPUTS_FILE')['$STACK_NAME'].TableName")"
REGION="$(aws configure get region || true)"
REGION="${REGION:-$(aws sts get-caller-identity --query Arn --output text | cut -d: -f4)}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$REGION}}"

echo "==> Seeding room catalog"
"$ROOT/scripts/seed-config.sh" "$TABLE_NAME" >/dev/null && echo "    4 rooms seeded into $TABLE_NAME"

echo "==> Seeding demo user $EMAIL"
"$ROOT/scripts/create-demo-user.sh" "$USER_POOL_ID" "$EMAIL" "$PASSWORD"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin@anycompany.example}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin#Pass-2026}"
echo "==> Seeding admin user $ADMIN_EMAIL (admins group)"
"$ROOT/scripts/create-demo-user.sh" "$USER_POOL_ID" "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" --username "$ADMIN_EMAIL" --group-name admins

echo "==> Writing web/.env.local"
cat > "$ROOT/web/.env.local" <<EOF
VITE_AWS_REGION=$REGION
VITE_USER_POOL_ID=$USER_POOL_ID
VITE_USER_POOL_CLIENT_ID=$CLIENT_ID
VITE_API_URL=$API_URL
VITE_STEP_UP_THRESHOLD=$THRESHOLD
EOF

echo "==> Building the demo UI (live mode, config baked from .env.local)"
(cd "$ROOT/web" && npm install --silent && npm run build)

echo "==> Publishing the demo UI to CloudFront (private S3 origin)"
aws s3 sync "$ROOT/web/dist" "s3://$WEB_BUCKET" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" \
  --paths '/*' --query 'Invalidation.Id' --output text >/dev/null

cat <<EOF

Deployment complete.

  Demo UI   : $WEB_URL
  User pool : $USER_POOL_ID
  App client: $CLIENT_ID
  API       : $API_URL
  Demo user : $EMAIL / $PASSWORD
  Admin user: $ADMIN_EMAIL / $ADMIN_PASSWORD  (can change the step-up threshold)

Open the Demo UI URL in a browser (header shows 'live mode'), or run it
locally with: cd web && npm install && npm run dev

Without SES_FROM_ADDRESS, read OTPs from the CreateAuthChallenge Lambda's
CloudWatch log group. Tear everything down with: ./scripts/destroy.sh
EOF
