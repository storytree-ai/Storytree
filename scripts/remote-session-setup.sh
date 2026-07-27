#!/usr/bin/env bash
# Remote-pod credential bootstrap (Claude Code on the web) — SessionStart hook.
#
# Cloud pods have no gcloud auth, no ADC, and no ~/.storytree/secrets.json. The Anthropic
# environment config carries exactly ONE secret — GOOGLE_APPLICATION_CREDENTIALS_JSON, the
# storytree-remote-dev service-account key — and everything else (the Claude OAuth token) is
# fetched fresh from Google Secret Manager here, every session. Secrets must NOT be written by
# the environment *setup script*: its filesystem output is snapshot-cached for ~a week, while a
# SessionStart hook runs fresh each session (so rotating the token = adding a secret version).
#
# No-op (exit 0) outside pods (CLAUDE_CODE_REMOTE != true) and on pods without the key env var,
# so laptops and credential-less pods boot untouched.
#
# RETIRED IDENTITY (ADR-0254 D4): the owner disabled storytree-remote-dev on 2026-07-27, so on a pod
# whose environment config still carries the stale key this bootstrap is EXPECTED to fail at step 4 —
# a disabled SA mints no token, so Secret Manager is unreachable. That is now a normal steady state,
# not an incident, and it degrades to the same no-op as an absent key. Kept rather than deleted so
# the mechanism is ready if an identity is ever re-provisioned (remote sessions are offline-only
# regardless — ADR-0250 D1).

set -u

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

warn() { echo "[remote-session-setup] $*" >&2; }

if [ -z "${GOOGLE_APPLICATION_CREDENTIALS_JSON:-}" ]; then
  warn "WARNING: GOOGLE_APPLICATION_CREDENTIALS_JSON is unset; skipping credential bootstrap (live --pg / SDK-leaf paths unavailable this session)"
  exit 0
fi

PROJECT_ID="storytree-498613"
SECRET_NAME="claude-code-oauth-token"
# The SA's IAM *Postgres* username: the service-account email minus ".gserviceaccount.com"
# (packages/store/src/connection.ts passes STORYTREE_DB_USER straight through as the pg user).
DB_USER="storytree-remote-dev@storytree-498613.iam"

umask 077

# 1) Write the key to the well-known ADC path. google-auth-library — and therefore the Cloud SQL
#    connector's IAM auth — finds it there with NO env var, which matters because hook env does
#    not propagate to the shells where later commands run.
ADC_FILE="${HOME}/.config/gcloud/application_default_credentials.json"
mkdir -p "$(dirname "${ADC_FILE}")"
printf '%s' "${GOOGLE_APPLICATION_CREDENTIALS_JSON}" > "${ADC_FILE}"

# 2) The pod setup script installs the SDK to ~/google-cloud-sdk but only wires PATH via
#    ~/.bashrc, which this non-interactive hook never sources.
if [ -d "${HOME}/google-cloud-sdk/bin" ]; then
  PATH="${HOME}/google-cloud-sdk/bin:${PATH}"
fi

# 3) Activate gcloud on the same key so `pnpm db:up` / `db:status` work in later shells.
if command -v gcloud >/dev/null 2>&1; then
  gcloud auth activate-service-account --key-file="${ADC_FILE}" --quiet >/dev/null 2>&1 \
    || warn "WARNING: gcloud activate-service-account failed; pnpm db:up/db:status may not work"
  gcloud config set project "${PROJECT_ID}" --quiet >/dev/null 2>&1 || true
fi

