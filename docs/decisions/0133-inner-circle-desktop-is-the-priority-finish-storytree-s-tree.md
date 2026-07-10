---
status: accepted
decided: 2026-06-28
amends: [117, 42]
load_bearing: true
---
# ADR-0133: Inner-circle desktop is the priority; the temporary write-broker deferral has ended

## Status

accepted (2026-06-28) — decided/directed by the owner in conversation on 2026-06-28. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The inner-circle onboarding walk
and the desktop build mount's live appearance are operator-attested under ADR-0070 when built.

> **Amended by [ADR-0155](0155-orchestrator-drives-retire-the-chat-propose-unit-accept-to-b.md)**
> (accepted, 2026-07-04) — **the desktop accept→dispatch route (d.3, `/api/chat/accept` + the
> `accepted` provenance) is RETIRED.** With ADR-0137 (spawn) + ADR-0152 (landing) the chat orchestrator
> drives builds itself; the propose → accept → dispatch handshake it wired is gone, so
> `apps/desktop/src/backend/accept-dispatch.ts` and its sidecar wiring are removed. The rest of the
> desktop build mount stands: the shared build worker (`BuildRegistry` / `runBuildJob`) and the story
> detail panel's `/api/build` route are UNCHANGED.
>
> **Amended by [ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md)**
> (accepted, 2026-07-10) — the temporary d.2 "secure later" deferral is LIFTED for desktop verdict,
> UAT-attestation, and presence writes. Those proof writes now follow ADR-0117's brokered target;
> the desktop-priority call and the remaining decisions here stand.

## Context

At this decision's acceptance, `chat-drive-bridge`'s four machine-provable capabilities were green
on `main`, but the build worker still lived in `apps/studio/server` while `/api/chat` lived on the
desktop sidecar. Because an app may not import another app's server (ADR-0100), the desktop could not
yet drive a build. The shared worker and desktop `/api/build` route subsequently landed; ADR-0155
later retired the separate propose→accept→dispatch handshake.

The owner's strategic call (2026-06-28): **the inner circle is the priority.** Get co-builders onto the
**thick-local desktop** so they can help **finish storytree's own tree**, fast, for feedback —
speed-to-feedback dominates over hardening for this phase.

Two groundings shape the decision:

1. **The desktop build compute runs locally** — a Node sidecar + the spine on the builder's own
   machine (ADR-0113 / ADR-0119). At this decision's acceptance, Cloud Run hosted only the studio
   web viewer and the desktop's cloud tie was a direct shared-Cloud-SQL connection. ADR-0180 later
   placed the authenticated hosted broker in the desktop proof-write path without moving build
   compute off the desktop.
2. **ADR-0117** (decided 2026-06-27) chose a members-gated **write-broker** over the direct per-friend
   Cloud SQL IAM grant, so a co-builder need not hold a direct key to the production DB. It is
   **partially built at this decision's acceptance** (the desktop write-client had landed; the studio
   broker mount + wiring were open). ADR-0180 later lifted the temporary deferral for proof writes.

## Decision

1. **The thick-local desktop is the inner-circle surface, and finishing storytree's own tree is the
   priority.** The inner circle co-builds storytree by driving builds on the **shared forest** from the
   desktop app (local compute, ADR-0113). They are working on **our** tree — not their own projects
   (that is the post-MVP direction, decision 5). Speed-to-feedback is the goal.

2. **The ADR-0117 write-broker deferral was temporary and is now ended.** This decision originally
   permitted the inner-circle MVP to use the direct, owner-granted Cloud SQL path while consciously
   accepting ADR-0117's risk. [ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md)
   lifted that "secure later" deferral on 2026-07-10 for desktop verdict, UAT-attestation, and presence
   writes. Those proof writes now go through the authenticated `builder`-gated broker as each caller
   lands; the temporary direct production-DB exception is no longer the current target.

