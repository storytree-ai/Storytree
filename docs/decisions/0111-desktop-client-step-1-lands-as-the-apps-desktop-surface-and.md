---
status: accepted
decided: 2026-06-26
amends: [109, 100]
load_bearing: false
---
# ADR-0111: Desktop client Step 1 lands as the apps/desktop surface and stories/desktop story

## Status

accepted — owner-directed 2026-06-26 in session: the owner chose Option A from a surfaced placement
fork. Born `accepted` under [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (an owner-directed
decision is born accepted — alignment IS ratification, no end-of-flow re-ask). Refines
[ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md)'s "Step 1 — the shell
+ keychain broker" by fixing WHERE it lives.

## Context

ADR-0109 decided WHAT — an Electron credential-host desktop client — and named a two-step build, but
not WHERE Step 1 lives in the repo. Placing it is a real call, not a mechanical detail:

- It is the **first second-surface** — `apps/studio` was the only `apps/*` surface, so the surface
  conventions had exactly one instance.
- It is the **first surface to consume another surface's COMPILED build output**: the shell loads
  `apps/studio/dist`. ADR-0100's boundary model frames a surface as "a sink consumed by nothing," which
  had not had to contemplate one surface delivering an artifact to another.

Three options were surfaced to the owner: **(A)** a new `apps/desktop` workspace surface + a
`stories/desktop` story, broker in-app; **(B)** a shared `packages/credential-broker` organism + a thin
`apps/desktop` shell; **(C)** a separate submodule repo, like `web/`.

## Decision

1. **Step 1 lands as a new workspace surface `apps/desktop`** (mirrors `apps/studio`), classified in
   `repo-manifest.json` `packageOwnership.surfaces`, plus a new story `stories/desktop`
   (`depends_on: [studio]`).
2. **The credential broker lives INSIDE `apps/desktop`** — desktop-only, NOT promoted to a shared
   `packages/*` organism. No consumer outside the desktop client exists, so a shared organism would be
   speculative surface (slow-growth-minimum-to-green). Promote it to a package later **iff** a second
   consumer appears (e.g. the Step 2 hosted worker).
3. **`apps/desktop` consumes studio's COMPILED `dist`** (a build-time artifact), NOT `@storytree/studio`
   as a workspace import — so it adds no `@storytree/*` runtime dependency edge. The cross-story
   `depends_on: [studio]` is declared for honesty + forest visibility (ADR-0058: the shell needs
   studio's delivered output to render), even though the boundary gate does not force it (there is no
   code import to cover).
4. **The boundary precedent:** a surface MAY consume another surface's delivered build output via a
   declared cross-story `depends_on` edge; it still imports no organism source and is itself consumed by
   nothing as a workspace package. This refines ADR-0100's "sink consumed by nothing" to "consumed by
   nothing **as a workspace package**" — a surface can still be an upstream **deliverable** (its `dist`)
   for another surface.
5. **Electron stays out of the gate's critical path:** `apps/desktop` carries no `build` script (so
   `pnpm -r build` skips it — packaging is a later, deferred concern), and its CI-provable test is the
   broker's keychain round-trip against an in-memory `KeychainPort` fake. The real `@napi-rs/keyring`
   adapter and the shell's appearance are operator-attested (ADR-0070), not exercised in headless CI.

## Consequences

**Good**
- Matches the existing surface convention — the lowest-friction path, no new package machinery.
- The broker stays minimal-to-green; the keychain seam keeps the safety contract testable offline.
- The coupling stays visible: the declared `depends_on: [studio]` renders in the studio forest.

**Bad / accepted costs**
- A second surface now sits in the workspace install (Electron + a native keychain module). Electron's
  binary postinstall runs on install; it is cached and unneeded by the gate (types-only for typecheck,
  fake-backed for the test), but it is real install weight.
- If Step 2's hosted worker wants to reuse the broker, promoting it to `packages/credential-broker` is a
  migration — though a contained one, behind the existing `KeychainPort` seam.

**Neutral**
- The placement does not foreclose Option B: extracting `packages/credential-broker` later is a bounded
  refactor behind the seam.

## References

- [ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md) — the parent decision
  (Electron credential-host client; the two-step build); **amended** here by fixing Step 1's placement.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed decisions are
  born accepted; the basis for this ADR landing `accepted` without an end-of-flow re-ask.
- [ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md) — the consuming-surface
  boundary model; refined here (a surface may be an upstream deliverable for another surface).
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — the thin client
  carries only the compiled UI (d.4); preserved.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — operator-attested
  appearance (the shell + the real-keychain round-trip).
