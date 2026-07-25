---
status: accepted
decided: 2026-07-26
arc: distribution-posture-arc
---
# ADR-0244: Distribution posture: ship the method, protect the stream — reputation and velocity are the moat, not code secrecy

## Status

**accepted** (2026-07-26) — directed by the owner in conversation. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

The owner opened the question as *"how easy is it to derive our repo from our app… I really want to
start distributing the app to a closed circle of other devs"*, weighed the measured options across the
conversation, and closed it: *"at some point we need to ship and trust that our product and its
reputation becomes the moat, and anyone deconstructing it is doing it for learning purposes — anyone
doing cheap knock-offs won't be trusted or be able to keep pace with our development velocity anyway."*

This ADR records the posture so it is not re-litigated per distribution decision, and so the follow-on
work is built for the right reason.

## Context

Two distribution audiences, with different needs:

1. **The inner circle** — contributors who build storytree itself. Named risk: one of them shares the
   desktop app, or a machine is compromised.
2. **Real users** — people who build their own forest and never contribute. Not yet shipping, but the
   posture must not paint us into a corner for them.

The question was whether the Electron desktop app can be shipped without handing over the spine.

### What was measured

Grounded in the checkout at `f0ad3b9a`, not assumed:

- **There is no packaging pipeline at all.** Zero matches for `electron-builder`, `electron-forge`,
  `bytenode`, or obfuscation tooling in `apps/desktop/package.json`; no release workflow in
  `.github/workflows/`. The documented install path is `pnpm --filter studio build && pnpm --filter
  desktop start`.
- **The backend ships as raw TypeScript, deliberately.** `electron/backend-entry.ts` is spawned as a
  `tsx` sidecar (`spawn(process.execPath, ["--import", "tsx", BACKEND_ENTRY])`) precisely because
  esbuild empties `import.meta` under CJS. It imports `@storytree/drive`, `@storytree/orchestrator`,
  and `@storytree/library/store` — and per repo convention those packages have **no build step**. The
  spine therefore ships as commented source with ADR citations intact.
- **The app requires a checkout of this repo to run.** ADR-0181's runtime root points the shell at a
  worktree pinned to `main`, and the sidecar reads `stories/` and `docs/` from it.
- **`createPool` cannot talk to a non-Cloud-SQL Postgres.** It unconditionally constructs
  `new Connector()` with `authType: AuthTypes.IAM`; there is no host/port/password or
  connection-string branch (the only `password` occurrences in the file are comments asserting there
  is none).
- **The DB has no authorization.** `packages/library/src/store/schema.sql` contains **zero** `GRANT`,
  `REVOKE`, `CREATE ROLE`, `POLICY`, or `ROW LEVEL SECURITY` statements across its 19 `events.*`
  tables, and the app connects **directly as the recipient's own IAM principal**. Any check the app
  makes is therefore advisory: the same credential in `psql` gets whatever the role permits.
- **The app carries no DB secret.** Auth is IAM over ambient ADC — `STORYTREE_DB_USER` is an identity,
  not a secret. A leaked app bundle does not grant DB access; that needs the victim's ADC *plus* an IAM
  grant.
- **The shippable knowledge corpus is bounded, and it is not our history.** `knowledge.json` is 171
  artifacts: 56 principle, 48 definition, 22 pattern, 13 guardrail, 13 process, 12 agent, 6 techstack,
  1 open-question. Our own development record — the 239 ADRs in `docs/decisions/` and the work
  hierarchy under `stories/**` — is **not** in it.

### What the research said (July 2026)

