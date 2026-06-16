---
status: accepted
decided: 2026-06-16
---
# ADR-0063: db-control over the Cloud SQL Admin REST API (retire the gcloud subprocess)

## Status

accepted (2026-06-16) — authored and landed in the same workstream by the session that investigated
the gcloud "credential-lock cascade" on the Windows dev box; the owner directed "wire it now, ADR
first". The substitution shipped incrementally and is now complete: the typed client (unit 1,
[PR #164](https://github.com/HuaMick/Storytree/pull/164)), the production factory + exports (2a,
[PR #166](https://github.com/HuaMick/Storytree/pull/166)), the build preflight `ensureLiveDb` (2b,
[PR #167](https://github.com/HuaMick/Storytree/pull/167)), the `db:*` scripts (2c,
[PR #168](https://github.com/HuaMick/Storytree/pull/168)), and the studio `/api/db/*` handlers (2d,
[PR #170](https://github.com/HuaMick/Storytree/pull/170)). Every db-control surface now runs on the
REST client **by default** — the accept condition. The gcloud fallback remains a transition guard;
the one open follow-up is to drop it (and the gcloud helpers) once REST has proven itself in daily use.

## Context

Every db-control surface shells out to the bundled-Python `gcloud` CLI:

- `pnpm db:status` / `db:up` / `db:down` — `gcloud sql instances describe|patch` (root `package.json`
  + `packages/cli/src/db-control.ts` `startLiveDb`).
- the `--real`/`--live` build preflight `ensureLiveDb` (`packages/cli/src/db-control.ts`).
- the studio `/api/db/start` + `/api/db/status` handlers (`apps/studio/server/dbControl.ts`).

On the Windows dev box each `gcloud` invocation costs **~2.1s of Python interpreter cold-start**
(measured: even a no-network `gcloud config get-value account`). That cost is harmless in isolation —
6 concurrent calls parallelise fine (~3.3s) — but when `gcloud` launches **overlap with host memory
pressure** (this box OOMs under `pnpm gate`/`-r test`), ~10 memory-heavy Python interpreters plus
Windows Defender real-time scans plus paging make the lock-holder for the SQLite credential stores
(`credentials.db`, `access_tokens.db`) crawl, and every other `gcloud` call blocks behind it in the
credential-load phase. Forensics in `%APPDATA%\gcloud\logs\` captured an **18-minute** single
invocation whose entire gap sat *before any network call*, in credential loading. The processes are
alive (I/O-wait), drain in order, and recover — a slow cascade, not a dead network.

The hosted studio already proved the cure: `apps/studio/server/dbWake.ts` (ADR-0049, `hosted-db-wake`)
controls the *same* instance over the **Cloud SQL Admin REST API** with a keyless token (the runtime
SA's metadata token on Cloud Run), **no gcloud, no Python**. Measured here: a REST `describe` with an
ambient ADC token is **~190ms warm / 563ms cold** vs gcloud's ~2.1s, and — decisively — it spawns no
Python interpreter and touches no SQLite credential store, so it is *structurally* immune to the
cascade rather than merely faster. This stays entirely within the keyless ADC/IAM posture of
ADR-0021 (no key files, ambient ADC locally / metadata SA on Cloud Run).

## Decision

Adopt a **typed Cloud SQL Admin REST client as the primary db-control path**, retiring the gcloud
subprocess on the hot path:

1. **The client (landed, unit 1).** `packages/store/src/cloud-sql-admin.ts` —
   `createCloudSqlAdmin(deps)` over injected token-fetch + HTTP (mirroring `dbWake.ts`'s pure core),
   with `describe()` (state + activation policy) and `setActivationPolicy(ALWAYS|NEVER)`. Pure,
   offline-tested; built through the prove-it-gate (ADR-0057 spec-borne node).
2. **Production wiring.** Add a factory that supplies the real I/O: an `ADC` token via
   `google-auth-library` (`GoogleAuth().getAccessToken()` — no subprocess) locally, the runtime SA
   metadata token on Cloud Run (the `dbWake.ts` path), and a `request` over global `fetch` (Node 24).
   Export the client + factory from `packages/store/src/index.ts`.
3. **Rewire the consumers** onto the client: `db:status` → `describe()`; `db:up`/`db:down` →
   `setActivationPolicy("ALWAYS"|"NEVER")`; the `ensureLiveDb` preflight's `start` effect; and the
   studio `/api/db/*` handlers. The `db:*` npm scripts dispatch a tiny `tsx` entry rather than
   `gcloud` directly. `db:up` keeps polling the instance until it accepts connections (the existing
   probe loop), preserving gcloud's blocking-patch semantics.
4. **Keep gcloud as an explicit, last-resort fallback initially** — a clearly-labelled path taken
   only when the REST/ADC path errors — so an ADC hiccup degrades rather than breaks. Remove the
   fallback once the REST path has proven itself in daily use.

## Consequences

**Good.** Removes the cascade *substrate* (no Python, no SQLite credential lock) rather than just
mitigating it; ~10× faster `status`/`up`/`down`; unifies local + hosted db-control on one typed
client, deduplicating `dbWake.ts`'s ad-hoc PATCH; stays keyless (ADR-0021), no new secrets or IAM.

**Bad / costs.** Adds a direct `google-auth-library` dependency to `@storytree/store` (it is already
a transitive dep of the Cloud SQL connector; this makes it explicit). The **thin I/O shell** (real
`fetch` + ADC token mint) is not offline-unit-testable — exactly as `dbWake.ts`'s
`createMetadataDbWaker`/`httpPatch` carry no `node:test`; coverage is the pure core + integration, not
the shell. That is a real **inner-loop envelope gap** (the provable decision logic goes through the
gate as edit-existing nodes; the I/O shell + `package.json` script rewiring are outer-loop), surfaced
here per the inner-loop-for-everything steer rather than silently absorbed. The REST error surface
differs from gcloud's exit codes (handled by the client's trimmed-body errors). The temporary gcloud
fallback adds complexity until it is removed.

## References

- [ADR-0049](0049-hosted-studio-self-wakes-its-db.md) — hosted db-wake over Cloud SQL Admin REST; the
  proven keyless pattern this generalizes from hosted-only to all db-control.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless ADC/IAM posture (no key
  files); unchanged.
- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) — Cloud SQL instance + idle-stop/cost backstop
  (the `activationPolicy` this client toggles).
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — spec-borne
  inner-loop nodes; how unit 1 was built and how the provable wiring units will be.
- Code: `packages/store/src/cloud-sql-admin.ts` (unit 1, PR #164), `apps/studio/server/dbWake.ts` (the
  precedent), `packages/cli/src/db-control.ts`, `apps/studio/server/dbControl.ts`, root `package.json`
  `db:*` scripts.
