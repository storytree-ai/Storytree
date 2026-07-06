---
status: accepted
decided: 2026-06-14
amends: [42]
---

# ADR-0049: The hosted studio may wake its own DB (keyless, admin-gated)

## Status

**accepted** (2026-06-14) — the implementation landed in the same unit (see *Done in this unit*);
the owner reviewed the privileged Terraform IAM grant and gave the go-ahead to land it (2026-06-14).
The one-time `terraform apply` + manual deploy are tracked operationally (`infra/studio-cloud.md` §6);
merging does not redeploy (no CD trigger yet — ADR-0046 is draft PR #103).

**Amends [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)** (the hosted studio posture). ADR-0042
d.3 ruled that `/api/db/*` is refused for everyone hosted — "its gcloud-on-the-operator's-machine
premise simply doesn't hold in a container … the owner starts the DB from a session as usual." That
gcloud path **stays off** (this ADR does not overturn it). What this amends is the *consequence* that
"guests cannot start it … if the circle uses it heavily outside the owner's hours … members see the
honest degraded banner until the owner runs `pnpm db:up`": it adds a SECOND, keyless, container-native
wake path so an **admin** can bring the DB back **from the site**, and the studio self-recovers.

Builds on [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless ambient auth — no
key files), [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) (the idle-stop economics this
recovers from), and [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md) (IAP was widened to
`allAuthenticatedUsers` + the app authorizes — which is *why* the wake must be narrowly gated).

*Numbering note:* `docs/decisions/` runs 0001–0046 on `main`; `git log --all` shows **0047**
(`0047-inbound-signal-librarian-and-recursive-graduation.md`, draft PR #109) and **0048**
(`0048-in-flight-build-is-the-primary-wisp.md`, a parallel session's harness-driven-wisps ADR) both
already taken on draft branches, so this is **0049**. ADRs are docs, not DB rows (ADR-0017/0045) — no
live-DB ref to collide; the on-disk-number collision is what the rename to 0049 avoids.

## Date

2026-06-14

## Context

The hosted studio (Cloud Run `storytree-studio`, behind direct IAP) authorizes members from a users
projection in Cloud SQL `storytree-pg` (`resolveMembersAccess`, ADR-0043). That instance **auto-stops
when idle** for cost (idle-aware 8 h window + a daily 04:30 floor — `infra/idle-stop.tf` /
`infra/cost-backstop.tf`, ADR-0015). **Correction (2026-07-06 — ADR-0139 pass):** this idle-aware
window was replaced by a fixed 01:00–07:00 Australia/Sydney sleep window
([ADR-0114](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md)). When it is STOPPED:

- `resolveMembersAccess` throws, the server falls back to `createDegradedPolicy`, and every `/api/*`
  except `/api/health` + `/api/me` answers 503;
- members land on the store-unreachable wall ("Your membership can't be resolved right now").

And there is **no way to wake the DB from the site**. `serve.ts` hardcodes `allowDbControl: false`, and
the existing `/api/db/start` shells out to **gcloud using the operator's local ADC** — neither gcloud
nor that ADC exists in the Cloud Run container (that premise is sound only on the operator's own
localhost dev server, dbControl.ts). So members are stuck until someone runs `pnpm db:up` from a
laptop. For a circle meant to "interact with the studio" outside owner hours, that is a dead end.

Two constraints frame the fix:

- **Keyless (ADR-0021).** No key file in the image. The container already runs *as* a runtime service
  account (`storytree-studio-host`) with an ambient token from the metadata server.
- **Don't let anyone start a billable instance (ADR-0043).** IAP was widened to
  `allAuthenticatedUsers` and the app authorizes — so *any* signed-in Google account reaches the
  server. A wake that fires an instance start is a (small) **cost action**; it must be admin-gated,
  and the gate must work **while the store is down** (membership can't be resolved then — chicken and
  egg).

## Decision

1. **A hosted-native, keyless wake endpoint — `POST /api/db/wake`.** It does NOT use gcloud. It reads
   an OAuth access token for the **runtime SA** from the metadata server, then PATCHes the **Cloud SQL
   Admin REST API** (`settings.activationPolicy = ALWAYS`) — the exact inverse of the cost-backstop's
   nightly stop (`infra/cost-backstop.tf`), against the same instance. Idempotent. It awaits only far
   enough to confirm the Admin API **accepted** the patch (so an IAM/auth failure surfaces as a 502 the
   admin can act on), then answers **202 `{ok:true}`**, mirroring `/api/db/start` so the StoreBanner's
   recovery loop is identical (it polls `/api/health`; the ~1-minute instance start is the async part).
   The I/O (token fetch + HTTP) is injected, so the handler is unit-testable offline. Served regardless
   of `allowDbControl` (that flag governs the *gcloud* path, which stays off); absent in the dev plugin
   → 404.

2. **A scoped custom IAM role for the runtime SA — not `cloudsql.admin`.** A new
   `storytreeStudioDbWake` custom role with exactly `cloudsql.instances.get` +
   `cloudsql.instances.update`, bound to `storytree-studio-host` (`infra/studio-db-wake.tf`). Narrower
   than `roles/cloudsql.admin` (which can DELETE) and than `roles/cloudsql.editor` (the cost-backstop
   SA's role — also import/export, clone, user/db management). This grant is **privileged** and is a
   one-time owner `terraform apply` (held for review). Until applied, wake answers a clear 502
   ("Cloud SQL Admin API 403: cloudsql.instances.update denied") — it fails **loud and safe**, never a
   silent no-op.

3. **Admin-gated, seed-admin while degraded.** In normal operation the gate's existing rule already
   makes a non-GET non-comment request admin-only (`createMembersPolicy`). While the store is down,
   membership can't be resolved from the projection, so `createDegradedPolicy` authorizes the wake off
   the **bootstrap-admin seed** (`STORYTREE_STUDIO_ADMINS`, env-resolvable without the DB — `mayWakeDb`
   in guestPolicy.ts). The wake is the ONE write reachable under the degraded policy. `/api/me` carries
   `canWakeDb` so the SPA shows the button only to admins; a non-admin who reaches the endpoint gets a
   clear 403 ("ask an admin").

4. **The UI: a "Wake the database" button.** StoreBanner gains a `canWake` path that POSTs
   `/api/db/wake` and leans on the existing health-poll → `onStoreRecovered` recovery (no new
   machinery). Local dev is untouched: the open dev posture has `canWakeDb:false`, so the gcloud
   Start DB flow is byte-identical to before.

## Owner decisions

1. ✅ **RESOLVED (owner call, 2026-06-14) — keep seed-admin-only.** During an outage the projection is
   unreadable, so the only DB-free authorization is the env seed (`STORYTREE_STUDIO_ADMINS`, today just
   the owner). Seed-admin-only means only an admin (in practice, the owner) can trigger a billable
   start; everyone else resolves automatically once it's up. Widening to "any prior member" would
   require a cache/snapshot of the members list survivable across an outage — more machinery, and it
   lets more identities spend money. Revisit if the circle regularly needs to self-wake when no admin
   is around.
2. ✅ **APPROVED (owner, 2026-06-14) — the one-time `terraform apply`** for `infra/studio-db-wake.tf`
   (the custom role + binding). Owner-run; being applied as part of landing this unit. Until applied,
   wake answers a clear 502 — loud and safe, never a silent no-op.
3. ⏳ **OPERATIONAL (BLOCKING) — a manual deploy.** There is no live CD trigger (ADR-0046 is draft
   PR #103), so merging does not redeploy. The wake only works once the new image is deployed with the
   ADR-0042 flag set (`infra/studio-cloud.md` §3–§4).

## Consequences

- The hosted studio self-recovers from an idle-stop: an admin presses one button and the page comes
  back on its own — closing the "stuck behind the wall until someone runs `pnpm db:up`" dead end.
- One new project custom role and one binding on the runtime SA — the only IAM surface added; scoped to
  get+update on Cloud SQL, nothing else. Reviewed before apply.
- The wake is a (small) cost lever now reachable from the site; the seed-admin gate keeps it off the
  `allAuthenticatedUsers` ingress (decision 3). The idle-stop economics (ADR-0015) are unchanged — this
  recovers from them, it doesn't change them.
- The gcloud `/api/db/*` path stays off hosted (ADR-0042 d.3 intact); local dev is untouched.
- **Not decided here:** auto-wake (firing on the first 503 with no human) — deliberately rejected; a
  billable start must be a human, admin action. A DB→members snapshot to widen the degraded gate
  (decision 1) is left open.

## Done in this unit

- `apps/studio/server/dbWake.ts` — the injectable `DbWaker` (`createDbWaker`), the production
  metadata-token waker (`createMetadataDbWaker`), and `handleDbWake` (202/405/404/502). Offline unit
  tests in `dbWake.test.ts`.
- `apps/studio/server/guestPolicy.ts` — `mayWakeDb` (the pure seed gate), `createDegradedPolicy` gains
  the seed set + permits `POST /api/db/wake`, `canWakeDb` on `/api/me` (both policies).
- `apps/studio/server/apiRouter.ts` + `serve.ts` — the `/api/db/wake` route (before the gcloud block),
  `ApiContext.dbWake`, and the entrypoint injects `createMetadataDbWaker()`. Integration coverage in
  `serveApi.integration.test.ts` (admin 202 / member 403 in normal AND degraded mode; canWakeDb).
- `apps/studio/src` — `api.dbWake()`, `StoreBanner` `canWake` button + jsdom tests, `App.tsx` threads
  `me.canWakeDb`, `MeInfo.canWakeDb`.
- `infra/studio-db-wake.tf` — the `storytreeStudioDbWake` custom role (get + update) bound to the
  runtime SA. `terraform validate` green.
- `infra/studio-cloud.md` §6 — the runbook for the grant + the deploy env (no new env vars needed).
- **Held DRAFT** until the owner runs the apply (decision 2) and deploys (decision 3).

## References

- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) (the hosted posture this amends — gcloud db
  control stays off; this adds the keyless wake).
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) (keyless ambient auth — the metadata
  token, no key file).
- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) (idle-stop economics this recovers from);
  `infra/cost-backstop.tf` (the inverse PATCH this mirrors).
- [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md) (IAP widened to allAuthenticatedUsers —
  why the wake is narrowly gated).
- `infra/studio-cloud.md` (the deploy runbook + the new §6 grant step).
