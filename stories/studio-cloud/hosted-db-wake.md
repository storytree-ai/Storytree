---
id: "hosted-db-wake"
tier: capability
story: studio-cloud
title: "The hosted studio wakes its own idle-stopped DB"
outcome: "When the shared Cloud SQL instance is idle-stopped, an admin presses one button in the hosted studio and the DB comes back — keyless, from the container, with no gcloud and no laptop — and the page self-recovers; non-admins are refused, and any authenticated user is kept off the billable start."
status: proposed
proof_mode: integration-test
depends_on: [serve-mode, guest-scope]
---

# The hosted studio wakes its own idle-stopped DB

**Outcome —** When the shared Cloud SQL instance is idle-stopped, an admin presses one button in the
hosted studio and the DB comes back — keyless, from the container, with no gcloud and no laptop — and
the page self-recovers; non-admins are refused, and any authenticated user is kept off the billable
start.

The deciding ADR is [ADR-0049](../../docs/decisions/0049-hosted-studio-self-wakes-its-db.md) (amends
ADR-0042). Closes the dead end ADR-0042 left: hosted members hit the store-unreachable wall when the
DB idle-stops (ADR-0015) and had no way back — the existing `/api/db/start` shells out to gcloud on
the operator's machine, which doesn't exist on Cloud Run.

## Design floor (from ADR-0049)

- **Keyless, container-native wake.** `POST /api/db/wake` reads the runtime SA's metadata token and
  PATCHes the Cloud SQL Admin REST API (`activationPolicy = ALWAYS`) — the inverse of the
  cost-backstop's nightly stop, same instance. No gcloud, no key file (ADR-0021). Idempotent;
  202 `{ok:true}` mirroring `/api/db/start`; the ~1-minute start is observed by the existing
  `/api/health` poll. The gcloud `/api/db/*` path stays off hosted.
- **Admin-gated, seed-admin while degraded.** Normal mode: admin-only by the policy's method rule.
  Store down (membership unresolvable): authorized off the bootstrap-admin SEED
  (`STORYTREE_STUDIO_ADMINS`, env-resolvable without the DB) — the one write reachable under the
  degraded policy. IAP is `allAuthenticatedUsers` (ADR-0043), so the narrow gate is what keeps a
  random signed-in account from firing a billable start.
- **The button.** StoreBanner shows "Wake the database" only to admins (`/api/me` carries
  `canWakeDb`); the click POSTs the endpoint and leans on the existing health-poll recovery. Local
  dev is untouched (open posture → `canWakeDb:false` → the gcloud Start DB flow).
- **Scoped IAM.** A `storytreeStudioDbWake` custom role (`cloudsql.instances.get` + `update` only)
  on the runtime SA — narrower than `cloudsql.admin`/`cloudsql.editor` (`infra/studio-db-wake.tf`).
  A privileged one-time owner `terraform apply`; until then wake fails loud (502), never silent.

## Contracts (4)

1. **`keyless-rest-wake`** — wake works in the container, no gcloud
   - **asserts —** `createDbWaker` PATCHes the right instance URL with `activationPolicy=ALWAYS` and
     the runtime SA's bearer token; a non-2xx becomes a throw carrying the Admin-API reason (so a
     missing IAM grant is actionable, not a silent no-op). `handleDbWake` answers 202 `{ok:true}` on
     POST, 405 on non-POST, 404 when wake isn't wired, 502 carrying the failure when the waker rejects.
2. **`admin-gated-wake`** — only an admin can spend the money
   - **asserts —** normal mode: an admin POST → 202 (the waker fires); a member → 403 before any wake.
     `/api/me` reports `canWakeDb` true for the admin, false for the member; identity-less → 401.
3. **`degraded-seed-wake`** — the chicken-and-egg: wake while membership is unresolvable
   - **asserts —** with the store down (every other corpus route 503), a SEED admin POST
     `/api/db/wake` → 202 and a non-seed member → 403; `canWakeDb` rides the degraded `/api/me`.
4. **`button-recovers`** — the UI affordance + self-recovery loop
   - **asserts —** with `canWake`, StoreBanner shows "Wake the database" (not the gcloud Start DB),
     the click calls `api.dbWake()`, goes to 'starting', and on the next healthy `/api/health` clears
     the banner + fires `onRecovered`; a 403 from a non-seed admin surfaces the reason, affordance kept.
