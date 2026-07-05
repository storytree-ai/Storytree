---
status: accepted
decided: 2026-06-28
amends: [117, 42]
load_bearing: true
---
# ADR-0133: Inner-circle desktop is the priority: finish storytree's tree first, defer the write-broker and hosted studio (secure later)

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

## Context

`chat-drive-bridge`'s four machine-provable capabilities are landed and green on `main` — the local
**propose → accept → drive → land** mechanics exist (ADR-0108 Phase 3+4). What remains is the
owner-attested live walk (legs 5–6) and one piece of unbuilt glue: the build **worker**
(`BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild`) lives in `apps/studio/server`, and the
chat surface (`/api/chat`) lives only on the desktop sidecar; an app may not import another app's
server (ADR-0100), so the desktop cannot drive a build today.

The owner's strategic call (2026-06-28): **the inner circle is the priority.** Get co-builders onto the
**thick-local desktop** so they can help **finish storytree's own tree**, fast, for feedback —
speed-to-feedback dominates over hardening for this phase.

Two groundings shape the decision:

1. **The desktop build path already runs entirely locally** — a Node sidecar + the spine on the
   builder's own machine (ADR-0113 / ADR-0119). **Cloud Run hosts only the studio web viewer**
   (ADR-0042), which is **not** in the desktop path. The desktop's one remaining cloud tie is the
   shared Cloud SQL **database**, not Cloud Run. "Going all-in on desktop" is therefore well-supported
   and does not depend on hosted infra.
2. **ADR-0117** (decided 2026-06-27) chose a members-gated **write-broker** over the direct per-friend
   Cloud SQL IAM grant, so a co-builder need not hold a direct key to the production DB. It is
   **partially built** (the desktop write-client landed; the studio broker mount + wiring are open).

## Decision

1. **The thick-local desktop is the inner-circle surface, and finishing storytree's own tree is the
   priority.** The inner circle co-builds storytree by driving builds on the **shared forest** from the
   desktop app (local compute, ADR-0113). They are working on **our** tree — not their own projects
   (that is the post-MVP direction, decision 5). Speed-to-feedback is the goal.

2. **Defer the ADR-0117 write-broker for the inner-circle MVP ("secure later") — amends, does not
   cancel.** For now, inner-circle builders contribute through the thick-local desktop with the write
   path **direct** (owner-granted Cloud SQL access, the pre-broker path ADR-0113 §6 described),
   **consciously accepting the temporary risk ADR-0117 named.** This is bounded by the same two facts
   ADR-0117 itself relies on: the trust boundary is the inner circle (**trusted with the source**,
   ADR-0113's precondition), and **CI independently re-proves green before the trunk** (ADR-0022), so a
   wrong in-store verdict is at worst a briefly-wrong hue. The broker **remains the eventual design**
   and is the **first "secure later" item** once the circle outgrows "trusted to be truthful." This is
   a **time-bound deferral, not a reversal** — ADR-0117 stands.

3. **Build the desktop build-mount (a fresh story for the story-author).** Relocate the worker
   machinery (`BuildRegistry` / `runBuildJob` / `dispatchAcceptedBuild` + the `BuildContext` type) out
   of `apps/studio/server` into the shared **`@storytree/drive`** package — it is dependency-light
   (`buildRegistry.ts` → only `node:crypto`; `buildWorker.ts` → only the registry + locally-declared
   structural types) and the build entries it drives (`nodeBuild` / `storyBuild`) already live there —
   then mount `POST /api/build` + the chat accept→dispatch on the desktop local backend
   (`electron/backend-entry.ts`), reusing the `BuildContext` wiring `devApi.ts` already uses (lazy
   `@storytree/drive/build`; `@storytree/orchestrator` discovery for `isBuildable`). The desktop then
   becomes a complete propose→accept→drive→land surface on the shared tree. The owner's desktop is
   first-party direct-connect (ADR-0117 already scopes the broker to friends, leaving owner tooling
   direct); inner-circle builders are direct too under decision 2.

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
- **Fastest path to inner-circle feedback.** The desktop already runs the chat + the local spine; this
  adds the one missing capability (driving a build from the desktop) by **relocating existing,
  dependency-light, already-green machinery** — no new build path, no hosted infra to stand up.
- **One shared forest everyone watches.** The inner circle co-builds storytree's own tree on the shared
  store, preserving ADR-0113's shared-forest value.
- **Not a throwaway.** The thick-local desktop is exactly the substrate the post-MVP "grow your own
  tree" feature needs — this is product-direction work.

**Bad / accepted costs**
- **Security debt, consciously taken.** Deferring the ADR-0117 broker means inner-circle builders hold
  a direct line to the production DB until the broker is wired — the exact risk ADR-0117 was created
  (one day earlier) to remove. Accepted because the trust boundary is the inner circle and CI re-proves
  green before the trunk (ADR-0022); the broker is the first "secure later" item. **Time-bound, not a
  reversal.**
- **The hosted studio's build ambitions pause.** Web-viewer-only members don't gain build-from-browser
  (they did not have it in Phase 1 anyway).

**Neutral**
- ADR-0117 stands as the eventual design; this ADR defers only its *requirement* for the MVP phase.
  When the circle outgrows "trusted with the source," the broker — and beyond it the hosted worker
  (ADR-0090 / ADR-0091) — returns.
- The owner's own first-party direct-connect tooling is unchanged (as ADR-0117 already stated).

## References

- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) — the members-gated
  write-broker; **amended** (its broker-now requirement deferred for the inner-circle MVP; the broker
  stands as the eventual design and the first "secure later" item).
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
  for the deferred-broker risk.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed in
  conversation → born accepted.
</content>
</invoke>
