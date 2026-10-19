#!/usr/bin/env bash
# Deploy with the scoped Cloudflare token (Workers Scripts, D1, Workers Routes), never the broad login.
#   scripts/deploy.sh            sync problems, seed D1, deploy the worker
#   scripts/deploy.sh <wrangler args...>   run any wrangler command with the deploy token (e.g. secret put X)
set -euo pipefail
cd "$(dirname "$0")/.."
token=${CLOUDFLARE_API_TOKEN:-$(cat "$HOME/.config/town-hall/cf-deploy-token")}
export CLOUDFLARE_API_TOKEN=$token CLOUDFLARE_ACCOUNT_ID=20ac9fd1340b29a62bcef596311057a1
if [ $# -gt 0 ]; then exec npx wrangler "$@"; fi
python3 -I scripts/sync-problems.py
npx wrangler d1 execute town-hall --remote --file seed.sql
npx wrangler deploy
