# Hosted studio — deploy + circle onboarding runbook (ADR-0042)

The trusted-circle studio: Cloud Run (`storytree-studio`, australia-southeast1) behind the
**direct Cloud Run–IAP integration** (`--iap` — no load balancer, no domain, no LB cost),
serving the guarded studio (`apps/studio/server/serve.ts`: guests read + comment, admins edit
assets, db control off). First stand-up was **imperative via this runbook** (2026-06-14);
Terraform codification completes the `cloud-run-iap` capability (stories/studio-cloud).

Everything below runs as the owner (`gcloud auth login`, project `storytree-498613`).

## 1. One-time project setup (done 2026-06-14)

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iap.googleapis.com --project storytree-498613
gcloud artifacts repositories create storytree --repository-format=docker --location=australia-southeast1 --project=storytree-498613
gcloud iam service-accounts create storytree-studio-host --project=storytree-498613 --display-name="hosted studio runtime (ADR-0042)"
gcloud projects add-iam-policy-binding storytree-498613 --member="serviceAccount:storytree-studio-host@storytree-498613.iam.gserviceaccount.com" --role="roles/cloudsql.client" --condition=None
gcloud projects add-iam-policy-binding storytree-498613 --member="serviceAccount:storytree-studio-host@storytree-498613.iam.gserviceaccount.com" --role="roles/cloudsql.instanceUser" --condition=None
gcloud sql users create "storytree-studio-host@storytree-498613.iam" --instance=storytree-pg --type=cloud_iam_service_account --project=storytree-498613
```

## 2. DB grants (idempotent — re-run after schema changes)

```powershell
$env:STORYTREE_DB_USER='hua.mick@gmail.com'; npx tsx infra/apply-studio-host-grants.ts
```

(The SQL itself: `infra/studio-host-grants.sql`. The role is the SERVER's ceiling; guest
scoping is the API layer's job.)

## 3. Build the image (every deploy)

> **Most deploys are now automatic.** A studio-affecting merge to `main` redeploys via CD
> (`infra/studio-cd.md`, ADR-0046). §3–§4 below are the **break-glass** path: the first stand-up,
> deploying a non-`main` commit, or any deploy while CD is paused.

From the repo root on the commit you want to serve (the image snapshots docs/ + stories/):

```powershell
$tag = git rev-parse --short HEAD
gcloud builds submit --config infra/studio-cloudbuild.yaml --substitutions=_TAG=$tag --project=storytree-498613 .
```

## 4. Deploy

```powershell
gcloud run deploy storytree-studio `
  --image "australia-southeast1-docker.pkg.dev/storytree-498613/storytree/studio:$tag" `
  --region australia-southeast1 --project storytree-498613 `
  --service-account storytree-studio-host@storytree-498613.iam.gserviceaccount.com `
  --set-env-vars "STORYTREE_STUDIO_STORE=pg,STORYTREE_DB_USER=storytree-studio-host@storytree-498613.iam,STORYTREE_STUDIO_ADMINS=hua.mick@gmail.com" `
  --memory 1Gi --max-instances 2 `
  --no-allow-unauthenticated --iap
```

`--iap` is the direct integration: it provisions the IAP service agent and wires it as the
only invoker. The app additionally fail-closes (401) on any API request without the IAP
identity header — defense in depth (ADR-0042 d.2).

## 4b. One-time, console-only: the IAP OAuth client (BLOCKING until done)

`storytree-498613` has **no Organization**, so IAP cannot use a Google-managed OAuth client —
until a custom one is wired, EVERY visit answers `502` / "Empty Google Account OAuth client
ID(s)/secret(s)" (the door is locked shut, for invitees too). The deprecated `oauth-brands`
API refuses org-less projects and consent-screen creation has no public API, so this is
owner-in-console, once (~3 minutes):

1. **Consent screen:** console → APIs & Services → OAuth consent screen
   (Google Auth Platform) → configure: app name `storytree studio`, your support email,
   audience **External**, then **Publish** the app (no sensitive scopes — no verification
   needed; left in Testing, only explicit test users could ever sign in).
2. **Client:** console → APIs & Services → Credentials → Create credentials →
   **OAuth client ID** → Web application, name `storytree-studio-iap`. Copy the client ID,
   then EDIT the client and add the redirect URI
   `https://iap.googleapis.com/v1/oauth/clientIds/<CLIENT_ID>:handleRedirect` and save.
