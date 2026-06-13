---
id: "container-image"
tier: capability
story: studio-hosting
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

- Multi-stage: build (`pnpm install --frozen-lockfile` + `pnpm -r build`) → runtime (node +
  tsx-run server, the workspace layout preserved so module-relative path resolution holds).
- The image carries docs/ + stories/ as a SNAPSHOT (ADR-0042 d.1); `/api/health`'s code stamp
  is absent in-container (no .git) — acceptable, the deploy revision is the stamp.
- NO credentials in the image: Cloud SQL auth is the runtime service account's ADC through the
  Node connector (ADR-0021's posture, SA principal).
- `.dockerignore` keeps node_modules, data scratch, and worktrees out of the context.

## Contracts (2)

1. **`image-self-contained`** — the container needs only env to serve
   - **asserts —** a `docker run` with PORT + store env answers `/` and `/api/health` with no
     repo mount and no key file.
2. **`no-secrets-in-image`** — the image carries no credential material
   - **asserts —** image layers hold no key file / token; auth is ambient at runtime.
