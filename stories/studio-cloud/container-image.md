---
id: "container-image"
tier: capability
story: studio-cloud
title: "The studio builds into a runnable container image"
outcome: "One image carries dist/, the server, and the docs/stories snapshot; it runs anywhere with only env + ambient credentials — no key file baked in."
status: proposed
proof_mode: integration-test
depends_on: [serve-mode]
---

# The studio builds into a runnable container image

**Outcome —** One image carries `dist/`, the server, and the docs/stories snapshot; it runs
anywhere with only env + ambient credentials — no key file baked in.

## Guidance

- SINGLE stage, deliberately (`apps/studio/Dockerfile`) — pnpm's symlinked `node_modules` does
  not survive a cross-stage COPY cleanly, and the demo service does not need a slim image. The
  install is filtered to studio's workspace closure (`--filter studio...`) so desktop's native
  deps never gate this image. *(This bullet said "multi-stage" from 2026-06-13 until ADR-0544;
  the implementation was never multi-stage.)*
- The image carries docs/ + stories/ as a SNAPSHOT (ADR-0042 d.1); `/api/health`'s code stamp
  is absent in-container (no .git) — acceptable, the deploy revision is the stamp.
- NO credentials in the image: Cloud SQL auth is the runtime service account's ADC through the
  Node connector (ADR-0021's posture, SA principal).
- ⚠ **THE CONTEXT FILTER IS `.gcloudignore`, NOT `.dockerignore`.** There is no `.dockerignore`
  and none is wanted — the documented build path is `gcloud builds submit`, which filters by
  `.gcloudignore`. That file BYPASSES `.gitignore` by design, so a credential-shaped path is
  only kept out of a published image if it is listed there explicitly. Keep its "Env / secrets"
  block in step with `.gitignore`'s. *(This bullet claimed a `.dockerignore` was doing this job
  from 2026-06-13 until ADR-0544. No such file ever existed.)*
- ⚠ **DO NOT PROPOSE PROVING THIS WITH A LOCAL `docker run`.** Contract 1's assertion named that
  method until ADR-0544, which imported a Docker-daemon dependency onto the gate every branch
  runs, for no gain: the deploy pipeline already builds this exact image from this exact
  Dockerfile on every studio-affecting merge, and exercises it harder and more often than a
  local run would. The fork was considered and closed — see ADR-0544 before re-opening it.

## Contracts (2)

1. **`image-self-contained`** — the container needs only env to serve
   - **asserts —** the built image serves `/` and `/api/health` with no repo mount and no key
     file, given only PORT + store env — exercised on every studio-affecting merge by
     `.github/workflows/deploy-studio.yml`, which builds this image and then confirms the new
     revision is Ready and holds 100% of traffic.
2. **`no-secrets-in-image`** — the image carries no credential material
   - **asserts —** every "Env / secrets" entry in `.gitignore` is mirrored in `.gcloudignore`,
     which is the only filter standing between a working tree and the Dockerfile's `COPY . .`.
     Runtime auth is ambient (the service account's ADC), so nothing needs baking in.