3. **Wire it to the service:** Cloud Run console → `storytree-studio` → Security →
   Identity-Aware Proxy → configure with that client (the docs:
   cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run#custom-oauth-client).

After this, a granted account landing on the URL gets the Google sign-in and then the studio.

## Smoke-testing behind the wall (how 2026-06-14 was verified)

The app + DB path can be verified without the OAuth client: temporarily `--no-iap` (the
service stays `--no-allow-unauthenticated` — IAM-locked, never public), grant yourself
`roles/run.invoker`, then curl with `Authorization: Bearer $(gcloud auth print-identity-token)`
plus a hand-set `x-goog-authenticated-user-email: accounts.google.com:<you>` header (only the
sole IAM invoker can do this — exactly the spoof the IAP-only ingress invariant prevents in
real serving). Verified: `/api/health` → `{store: pg, db: ok}` (keyless SA → Cloud SQL),
`/api/tree` → 6 stories + live presence sessions, API without the header → 401 (the app's own
fail-closed wall), static `/` → 200. Re-enable with `--iap` after.

## 4c. Invite emails (studio-members `invite-notify`) — optional but recommended

When an admin invites a member in the **Members** panel, the studio emails the invitee the studio
link so they actually learn they have access (without this, the invite only writes an `invited` row
and you'd have to tell them out-of-band). Sending is **best-effort**: a mail failure never blocks the
invite — the panel just shows `Invited …, but the email didn't send (…)`. Off until configured (the
panel then shows `Invited …. email notifications are off …`).

Sender = a Gmail account + a **Google App Password** (not the account password; needs 2-Step
Verification on). Deliverability to a small known circle (Google→Google) is fine; recipients can
mark "not spam" once. The app strips spaces from the password, so paste it as shown.

```powershell
# 1. Enable Secret Manager (one-time) + create the App Password at myaccount.google.com →
#    Security → 2-Step Verification → App passwords (pick "Mail"). Then store it (no trailing newline):
gcloud services enable secretmanager.googleapis.com --project storytree-498613
[System.IO.File]::WriteAllText("$env:TEMP\smtp-pass.txt", "<16-char app password>")
gcloud secrets create storytree-studio-smtp-pass --data-file="$env:TEMP\smtp-pass.txt" --project=storytree-498613
Remove-Item "$env:TEMP\smtp-pass.txt"

# 2. Let the runtime SA read it
gcloud secrets add-iam-policy-binding storytree-studio-smtp-pass `
  --member="serviceAccount:storytree-studio-host@storytree-498613.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor" --project=storytree-498613

# 3. The public studio URL the email links to (stable once the service exists)
gcloud run services describe storytree-studio --region australia-southeast1 --format="value(status.url)"
```

Then add these to the **§4 deploy** command (env for the non-secret bits, `--set-secrets` for the
password) — e.g. extend the existing flags:

```powershell
  --set-env-vars "STORYTREE_STUDIO_STORE=pg,STORYTREE_DB_USER=storytree-studio-host@storytree-498613.iam,STORYTREE_STUDIO_ADMINS=hua.mick@gmail.com,STORYTREE_STUDIO_SMTP_USER=<your-gmail>,STORYTREE_STUDIO_PUBLIC_URL=<service-url-from-step-3>" `
  --set-secrets "STORYTREE_STUDIO_SMTP_PASS=storytree-studio-smtp-pass:latest" `
```

(`--set-env-vars` REPLACES the var set, so include the existing four alongside the two new ones, as
shown.) Rotate the password by adding a new secret version
(`gcloud secrets versions add storytree-studio-smtp-pass --data-file=…`); `:latest` picks it up on
the next deploy/restart. Optional overrides: `STORYTREE_STUDIO_SMTP_HOST` (default `smtp.gmail.com`),
`STORYTREE_STUDIO_SMTP_PORT` (default `465`), `STORYTREE_STUDIO_SMTP_FROM_NAME` (default
`storytree studio`).

## 5. The circle — grant / revoke / enumerate

```powershell
# grant
gcloud iap web add-iam-policy-binding --project=storytree-498613 --resource-type=cloud-run `
  --service=storytree-studio --region=australia-southeast1 `
  --member="user:dev@example.com" --role="roles/iap.httpsResourceAccessor"

# revoke
gcloud iap web remove-iam-policy-binding --project=storytree-498613 --resource-type=cloud-run `
  --service=storytree-studio --region=australia-southeast1 `
  --member="user:dev@example.com" --role="roles/iap.httpsResourceAccessor"

# enumerate ("who can see this")
gcloud iap web get-iam-policy --project=storytree-498613 --resource-type=cloud-run `
  --service=storytree-studio --region=australia-southeast1
```

Send the dev the service URL (`gcloud run services describe storytree-studio --region
australia-southeast1 --format="value(status.url)"`). They sign in with the granted Google
account and land in the studio — no other setup.

## 6. Wake the DB from the site (ADR-0049) — one-time grant + deploy

The shared Cloud SQL instance idle-stops for cost (ADR-0015). When it's stopped, hosted members hit
the store-unreachable wall — and the old `/api/db/*` Start DB path is off hosted (it needs the
operator's gcloud). ADR-0049 adds a keyless, container-native wake: an **admin** presses "Wake the
database" and the runtime SA (`storytree-studio-host`) PATCHes the Cloud SQL Admin API directly. Two
owner steps turn it on.

**6a. One-time, PRIVILEGED — grant the runtime SA a scoped Cloud SQL role (`infra/studio-db-wake.tf`).**
The Terraform adds a custom role `storytreeStudioDbWake` (exactly `cloudsql.instances.get` +
`cloudsql.instances.update` — narrower than `cloudsql.admin`/`cloudsql.editor`) and binds it to the
runtime SA. Review the IAM surface, then apply (needs your Owner ADC, project `storytree-498613`):

```powershell
cd infra; terraform init; terraform apply   # creates the custom role + the binding
```

Until applied, "Wake the database" answers a clear 502 ("Cloud SQL Admin API 403:
cloudsql.instances.update denied") — it fails loud and safe, never a silent no-op.

**6b. Deploy the new image.** The wake code ships in `apps/studio` + `serve.ts`; redeploy via §3–§4
(no new env vars). Verify on the live site: idle-stop the DB (or wait for the nightly stop), open the
studio as an admin, and the banner shows "Wake the database"; pressing it brings the page back within
~a minute. A member sees the degraded banner with no button.

The wake is **admin-only**: in normal operation by role; while the store is down (membership
unresolvable) by the bootstrap-admin seed (`STORYTREE_STUDIO_ADMINS`). IAP is `allAuthenticatedUsers`
(ADR-0043), so this narrow gate is what keeps a random signed-in account from firing a billable start.

## What the circle sees (set expectations in the invite)

- The story world, library, and docs — live verdict hues, presence wisps, the works.
- They can comment everywhere (attributed to their email — the server stamps it); they can
  edit/resolve only their own comments.
- Artifact editing answers 403 (owner-side). If the DB is idle-stopped, **admins** see a
  "Wake the database" button that brings it back from the site (§6, ADR-0049) and the page
  self-recovers; **members** see the honest degraded banner until an admin (or `pnpm db:up`) wakes it.
- docs/stories are a deploy-time snapshot; library/comments/verdicts/presence are live.

## Costs

Cloud Run scale-to-zero (~$0 idle, pennies active at circle scale); Artifact Registry storage
cents; **no load balancer** (direct IAP). The real cost lever stays the Cloud SQL instance —
circle usage outside owner hours keeps it from idle-stopping (ADR-0015 §5 note in ADR-0042).