3. **Build the desktop build-mount.** Relocate the worker
   machinery (`BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild` + the `BuildContext` type) out
   of `apps/studio/server` into the shared **`@storytree/drive`** package — it is dependency-light
   (`buildRegistry.ts` → only `node:crypto`; `buildWorker.ts` → only the registry + locally-declared
   structural types) and the build entries it drives (`nodeBuild` / `storyBuild`) already live there —
   then mount `POST /api/build` on the desktop local backend
   (`electron/backend-entry.ts`), reusing the `BuildContext` wiring `devApi.ts` already uses (lazy
   `@storytree/drive/build`; `@storytree/orchestrator` discovery for `isBuildable`). ADR-0155 later
   retired the separate chat accept→dispatch route while leaving the shared worker and `/api/build`
   route intact. This build-mount mechanism remains local; its proof writes follow ADR-0180's
   brokered path. Owner first-party CLI/store tooling remains direct under ADR-0117.

4. **De-prioritize the hosted Cloud Run studio (ADR-0042) — not removed.** It remains the read/comment
   members surface, but the **desktop** is where the build-capable inner-circle work happens. The
   fully-hosted thin-client worker (ADR-0090 / ADR-0091) stays deferred. (Amends ADR-0042's priority,
   not its existence.)

5. **Post-MVP product direction — RECORDED, OUT OF SCOPE NOW.** Once storytree is past MVP it grows a
   **fresh tree** or **maps an existing brownfield** project for *other* developers — *"instead of just
   building itself, it helps devs build their own projects."* This north star is what makes the
   thick-local, local-data architecture matter long-term, but it is **explicitly deferred** until
   storytree's own tree is finished. **No work is scoped to it here** (no local self-contained store,
   no multi-tenant model) — it is captured so the desktop investment is understood as product-direction
   work, not a throwaway shortcut.

## Consequences

**Good**
- **Fastest path to inner-circle feedback.** The desktop already ran the chat + the local spine; this
  added the missing build capability by **relocating existing,
  dependency-light, already-green machinery** — no new build path, no hosted infra to stand up.
- **One shared forest everyone watches.** The inner circle co-builds storytree's own tree on the shared
  store, preserving ADR-0113's shared-forest value.
- **Not a throwaway.** The thick-local desktop is exactly the substrate the post-MVP "grow your own
  tree" feature needs — this is product-direction work.

**Bad / accepted costs**
- **The temporary direct-write security debt existed during the MVP deferral.** ADR-0180 ended that
  deferral for desktop proof writes; completing each brokered caller and the authenticated Electron
  session composition is now the accepted integration cost.
- **The hosted studio's build ambitions pause.** Web-viewer-only members don't gain build-from-browser
  (they did not have it in Phase 1 anyway).

**Neutral**
- ADR-0117 now stands as the current desktop-proof-write direction after ADR-0180 lifted this ADR's
  temporary deferral. The fully hosted worker (ADR-0090 / ADR-0091) remains deferred.
- The owner's own first-party direct-connect tooling is unchanged (as ADR-0117 already stated).

## References

- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) — the members-gated
  write-broker; this ADR's temporary deferral of it was lifted by ADR-0180.
- [ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md) — lifts d.2's
  temporary deferral for desktop verdict, UAT-attestation, and presence writes.
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted studio behind IAP; **amended**
  (de-prioritized vs the desktop; remains the read/comment surface).
- [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) — thick-local
  desktop for the inner circle; **reinforced** — the surface this decision doubles down on.
- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the phased
  chat→drive→land build; the desktop build-mount completes Phase 3+4 on the desktop surface.
- [ADR-0109](0109-a-native-credential-host-desktop-client-electron-for-byo-cre.md) — the desktop shell
  the mount hangs on.
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) /
  [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the fully-hosted
  thin-client worker; stays deferred.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — CI re-proves green before the trunk; the backstop
  during the historical direct-write interval and for brokered build integrity.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed in
  conversation → born accepted.
