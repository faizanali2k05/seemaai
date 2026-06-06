#!/bin/bash
# Create the repo-root .env from .env.example, filling every __GENERATE__
# placeholder with a strong random hex secret. Run on the VPS. Will NOT
# overwrite an existing .env unless you pass --force.
set -e

# repo root = two levels up from deploy/scripts/
cd "$(dirname "$0")/../.."

if [ -f .env ] && [ "$1" != "--force" ]; then
  echo ".env already exists. Re-run with --force to regenerate (this rotates"
  echo "all DB passwords + the JWT secret and will require a fresh database)."
  exit 1
fi

cp .env.example .env

# Replace each __GENERATE__ with its own unique secret.
while grep -q "__GENERATE__" .env; do
  secret="$(openssl rand -hex 32)"
  perl -i -pe "BEGIN{\$done=0} if(!\$done && s/__GENERATE__/$secret/){\$done=1}" .env
done

echo "Generated .env with random secrets."
echo
echo "Next: open .env and paste your keys:"
echo "  - ANTHROPIC_API_KEY   (required for AI features)"
echo "  - CLIO_CLIENT_ID / CLIO_CLIENT_SECRET   (required for Clio sync)"
echo
echo "Then run:  docker compose up -d --build"
