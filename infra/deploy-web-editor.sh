#!/usr/bin/env bash
# Deploy the hosted storytree-web Keystatic editor to Cloud Run (ADR-0101).
# Mirrors infra/studio-cloud.md's deploy, minus IAP and the DB. Idempotent.
#
# Run with GIT BASH (NOT WSL — WSL can't see /c paths or the Windows gcloud), from a
# checkout where ./web is the storytree-web submodule:
#   bash infra/deploy-web-editor.sh
#
# Secrets: on the FIRST run, web/.env (written by Keystatic's GitHub App setup —
# `npm run dev:editor` in web/) must be present; its three KEYSTATIC_* values are
# pushed to Secret Manager. On later runs web/.env is optional (the secrets already
# live in Secret Manager and the deploy reads them via --set-secrets :latest).
set -euo pipefail

PROJECT=storytree-498613
REGION=australia-southeast1
SERVICE=storytree-web-editor
SA="storytree-web-editor-host@${PROJECT}.iam.gserviceaccount.com"
APP_SLUG=storytree-web-cms

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"
cd "$WEB"
echo "==> project=$PROJECT  service=$SERVICE  web=$WEB"

# Runtime SA: commits to GitHub, not Cloud SQL — so it needs NO DB role, only
# Secret Manager read (granted per-secret below). Narrower than the studio's SA.
if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
  echo "==> creating runtime SA"
  gcloud iam service-accounts create storytree-web-editor-host --project "$PROJECT" \
    --display-name "hosted web editor runtime (ADR-0101)"
fi

if [ -f .env ]; then
  for pair in \
    "KEYSTATIC_GITHUB_CLIENT_ID:storytree-web-editor-gh-client-id" \
    "KEYSTATIC_GITHUB_CLIENT_SECRET:storytree-web-editor-gh-client-secret" \
    "KEYSTATIC_SECRET:storytree-web-editor-keystatic-secret"; do
    k="${pair%%:*}"; name="${pair##*:}"
    val="$(grep -E "^${k}=" .env | head -1 | cut -d= -f2- | sed 's/[ \t]*#.*$//' | tr -d '\r\n')"
    [ -n "$val" ] || { echo "!! ${k} missing in web/.env"; exit 1; }
    if gcloud secrets describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
      printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT" >/dev/null
    else
      printf '%s' "$val" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project "$PROJECT" >/dev/null
    fi
    gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:${SA}" \
      --role=roles/secretmanager.secretAccessor --project "$PROJECT" >/dev/null
  done
  echo "==> secrets synced from web/.env"
else
  echo "==> web/.env absent — assuming the three KEYSTATIC secrets already exist in Secret Manager"
fi

# Build the Dockerfile via Cloud Build and deploy. Public (GitHub is the gate),
# no IAP, scale-to-zero. The image is the editor target (PUBLIC_STORYTREE_WEB_EDITOR=github).
echo "==> deploying (Cloud Build image, ~2-4 min)…"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --project "$PROJECT" \
  --service-account "$SA" --allow-unauthenticated \
  --set-secrets "KEYSTATIC_GITHUB_CLIENT_ID=storytree-web-editor-gh-client-id:latest,KEYSTATIC_GITHUB_CLIENT_SECRET=storytree-web-editor-gh-client-secret:latest,KEYSTATIC_SECRET=storytree-web-editor-keystatic-secret:latest" \
  --set-env-vars "PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=${APP_SLUG},HOST=0.0.0.0" \
  --memory 1Gi --max-instances 2

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
echo ""
echo "DEPLOYED: $URL"
echo "Confirm this is a Callback URL on the App (github.com/settings/apps/${APP_SLUG}):"
echo "  ${URL}/api/keystatic/github/oauth/callback"
