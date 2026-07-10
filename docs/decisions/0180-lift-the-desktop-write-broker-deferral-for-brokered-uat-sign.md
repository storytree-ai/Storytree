---
status: accepted
decided: 2026-07-10
amends: [117, 133]
load_bearing: true
---
# ADR-0180: Lift the desktop write-broker deferral for brokered UAT signing

## Status

accepted (2026-07-10) — decided/directed by the owner in conversation on 2026-07-10. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0117 and ADR-0133.** ADR-0133's temporary "secure later" deferral is lifted for
desktop proof writes. ADR-0117's brokered target becomes current for verdicts, UAT operator
attestations, and presence; the desktop's direct production-DB write path is retired as each
brokered caller lands.

## Context

The desktop renders the shared studio UAT table but deliberately identifies its local caller as a
plain `member`. The shared component only enables "I saw it work" for an admin, and the desktop
mounts only `GET /api/attestations`, not the signing POST. Human UAT rows therefore appear grey and
cannot be completed from the app.

The lower-level broker pieces already exist: the hosted studio validates and persists a
builder-attributed signed verdict, and the desktop has a broker HTTP client. They were left
uncomposed because ADR-0133 deferred ADR-0117's friend-facing broker in favour of the temporary
direct-Cloud-SQL path. Enabling a local direct signing route would deepen that temporary exception
and expose a production DB write authority to every desktop member.

## Decision

1. **Lift the broker deferral for desktop proof writes.** Desktop verdict, UAT-attestation, and
   presence writes go through ADR-0117's hosted `builder`-gated broker. The broker validates shape,
   scope, and attribution and persists the already-signed bytes unchanged; it never signs or
   re-stamps them.
2. **Add a dedicated UAT permission, not a fake admin role.** `/api/me` gains a narrow
   `canAttestUat` signal. The shared UAT component enables an unproven human leg when this permission
   is true (hosted admins derive it from their role; desktop derives it from an authenticated,
   broker-ready builder). The desktop remains a `member`, so hosted-only Members/admin controls do
   not appear.
3. **Sign locally, persist through the broker.** The desktop UAT route resolves the declared test,
   rejects machine legs, applies the shared `checkUatProof` guard, and signs an
   `operator-attested` verdict only for a clean committed HEAD. The signer is the verified broker
   identity, never a renderer-supplied field. Broker refusal means no green.
4. **Reuse the Electron IAP session for broker authentication.** The desktop opens the hosted
   studio sign-in when the shared-forest session is unauthenticated, then performs broker requests
   through Electron's persistent session so the IAP cookie remains main-process-owned. The
   renderer receives only typed readiness/permission results, never cookies or identity tokens.
5. **Machine UAT remains proof-bound.** Changing a UAT leg from human to machine does not by itself
   authorize adoption to sign it. Each machine leg must name the proof command or reliability gate
   that actually witnesses that leg; an unbound machine leg is refused rather than silently mapped
   to the first observe gate.

## Consequences

The desktop can honestly complete human UAT without becoming an admin or receiving Cloud SQL IAM.
The same signed-verdict roll-up drives both desktop and hosted crowns. A forged signer, machine-leg
click, dirty tree, unauthenticated session, non-builder, or unreachable broker fails closed.

The cost is a real authenticated desktop-to-IAP composition: the app needs a hosted sign-in/retry
experience and Electron-session wiring in addition to the already-tested broker client. Offline
tests prove the permission, signing, and refusal cores; the live IAP-cookie handoff remains an
operator-attested leg.

The strict parser → exact resolver → bound-command adoption chain now refuses the former
first-observe-gate fallback. Existing machine legs carry explicit bindings. Drive-machinery's three
live, currently-human legs remain human because no standing machine command proves their full
success conditions; an annotation alone cannot manufacture that evidence.

## References

- ADR-0117 — members-gated write broker and builder role.
- ADR-0133 — desktop priority and the broker deferral lifted here.
- ADR-0082 — per-test UAT verdicts and the no-self-attestation guard.
- `stories/drive-machinery/uat-machine-proof-binding.md`
- `stories/drive-machinery/uat-machine-gate-resolution.md`
- `stories/drive-machinery/uat-bound-command-adoption.md`
- `apps/studio/server/writeBroker.ts`
- `apps/desktop/src/backend/forest-readiness.ts`
- `apps/studio/src/components/TreeView.tsx`
