# `storytree-dist` — the public distribution bucket (ADR-0207 D5)

The bucket that serves the explorer-onboarding **install script** — and, once packaged binaries
exist, the **app binaries** and the **electron-updater feed** — as public objects on the existing
GCP project. Terraform: [`dist-bucket.tf`](dist-bucket.tf).

## Why the objects are public

This is an auth-model decision, not a convenience one:

1. **The install script must be fetchable pre-auth.** The dev runs the one-liner *before* they have
   any storytree identity. Anything gated is a chicken-and-egg failure.
2. **Auto-update inherits install's auth model forever.** Public objects keep a day-30 update as
   dumb-simple as a day-0 install. Private GitHub releases would put a permanently-refreshing token
   inside the shipped app.

The binary is **not** the secret. What the private repo and IAP actually protect — the tree, the
library, live verdicts — lives in the checkout and the live store, never in the Electron package.

If gating is ever wanted, the documented upgrade path is serving downloads through the
IAP-protected Cloud Run using the same Google identity as D4 — **never bucket IAM**, which would
recreate exactly the runtime-token problem this decision exists to avoid.

## Status — LIVE ✅ (applied + published 2026-07-18)

The bucket is applied and `install.ps1` is published. Verified live: `uniform_bucket_level_access:
True`, `versioning: True`, `STANDARD`, `public_access_prevention: inherited`, `allUsers →
roles/storage.objectViewer`; an anonymous `curl` returns **HTTP 200, 11041 bytes**, and `irm` returns a
`System.String` (so `| iex` works). The one-liner is real:

```powershell
irm https://storage.googleapis.com/storytree-dist/install.ps1 | iex
```

## Publishing an updated script

⚠️ **Use `gcloud storage`, not `gsutil`.** `gsutil` is the legacy standalone tool with its own
credential path (`.boto`) — it does **not** pick up the ADC that `terraform apply` uses, and fails with
`ServiceException: 401 Anonymous caller does not have storage.objects.create access` even when
`gcloud auth list` shows you signed in. `gcloud storage` uses gcloud's own auth.

```powershell
gcloud storage cp infra/install.ps1 gs://storytree-dist/install.ps1

# verify anonymously (PowerShell — `head` is not a cmdlet):
curl.exe -sSf https://storage.googleapis.com/storytree-dist/install.ps1 | Select-Object -First 1
# or, testing the actual delivery path without executing it:
(irm https://storage.googleapis.com/storytree-dist/install.ps1).Split([char]10)[0]
```

Objects land as `application/octet-stream`. That is fine for `irm | iex` (proven above) but means a
browser downloads rather than displays the script; pass `--content-type=text/plain` if you'd rather it
render. Versioning is on, so an overwrite is recoverable.

**This is a manual step today** — a script edited in the repo does not reach the bucket until someone
re-runs the copy. `pnpm gate`'s **`check:dist-drift`** guards against forgetting: it fetches the
published object and WARNs when it differs from `infra/install.ps1` (naming the republish command),
SKIPs when offline, and never blocks. So a stale publish is visible before a push rather than
discovered by a dev running an old installer. Fully automating the publish (D5's "published by Cloud
Build on release") is still the open follow-on below.

## How it was first applied (one-time, historical)

Creating a bucket and a public IAM binding needs Owner-level ADC an agent session lacks, so it was
owner-run (the [`studio-cd.md`](studio-cd.md) precedent):

```powershell
cd infra ; terraform init ; terraform apply
```

Two things worth remembering from that first apply, because both cost real time:

- **A single unrelated resource failing takes the whole module down.** The apply errored on
  `google_cloud_run_v2_service_iam_member.web_editor_deployer_run_admin` (a 404 — see
  [`web-editor-cd.md`](web-editor-cd.md)) *after* it had already created this bucket. If an apply dies,
  check what actually got created before assuming nothing did: `terraform plan` reporting **"No
  changes"** is the fastest way to find out.
- **`gsutil` is not `gcloud storage`** — see the 401 note above.

## What the config pins

| Setting | Value | Why it matters |
|---|---|---|
| `name` | `storytree-dist` | The installer's advertised URL is built from it (drift-tested). |
| IAM | `allUsers` → `roles/storage.objectViewer` | The D5 pre-auth fetch. Anonymous **GET on objects only** — no listing of config, no write. |
| `public_access_prevention` | `inherited` | `enforced` blocks the `allUsers` binding and silently turns onboarding into a 403. The one setting whose wrong value breaks everything quietly. |
| `uniform_bucket_level_access` | `true` | One bucket-level binding is the whole access story; no per-object ACL can diverge. |
| `versioning` | enabled | These artifacts are what a fresh machine *executes* — a bad script must be rollback-able, not merely overwritable. |
| `force_destroy` | `false` | A `terraform destroy` can't yank the published surface out from under a mid-install dev without an explicit flip. |

`packages/cli/src/dist-bucket-infra.test.ts` asserts each of these structurally, plus that
`allUsers` never holds a write/admin role and that the bucket name matches the URL `install.ps1`
advertises (the cross-artifact no-drift tie).

## Scope + follow-ons

The bucket + public read are **done and live**. Still open:

- **Publish-on-merge automation** (D5's "published by Cloud Build on release"). Today re-publishing is
  a manual `gcloud storage cp` after any `install.ps1` change, so the published copy can silently
  drift from the repo — the one real weakness of the current state. Automating it needs a publisher SA
  + WIF binding; that was deliberately deferred until the bucket existed and was verified, which it now
  is, so this is **unblocked**.
- **App binaries + the `latest.yml` updater feed.** The binaries do not exist yet: pre-D5 the
  desktop app launches from the provisioned checkout. This lands with the packaged-build work.