# 4) Fetch the Claude OAuth token from Secret Manager — fresh every session, never cached in the
#    pod snapshot. gcloud when present; otherwise a zero-dependency Node fallback (built-in
#    crypto signs the SA JWT, built-in fetch talks to the REST API).
# stderr is dropped for the same reason the gcloud branch above drops it: since ADR-0254 D4 this call
# is EXPECTED to fail, and a raw Node/OpenSSL stack trace on every remote boot reads as a crash. The
# caller names the secret and the operation in a one-line warning, which is the actionable part.
fetch_secret_rest() {
  ST_ADC_FILE="${ADC_FILE}" ST_PROJECT="${PROJECT_ID}" ST_SECRET="${SECRET_NAME}" \
    node --input-type=module -e '
      import { readFileSync } from "node:fs";
      import { createSign } from "node:crypto";
      const key = JSON.parse(readFileSync(process.env.ST_ADC_FILE, "utf8"));
      const now = Math.floor(Date.now() / 1000);
      const b64url = (s) => Buffer.from(s).toString("base64url");
      const unsigned =
        b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
        b64url(JSON.stringify({
          iss: key.client_email,
          scope: "https://www.googleapis.com/auth/cloud-platform",
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 600,
        }));
      const jwt = unsigned + "." + createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange failed: HTTP ${tokenRes.status}`);
      const { access_token } = await tokenRes.json();
      const secretRes = await fetch(
        `https://secretmanager.googleapis.com/v1/projects/${process.env.ST_PROJECT}/secrets/${process.env.ST_SECRET}/versions/latest:access`,
        { headers: { authorization: `Bearer ${access_token}` } },
      );
      if (!secretRes.ok) throw new Error(`secret access failed: HTTP ${secretRes.status}`);
      const { payload } = await secretRes.json();
      process.stdout.write(Buffer.from(payload.data, "base64").toString("utf8"));
    ' 2>/dev/null
}

# A credential that no longer mints a token is equivalent to no credential at all — the case the
# early `-z` check above already handles by no-opping. Since ADR-0254 D4 retired the identity that
# IS the steady state, so it must degrade the same way: warn and exit 0. A SessionStart hook that
# exits non-zero would put an ERROR on every remote session for a condition that is expected and
# that the reader cannot fix.
bootstrap_unavailable() {
  warn "WARNING: $* — skipping credential bootstrap (live --pg / SDK-leaf paths unavailable this session)"
  warn "Expected since storytree-remote-dev was retired (ADR-0254 D4); remote sessions are offline-only anyway (ADR-0250 D1)"
  exit 0
}

OAUTH_TOKEN=""
if command -v gcloud >/dev/null 2>&1; then
  OAUTH_TOKEN="$(gcloud secrets versions access latest --secret="${SECRET_NAME}" --project="${PROJECT_ID}" 2>/dev/null || true)"
fi
if [ -z "${OAUTH_TOKEN}" ]; then
  OAUTH_TOKEN="$(fetch_secret_rest)" || bootstrap_unavailable "could not fetch secret ${SECRET_NAME} from Secret Manager"
fi
if [ -z "${OAUTH_TOKEN}" ]; then
  bootstrap_unavailable "secret ${SECRET_NAME} came back empty"
fi

# 5) Write ~/.storytree/secrets.json in the exact shape packages/cli/src/secrets.ts hydrates
#    (CLAUDE_CODE_OAUTH_TOKEN + STORYTREE_DB_USER; env always wins over the file). The token
#    travels via stdin so it never appears in argv or in any process listing.
mkdir -p "${HOME}/.storytree"
printf '%s' "${OAUTH_TOKEN}" | ST_DB_USER="${DB_USER}" node -e '
  const { readFileSync, writeFileSync } = require("node:fs");
  const { homedir } = require("node:os");
  const token = readFileSync(0, "utf8").trim();
  writeFileSync(
    `${homedir()}/.storytree/secrets.json`,
    JSON.stringify({ CLAUDE_CODE_OAUTH_TOKEN: token, STORYTREE_DB_USER: process.env.ST_DB_USER }, null, 2) + "\n",
    { mode: 0o600 },
  );
'

warn "ok: ADC written, gcloud activated (if present), secrets.json hydrated (db user: ${DB_USER})"
exit 0
