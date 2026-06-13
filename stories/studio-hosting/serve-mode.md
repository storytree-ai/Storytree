---
id: "serve-mode"
tier: capability
story: studio-hosting
title: "The studio serves without Vite — static dist plus the one shared API route table"
outcome: "A standalone node server serves the built SPA and the same /api route table the dev plugin uses — no Vite at runtime, no endpoint defined twice."
status: proposed
proof_mode: integration-test
depends_on: []
---

# The studio serves without Vite — static dist plus the one shared API route table

**Outcome —** A standalone node server (`apps/studio/server/serve.ts`) serves the built SPA and
the same `/api/*` route table the dev plugin uses — no Vite at runtime, no endpoint defined
twice.

## Guidance

- The dispatch that lived inline in `devApi.ts`'s `configureServer` is extracted to
  `server/apiRouter.ts` (`handleApiRequest`); the Vite plugin and `serve.ts` both call it. The
  central error mapping (HttpError / pg-connection-503 / 500) moves with it.
- Static serving is hand-rolled `node:http` (the house no-extra-deps posture): a content-type
  map, a path-traversal guard, `index.html` at `/` (hash routing means the SPA needs no
  path-pattern fallback). `PORT` env (Cloud Run's contract), `8080` default.
- Repo paths (docs/, stories/, dist/) resolve from the module location, not from CWD — the
  container preserves the workspace layout.
- The code-stamp probe and db control remain dev-server concerns; serve mode omits the stamp
  when git is absent (the probe already answers null) and the policy layer refuses `/api/db/*`
  (see `guest-scope`).

## Contracts (3)

1. **`one-route-table`** — dev and serve dispatch through the same module
   - **asserts —** `devApi.ts` holds no route branching of its own; `serve.ts` mounts
     `handleApiRequest`; the dev behaviour is unchanged (vitest suite green without edits to the
     existing integration tests' expectations).
2. **`static-spa-serving`** — dist/ serves with a traversal guard
   - **asserts —** `/` answers index.html; an asset path answers its file with a sane
     content-type; `..` traversal and absolute-path tricks answer 404; unknown non-API paths
     fall back to index.html (hash routing).
3. **`port-and-paths-from-env`** — the server binds `PORT` and resolves repo paths off its own
   location
   - **asserts —** the listener honours `PORT`; docs/stories resolve when CWD differs from the
     studio root.
