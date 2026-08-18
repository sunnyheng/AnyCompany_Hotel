#!/usr/bin/env bash
# Tear down everything deploy.sh created (stack, users, table contents) and
# remove the generated local config.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Destroying stack (user pool and table have RemovalPolicy.DESTROY)"
(cd "$ROOT/infra" && npx cdk destroy --force)

echo "==> Removing generated local files"
rm -f "$ROOT/infra/outputs.json" "$ROOT/web/.env.local"

echo "Done. The demo UI falls back to mock mode on next start."
