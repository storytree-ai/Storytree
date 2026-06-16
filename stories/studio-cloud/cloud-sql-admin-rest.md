---
id: "cloud-sql-admin-rest"
tier: contract
story: studio-cloud
title: "Typed Cloud SQL Admin REST client (describe + set activation policy)"
outcome: "A pure, dependency-free client controls a Cloud SQL instance over the Admin REST API — describe its state + activation policy, and set the activation policy (ALWAYS/NEVER) — with the access token and HTTP request INJECTED, so db-control can read and start/stop the instance with an ambient ADC token and never shell out to gcloud."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW, SELF-CONTAINED file pair (the module
# imports nothing at runtime), so the prove-it-gate's red is genuine: the authored test's
# `import { createCloudSqlAdmin } from "./cloud-sql-admin.js"` fails until IMPLEMENT writes the source.
# `install: true` + a typecheck wall because the proof runs in a fresh worktree (tsx + tsc need the
# lockfile-only install) and tsx strips types — only `tsc --noEmit` catches type-illegal-but-runtime
# -green code before promotion (ADR-0031 §2). The proof itself stays offline: the test injects a fake
# token-fetch + fake HTTP, so it touches no metadata server, no GCP, no Cloud SQL.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/store", "test"]
  scope:
    testGlobs: ["packages/store/src/**/*.test.ts"]
    sourceGlobs: ["packages/store/src/**/*.ts"]
  real:
    testFile: "packages/store/src/cloud-sql-admin.test.ts"
    sourceFile: "packages/store/src/cloud-sql-admin.ts"
    scope:
      testGlobs: ["packages/store/src/cloud-sql-admin.test.ts"]
      sourceGlobs: ["packages/store/src/cloud-sql-admin.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/store", "typecheck"]
---

# Typed Cloud SQL Admin REST client (describe + set activation policy)

**Outcome —** A pure, dependency-free client controls a Cloud SQL instance over the Admin REST API —
**describe** its state + activation policy, and **set** the activation policy (ALWAYS/NEVER) — with
the access token and the HTTP request **INJECTED**, so db-control can read and start/stop the instance
with an ambient ADC token and **never shell out to gcloud**.

> **The gap this closes.** Every db-control surface — `pnpm db:status` / `db:up` / `db:down`
> (`packages/cli/src/db-control.ts`), the CLI's `ensureLiveDb` preflight, and the studio's
> `/api/db/start` (`apps/studio/server/dbControl.ts`) — shells out to the bundled-Python `gcloud`
> CLI. On this Windows dev box that path costs ~2.1s of Python cold-start per call and, when those
> launches overlap with memory pressure, piles up into a credential-lock cascade (gcloud Python
> interpreters serialising on the SQLite credential stores under paging — investigated 2026-06-16).
> The hosted studio already proved the cure: `apps/studio/server/dbWake.ts` (`hosted-db-wake`,
> ADR-0049) PATCHes the **Cloud SQL Admin REST API** directly with a keyless token — no gcloud, no
> Python. This node GENERALISES that one ad-hoc PATCH into a reusable, typed **describe + patch**
> client every db-control surface can adopt (the wiring is a follow-on edit-existing unit). Same
> keyless ADC posture (ADR-0021); ~190ms warm vs gcloud's ~2.1s, and structurally immune to the
> cascade because it spawns no Python and touches no SQLite store.

## Guidance

ONE self-contained module `packages/store/src/cloud-sql-admin.ts` — **no runtime imports** (no `fetch`
call, no `process`, no `fs`, no workspace import); all I/O is injected, exactly like the pure core of
`apps/studio/server/dbWake.ts` (`createDbWaker(deps)`). Mirror that file's shape and naming.

Export these symbols:

```ts
/** A Cloud SQL instance's activation policy. */
export type ActivationPolicy = "ALWAYS" | "NEVER";

/** The subset of a Cloud SQL instance the db-control surfaces react to. */
export interface InstanceStatus {
  /** The instance state, e.g. "RUNNABLE" | "STOPPED" | "PENDING_CREATE". */
  state: string;
  /** settings.activationPolicy, e.g. "ALWAYS" | "NEVER". */
  activationPolicy: string;
}

/** A minimal HTTP response — only the bits the client reacts to (mirrors dbWake's PatchResult). */
export interface HttpResponse {
  status: number;
  body: string;
}

/** The injectable I/O surface — real fetch/token in production, stubbed in tests (mirrors DbWakeDeps). */
export interface CloudSqlAdminDeps {
  /** Fetch an OAuth access token for the calling identity (ADC locally, metadata SA on Cloud Run). */
  fetchToken: () => Promise<string>;
  /** Perform an authenticated request against `url`; never throws on a non-2xx (returns it). */
  request: (
    method: "GET" | "PATCH",
    url: string,
    token: string,
    body?: string,
  ) => Promise<HttpResponse>;
  project: string;
  instance: string;
  /** Cloud SQL Admin API base; defaults to SQLADMIN_BASE. */
  baseUrl?: string;
}

/** The current Cloud SQL Admin API base — the same host dbWake.ts PATCHes. */
export const SQLADMIN_BASE = "https://sqladmin.googleapis.com/v1";

/** Build the instance resource URL: `${base}/projects/${project}/instances/${instance}`. */
export function instanceUrl(project: string, instance: string, baseUrl?: string): string;

/** Parse a Cloud SQL Admin `instances.get` JSON body into InstanceStatus; throws on a malformed shape. */
export function parseInstanceStatus(json: unknown): InstanceStatus;

export interface CloudSqlAdmin {
  /** GET the instance, parse its state + activation policy. Throws on non-2xx or a malformed body. */
  describe(): Promise<InstanceStatus>;
  /** PATCH settings.activationPolicy (idempotent). Throws on non-2xx with the trimmed reply body. */
  setActivationPolicy(policy: ActivationPolicy): Promise<void>;
}

/** The pure client over injected I/O — the testable core (mirrors createDbWaker). */
export function createCloudSqlAdmin(deps: CloudSqlAdminDeps): CloudSqlAdmin;
```

Behaviour:

- **`instanceUrl(project, instance, baseUrl?)`** — returns
  `` `${baseUrl ?? SQLADMIN_BASE}/projects/${project}/instances/${instance}` ``. Pure, total.
- **`parseInstanceStatus(json)`** — reads `state` (string) and `settings.activationPolicy` (string)
  off the parsed JSON; THROWS an `Error` when the shape is wrong (not an object, missing `state`, or
  missing `settings.activationPolicy`). Keep it defensive — the input is `unknown`.
- **`createCloudSqlAdmin(deps)`** — returns the `CloudSqlAdmin`:
  - `describe()` — `token = await deps.fetchToken()`; `url = instanceUrl(deps.project, deps.instance,
    deps.baseUrl)`; `res = await deps.request("GET", url, token)`; on `res.status < 200 || >= 300`
    THROW `` `Cloud SQL Admin API ${res.status}: ${res.body.slice(0, 500).trim()}` `` (mirror dbWake's
    error message + 500-char trim); else `return parseInstanceStatus(JSON.parse(res.body))`.
  - `setActivationPolicy(policy)` — `token = await deps.fetchToken()`; same `url`; `body =
    JSON.stringify({ settings: { activationPolicy: policy } })`; `res = await deps.request("PATCH",
    url, token, body)`; on non-2xx THROW the same trimmed-body error; else resolve `void`.

Keep it total and dependency-light: no top-level side effects, no real `fetch`, no default that touches
real credentials — the production wiring (a `request` that calls global `fetch`, a `fetchToken` that
mints an ADC token) is a LATER unit, deliberately out of this node's write scope.

## Contract

1. **`describe-reads-state-and-policy`** — `describe()` issues an authenticated GET to the instance URL
   and parses the instance's state + activation policy.
   - **asserts —**
     - with a fake `fetchToken` returning `"tok"` and a fake `request` that records its arguments and
       returns `{ status: 200, body: JSON.stringify({ state: "RUNNABLE", settings: { activationPolicy:
       "ALWAYS" } }) }`, `await describe()` returns `{ state: "RUNNABLE", activationPolicy: "ALWAYS" }`;
     - the recorded call was `("GET", instanceUrl(project, instance), "tok")` with no body, and the URL
       equals `` `${SQLADMIN_BASE}/projects/${project}/instances/${instance}` `` (and honours an
       overridden `baseUrl`);
     - a `request` resolving `{ status: 503, body: "<long google error>" }` makes `describe()` REJECT
       with an Error whose message includes `503` and the trimmed body.
2. **`set-activation-policy-patches-settings`** — `setActivationPolicy(policy)` PATCHes
   `settings.activationPolicy`, is idempotent in shape, and surfaces non-2xx as a throw.
   - **asserts —**
     - `await setActivationPolicy("ALWAYS")` records a `("PATCH", instanceUrl(...), "tok", body)` call
       whose `body` parses to `{ settings: { activationPolicy: "ALWAYS" } }`; `"NEVER"` likewise;
     - a 2xx response resolves `void`; a non-2xx (e.g. 403) REJECTS with an Error message that includes
       the status and the trimmed reply body.
3. **`pure-helpers-are-total`** — the building blocks are pure and defensive.
   - **asserts —**
     - `instanceUrl` builds the documented path off the default base and off an explicit `baseUrl`;
     - `parseInstanceStatus` extracts `state` + `activationPolicy` from a well-formed body, and THROWS
       on each malformed input (non-object, missing `state`, missing `settings.activationPolicy`).
   - **proven by —** `packages/store/src/cloud-sql-admin.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; the spine observes the red — the missing `./cloud-sql-admin.js` — before
     IMPLEMENT writes the source).
