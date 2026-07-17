# Hosted website content editor — deploy runbook (ADR-0101)

The login-protected Keystatic editor for **storytree-web**: Cloud Run (`storytree-web-editor`,
australia-southeast1), **public** (no IAP — GitHub is the gate), keyless runtime SA. The owner signs
in with GitHub (editing gated to repo write-collaborators); saving commits to storytree-web `main`,
which fires the existing here.now deploy. Mirrors the studio ([infra/studio-cloud.md](studio-cloud.md),
ADR-0042) **minus IAP and the DB**. The public here.now site is untouched and byte-identical — the
editor is a second build target (`PUBLIC_STORYTREE_WEB_EDITOR=github`) of the same repo.

Runs as the owner (`gcloud auth`, project `storytree-498613`). The shared APIs (run, cloudbuild,
artifactregistry, secretmanager) were already enabled by the studio.

## 1. One-time: the Keystatic GitHub App (owner, in a browser)

The App **`storytree-web-cms`** is the login + the commit identity. To (re)create it: in `web/`, run
`npm run dev:editor`, open `/keystatic`, click **"create a GitHub App"** → leave *Deployed App URL*
and *organization* blank → install on `storytree-ai/storytree-web` with **write** access. Keystatic writes
four vars into `web/.env` (gitignored, never committed):
`PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` (public) + `KEYSTATIC_GITHUB_CLIENT_ID` / `_CLIENT_SECRET` /
`KEYSTATIC_SECRET` (→ Secret Manager). The repo is/will be public, so the three secrets NEVER go in it.

## 2. Deploy

```bash
# Git Bash (not WSL), from the repo root; web/.env present on the first run.
bash infra/deploy-web-editor.sh
```

It creates the runtime SA (`storytree-web-editor-host`, Secret-Manager-read only — no DB), syncs the
three secrets from `web/.env`, builds the editor image (Cloud Build, from `web/Dockerfile`), and
deploys the public service. Prints the service URL.

## 3. One-time: register the production callback URL (owner, in a browser)

GitHub OAuth only redirects to **registered** callback URLs, so after the first deploy add the
service URL's callback at `github.com/settings/apps/storytree-web-cms` → **Callback URL** →
*Add callback URL* (keep the localhost one for local editing), then **Save changes**:

```
https://<service-url>/api/keystatic/github/oauth/callback
```

Then visit `https://<service-url>/keystatic`, sign in with GitHub, edit, Save — the change commits to
`main` and here.now redeploys.

## Two gotchas (both already fixed in the build / captured here)

- **`redirect_uri` came out as `https://localhost/...`.** Astro 5 only trusts the proxied `Host`
  header if it is in `security.allowedDomains`, else it falls back to `localhost` — which broke the
  OAuth redirect. Fixed in `web/astro.config.mjs`: the editor target sets
  `security: { allowedDomains: [{ hostname: '**.run.app' }] }`. A custom domain would add an entry.
- **Two service URLs.** Cloud Run assigns both `…-<projectnum>.<region>.run.app` and the legacy
  `…-<hash>-<regioncode>.a.run.app`; both work, but the `redirect_uri` follows whichever host you
  visit, so register a callback for the URL you actually use (or both).

## Costs

Cloud Run scale-to-zero (~$0 idle, pennies active); Cloud Build minutes per deploy; no load balancer
(no IAP), no DB. Negligible standing footprint.

## CD on merge — now wired (this script is the break-glass path)

Editor-affecting merges to storytree-web `main` now redeploy automatically — see
[web-editor-cd.md](web-editor-cd.md) (`deploy-editor.yml` in storytree-web + `infra/web-editor-cd.tf`,
keyless WIF, mirroring the studio's ADR-0046). After the **one-time** owner IAM apply documented
there, this manual script stays valid only as the **break-glass** path: the first stand-up (it creates
the runtime SA + syncs the three secrets from `web/.env`), deploying a non-`main` commit, or any deploy
while CD is paused. (Pure content edits saved from the editor only need here.now, never a redeploy.)