- **Client-side encryption does not work.** The decryption key must ship. Electron's maintainers
  declined to build it (electron#4359, asar#46) and the canonical demo
  (`toyobayashi/electron-asar-encrypt-demo`) concedes the point. electron-vite documents that even
  under bytecode, "sensitive strings (encryption keys, tokens, credentials) remain readable".
- **V8 bytecode is the strongest practical lever, with sharp limits.** It covers the main process and
  preload only — the renderer stays plain JS — and the cache is bound to a specific V8 version *and*
  CPU architecture, making cross-platform distribution "unreliable and not recommended". Its coverage
  does happen to align with our asset split: our valuable code is sidecar/Node-side, not renderer-side.
- **A framework switch buys little.** Tauri compiles its *Rust* backend, but our spine is TypeScript —
  we would either rewrite it or keep it as an equally-exposed Node sidecar. Tauri frontend assets are
  extractable from the shipped binary with off-the-shelf tools (`tauri-dumper`, `TauriExtractor`).
- **Node SEA is not protection** (the embedded blob is readable JS). **Bun `build --compile
  --bytecode`** is the one genuinely attractive option: JSC bytecode, single binary, native TypeScript
  — and our sidecar is already a separate process, so the swap is contained.

## Decision

**D1 — Reputation and development velocity are the moat.** We ship. No architectural decision is taken
for the sake of secrecy, and no distribution decision is blocked on protection work. Someone
deconstructing the app is learning; someone shipping a knock-off cannot keep pace.

**D2 — The method corpus ships in the clear.** The 171 knowledge artifacts must be on the user's
machine for the product to function, and they are the part a user must be able to read to trust it.
They are unencryptable by construction — data the app reads. Accepted, not mitigated.

**D3 — Our own history does not ship in a user build.** `docs/decisions/**`, `stories/**`, and the
ADR-0181 pinned runtime worktree are storytree's development record, not product content. They are
**cut** from a user build, not encrypted. This also removes the worktree requirement, which is the
ugliest part of distributing the app today.

**D4 — Protect the stream, not the snapshot.** We cannot protect a shipped seed. We can serve the
living corpus as an authenticated pull, so possession of today's 171 artifacts is not access to the
improving method. This is the only protection here that survives someone sharing the app, and it is
the one worth building.

**D5 — Packaging hardening is for integrity and professionalism, not secrecy.** Bundle and minify the
sidecar (retiring the raw-`tsx` spawn), then `electron-builder` + asar + Electron Fuses + asar
integrity + code signing. Bun-compiling the sidecar is a **spike**, not a commitment. We do this
because shipping unsigned raw source is unprofessional, not because it hides anything.

**D6 — Local-only mode is a first-class target: the user hosts their own Postgres.** ADR-0119's
thick-local backend already runs the whole spine locally against a Postgres, so this is a connection
target change, not an architecture change. It requires a mode fork in the `createPool` seam
(`cloudsql-iam` | `local`). **In local mode the DB is explicitly NOT a protection boundary** — the data
is theirs. Accepted per D1/D2.

**D7 — The API seam and DB authorization are scoped to the contributor/hosted deployment only.** They
are worth building there (revocable per-member access, no per-member IAM grants, an audit trail), but
they are **not** the product's protection story and must not be built believing they are. Recorded
explicitly because an earlier reading of this thread treated the API seam as the load-bearing
protection increment; D6 makes it orthogonal.

**D8 — Inner-circle distribution proceeds on today's DB posture, knowingly.** Zero GRANT/RLS, direct
connection as the recipient's own IAM principal, `psql`-bypassable. Acceptable for contributors we
trust by name. Collapsing traffic to a single service-account role is the follow-on, gated on D7, and
is a **prerequisite before anyone outside the inner circle receives a Cloud SQL grant**.

## Options weighed and rejected

- **Encrypt the app bundle** — rejected on evidence: the key ships. It converts "open the file" into
  "run one extraction script someone already wrote".
- **Rewrite on Tauri for a compiled backend** — rejected on cost/benefit: the spine is TypeScript, so
  we would pay a full rewrite to protect the shell we do not care about, and Tauri assets are
  extractable anyway.
- **Thin client only (no local mode)** — rejected as the *sole* answer: it is genuine protection, but it
  contradicts the local-first direction in D6 and would strand ADR-0119. Retained as the shape of the
  hosted/contributor deployment (D7).
- **Obfuscation-first architecture** — rejected per D1. It taxes every future change to raise a bar our
  audience (developers) clears anyway.

## Consequences

- We accept that a recipient of the app can read the method corpus and — with effort proportional to
  whichever packaging tier we build — the spine.
- The `createPool` mode fork, the seed split (product knowledge vs. storytree history), and the
  Tier-0 packaging work are shared prerequisites for both deployments, and are worth doing before the
  D6/D7 split is exercised.
- The corpus-update stream (D4) becomes the load-bearing piece of the product's defensibility and
  should be designed before a user build ships.
- D8 leaves a standing constraint: no Cloud SQL grant outside the inner circle until the
  service-account collapse lands.
- No future distribution decision needs to re-open the protection question. It is settled here.

## References

- ADR-0110 — owner-directed decisions are born `accepted`.
- ADR-0119 — the thick-local backend, which D6 builds on rather than reverses.
- ADR-0181 — the pinned-`main` runtime worktree that D3 cuts from user builds.
- ADR-0042 / ADR-0043 — the hosted studio behind IAP and its Members panel, the shape D7 refers to.
- `packages/library/src/store/connection.ts` — the Cloud-SQL-only seam D6 forks.
- `packages/library/src/store/schema.sql` — the 19 `events.*` tables with no authorization (D8).
- `apps/desktop/electron/backend-entry.ts` — the raw-`tsx` sidecar D5 retires.
