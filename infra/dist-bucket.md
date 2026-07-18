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

## Owner step (one-time, BLOCKING)

Creating a bucket and a public IAM binding needs Owner-level ADC an agent session lacks, so this is
owner-run (the [`studio-cd.md`](studio-cd.md) precedent):

```bash
cd infra && terraform init && terraform apply
```

Then publish the script and verify it is fetchable **with no credentials**:

```bash
gsutil cp infra/install.ps1 gs://storytree-dist/install.ps1
curl -sSf https://storage.googleapis.com/storytree-dist/install.ps1 | head -1
```

Once that URL answers, the one-liner in [`install.ps1`](install.ps1)'s header and
[`install.md`](install.md)'s Delivery section is live:

```powershell
irm https://storage.googleapis.com/storytree-dist/install.ps1 | iex
```

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

This increment is the **bucket + public read**, so the install script is fetchable pre-auth.
Deliberately **not** included yet:

- **Publish-on-merge automation** (D5's "published by Cloud Build on release"). Today the owner
  uploads with `gsutil cp` after an `install.ps1` change. Automating it needs a publisher SA + WIF
  binding — a second IAM surface, better applied after this small one is verified working.
- **App binaries + the `latest.yml` updater feed.** The binaries do not exist yet: pre-D5 the
  desktop app launches from the provisioned checkout. This lands with the packaged-build work.
