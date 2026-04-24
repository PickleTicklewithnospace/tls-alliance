#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="alliance-raid"
AUTH_GROUP="micros-sv--gengar-dl-admins"

cd "$(dirname "$0")"

echo "==> Building..."
npm run build

echo "==> Zipping dist/..."
(cd dist && zip -r ../dist.zip . -q)

echo "==> Uploading to Statlas namespace: ${NAMESPACE}..."
atlas statlas post \
  --file=dist.zip \
  --namespace="$NAMESPACE" \
  --auth-group="$AUTH_GROUP"

rm dist.zip

echo ""
echo "Deployed: https://statlas.prod.atl-paas.net/${NAMESPACE}/index.html"
