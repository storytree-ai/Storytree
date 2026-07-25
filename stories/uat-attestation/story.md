---
id: "uat-attestation"
tier: story
title: "UAT attestation — each UAT test earns green by its witness; a vouch never forges a green"
outcome: "A story's UAT is a set of individually-addressable tests, each declaring a witness (human, machine, or either). A test earns a real signed verdict by its witness — a machine proof, or a human's 'I saw it work' operator attestation — and the story's own UAT greens as the AND-roll-up of those per-test verdicts. A separate, lower-rigor vouch ('I also eyeballed it') stays in the detail view, distinct from a gate-proven pass, and never greens the story. No path ever forges a green."
status: proposed
proof_mode: UAT
# Arc membership (ADR-0183 / ADR-0209): a RESHAPED child of the `model-uat-promotion` arc. This story
# is the historical home of the per-test witness model ADR-0209 amends; its classified binary witness
# enum is superseded by the three-kind tiered model authored in the arc's first increment
# `stories/model-uat-witness`, while `either` remains legacy-only parse compatibility until the staged
# corpus migration completes. See the ADR-0209 reconciliation note below. This story's own
# (still-unbuilt) vouch-vs-proof + AND-roll-up journey is otherwise untouched.
arc: model-uat-promotion
capabilities: [uat-test-units, attestation-signals, attestation-surface]
depends_on: [studio, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, library]
decisions: [44, 82, 209]
---

# UAT attestation — each UAT test earns green by its witness; a vouch never forges a green

**Outcome —** A story's UAT is a set of individually-addressable tests, each declaring a witness
(human, machine, or either). A test earns a real signed verdict by its witness — a machine proof, or
a human's "I saw it work" operator attestation — and the story's own UAT greens as the AND-roll-up of
those per-test verdicts. A separate, lower-rigor vouch ("I also eyeballed it") stays in the detail
view, distinct from a gate-proven pass, and never greens the story. No path ever forges a green.

The deciding ADRs are [ADR-0044](../../docs/decisions/0044-per-uat-test-human-attestation.md) — which
refines ADR-0040's story-level human-witness signpost down to the individual UAT test (a story has one
tree but many UAT test criteria, and "always allow both" human and machine) — and
[ADR-0082](../../docs/decisions/0082-per-test-uat-test-criteria-earn-green-by-declared-witness-story-uat.md),
which **supersedes-in-part ADR-0044 §2/§3**: a human stamp on a declared-human test is now a *real
signed verdict* that greens it (ADR-0007's `operator-attested` mode), not only a never-green signal,
and a story's own UAT greens as the AND-roll-up of its per-test verdicts. The honesty rule is
untouched: green is still a signed verdict, and no one can forge one.

> **Reconciliation — ADR-0209 (the `model-uat-promotion` arc) supersedes-in-part this story's witness
> model.** ADR-0209 (accepted 2026-07-17) amends ADR-0082 to add a THIRD witness kind: a criterion now
> resolves to deterministic `machine`, capability-tiered `model` (a rubric-bound read-only model judge,
> tiered `advanced` / `frontier`), or irreducible `human`. The binary `witness: human | machine |
> either` this story's design floor and `uat-test-units` capability describe is therefore **overtaken
> for classified criteria**: `model` is a distinct new kind (not a spelling of `machine`), while
> `either` remains only as a legacy parse/unresolved compatibility state for existing untagged
> criteria until the explicitly staged corpus migration completes. Legacy `either` can never carry a
> model tier or enter model judgment by default; new and migrated criteria classify explicitly as
> `machine | model | human`. That three-kind tiered witness model + its eligibility registry is authored in the
> arc's first increment, [`stories/model-uat-witness`](../model-uat-witness/story.md), as the
> packages-forward `@storytree/model-uat` port in its OWN `packages/model-uat` building (ADR-0192).
> The existing Library parser stays library-owned until explicit consumer adapter/re-export glue moves
> it behind that port; the new story claims no proof-bound `packages/library` source. The
> independent spine-signed model JUDGE run, the per-criterion seed-canonical Library detail artifact, the
> Studio row concision, and the three-story pilot migration are later arc increments. This story's own
> vouch-vs-proof + AND-roll-up journey (below) is unbuilt (`proposed`) and untouched by ADR-0209 except
> for the witness enum; read the sections below as pre-ADR-0209 history for the binary enum, and defer to
> `model-uat-witness` for the resting witness model.

## Design floor (ADR-0044, reconciled by ADR-0082)

- **Granularity = the UAT test.** Both a proof and a vouch attach to one test, not the whole story.
- **Both witnesses, first-class.** A test declares `witness: human | machine | either`.
- **Two tiers, never conflated:**
  - A **proof** is a real signed verdict in `events.verdict`, earned by the test's witness — a
    `machine` proof, or a `human`'s `operator-attested` sign-off signed by a real person. It greens
    the test, and the story's own UAT crown greens as the AND-roll-up of its per-test verdicts
    (`rollupStoryUat`, ADR-0082 d.3). A sign-time guard (`checkUatProof`) keeps it honest: a
    machine-witness test can't be greened by a click, and an agent can never self-attest a human
    test — so a green is never forged.
  - A **vouch** is the lower-rigor `events.attestation` "I also eyeballed it" mark (signer, witness,
    note, `relayedBy` when an agent scribed for a human). It lives in a separate log, NEVER in
    `events.verdict`, never paints the gate-green hue, and never rolls up (ADR-0044 d.2/d.3 stand,
    scoped to the vouch).
- **Distinct, in detail.** The proof tier and the vouch tier are never conflated on any surface.
  `storytree tree <story>` carries BOTH in separate columns — `proven=✓/✗/–` read from
  `events.verdict`, and the ◉/▣ vouch mark read from `events.attestation`. The studio row carries the
  SIGNED verdict only: one right-edge glyph whose shape is the witness (robot/person) and whose colour
  is the verdict. *(Corrected 2026-07-26: the ⚑/⚐ vouch this bullet used to promise in the panel was
  REMOVED from the row by an owner UX call — two look-alike actions confused the sign affordance,
  `apps/studio/src/components/TreeView.tsx`. `/api/attestations` still carries the vouch marks; the
  panel just never renders them.)*

## Capabilities (3)

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`uat-test-units`](uat-test-units.md) | A story's UAT steps become stable, addressable test units, each declaring whether a human, a machine, or either can attest it. | proposed | — |
| 2 | [`attestation-signals`](attestation-signals.md) | A per-test attestation persists as an append-only signed signal (human or machine), with relayed-by provenance, separate from gate verdicts and never rolled up. | proposed | `uat-test-units` |
| 3 | [`attestation-surface`](attestation-surface.md) | The story detail (panel + CLI) shows each UAT test's PROVEN verdict (the signed gate state that can green the story) distinct from its lower-rigor vouch (never green). | proposed | `attestation-signals` |

## UAT Test Criteria (would-be)

The bold lead is each test's title; the `(witness: …)` tag declares who may attest it (parsed by
`uat-test-units` into `<story>#uat-<n>` ids — absent ⇒ `either`).

> **Per-leg witness (ADR-0209 §1 / ADR-0106 / ADR-0070). RE-ADJUDICATED 2026-07-26** under the
> ADR-0209 §8 corpus-wide migration. This story resolves to **six `machine` legs and one `human` leg;
> no leg is model-judged** — nothing here turns on semantic judgment of prose or artifacts, so the
> model rung genuinely does not apply. (It is also structurally unreachable from a story's prose today:
> `UAT_TEST_CRITERION_WITNESSES` in `packages/library/src/uat-test-criteria.ts` is
> `human | machine | either` and THROWS on `model`, and `proof-protocol`'s `UatWitness` is
> `human | machine`. The gap between ADR-0209's three-kind model and that enum is an OPEN owner fork
> carried by the arc — recorded here, not settled here.)
>
> **This story is ABOUT attestation, so read its legs carefully.** A leg that DESCRIBES human
> witnessing does not thereby NEED a human witness. Legs 2 and 5 were tagged `human` because their
> subject matter is an operator's signature and an operator's vouch — but their success conditions are
> a verdict's shape, its signer, and the ABSENCE of a write, every one of which has a compiler and is
> already exercised offline today (`packages/orchestrator/src/proof/uat-proof.test.ts`,
> `apps/studio/server/uatVerdict.test.ts`, `apps/studio/server/uatAttestApi.integration.test.ts`,
> `apps/desktop/src/backend/local-uat-attest.test.ts`, `packages/cli/src/uat.test.ts`,
> `packages/cli/src/attest.test.ts`). Under `human-witness-is-a-judgment-gap-not-cost` the human rung is
> for a success condition with NO compiler — never for a leg whose *topic* is humans, and never for a
> refusal (an agent that cannot self-attest, a click that cannot green a machine leg, a vouch that
> cannot reach `events.verdict`) — a refusal is among the most machine-checkable things there is.
>
> Exactly **one** leg stays `human`, on the NO-COMPILER basis — not spend, not an outward-facing
> action: whether the two rigor tiers actually READ as different to a person (leg 7). Everything
> STRUCTURAL about that distinctness — which glyph, which colour, which column, which state can even
> reach the row — is machine-observable and is leg 6; only the legibility verdict is irreducible, and
> `apps/studio/src/index.css` already records the row's icon styling as owner-attested art (ADR-0070).
>
> **Stale prose corrected before it became executable (2026-07-26).** The old leg 6 asserted that the
> studio panel shows a `✓/✗/–` PROVEN glyph "distinct from the lower-rigor vouch (⚑/⚐)". That is FALSE
> against the panel today: an owner UX call REMOVED the ⚑/⚐ vouch from the row (two look-alike actions
> confused the sign affordance — `apps/studio/src/components/TreeView.tsx`), and the row now carries ONE
> right-edge glyph whose SHAPE is the witness (robot/person) and whose COLOUR is the signed verdict; the
> `/api/attestations` payload still carries the vouch marks, the panel just never renders them. The
> two-mark display survives only on the CLI (`storytree tree <story>`). Tagged `machine` against the old
> wording, leg 6 would have been a false red against correct code. It is restated below to what the
> surfaces actually do; the Design floor and [`attestation-surface`](attestation-surface.md) carried the
> same drift and are corrected there.
>
> **Nothing here is green.** Per ADR-0209 §6 a substantive criterion change invalidates the old green,
> so every leg below is UNSTAMPED and earns green only under its newly-declared witness. This story is
> `proposed` and its section is `(would-be)`: tagging a leg `machine` with no spec yet is the honest
> classification, not a claim that a proof exists. No owner attestation has ever been recorded against
> any leg of this story, so the standing open call — *does an owner attestation carry forward onto a
> SPLIT leg, or must it be re-signed?* ([`wisp-as-story-claim`](../wisp-as-story-claim/story.md), open
> modeling call 1, for the owner to settle once and generally) — does not bite on the leg-6 split here.
>
> **Ordering note (leg ids are POSITIONAL, `uat-attestation#uat-N`).** Legs 1–5 keep their positions:
> `packages/cli/src/attest.test.ts` uses `uat-attestation#uat-2` and `uat-attestation#uat-3` as fixture
> ids, so *Human verdict* and *Machine* must stay at 2 and 3. The old leg 6 was narrowed IN PLACE and
> its irreducible human half APPENDED as leg 7 rather than interleaved.

1. **Decompose** _(witness: machine)_: a story's UAT prose resolves to addressable test ids with
   witness kinds. **Success —** each test has a stable id and a `witness`.
2. **Human verdict** _(witness: machine)(detail: uat-attestation#uat-2)_: a permitted operator
   signs "I saw it work" for a human-witness test — the studio row's muted person icon, or
   `storytree witness attest <story>#uat-<n> --pg` (the ADR-0118 canonical verb; `uat attest` still
   works as a back-compat alias). **Success —** a signed `operator-attested` verdict lands in
   `events.verdict` carrying the VERIFIED operator identity as `signer` (never client-supplied) and
   the commit it attests as `commitSha`, having passed `checkUatProof` — which refuses an empty
   signer, a `sandbox:` identity, and the building session itself — and that test reads PROVEN ✓.
   *(Re-adjudicated `human` → `machine` 2026-07-26: the leg's SUBJECT is a human signature, but its
   success condition is a verdict's shape, signer and derived state, all of which have compilers.)*
3. **Machine** _(witness: machine)_: an automated UAT run proves a `machine` test. **Success —** a
   signed machine verdict for that test id; it reads PROVEN ✓.
4. **Story roll-up** _(witness: machine)_: every per-test verdict for the story passes.
   **Success —** the story's own UAT crown greens as the AND-roll-up (`rollupStoryUat`); a single
   signed `fail` withers it.
5. **Vouch never greens** _(witness: machine)(detail: uat-attestation#uat-5)_: a lower-rigor vouch
   ("I also eyeballed it") is recorded for a test — `storytree witness vouch <story>#uat-<n> --pg`
   (the ADR-0118 canonical verb; `storytree attest` still works as a back-compat alias), or
   `POST /api/attestations`. **Success —** it lands in `events.attestation` only (signer,
   `relayedBy` when an agent scribed); `events.verdict` is untouched, the test's derived PROVEN state
   and the story-UAT roll-up (`rollupStoryUat`) are unchanged, the island hue is unchanged, and no
   green is forged. *(Re-adjudicated `human` → `machine` 2026-07-26: this is an ISOLATION claim — the
   load-bearing half is the absence of a write — and an absence is machine-observable.)*
6. **The proof tier and the vouch tier are never conflated on any surface.**
   _(witness: machine)(detail: uat-attestation#uat-6)_ With one test carrying a signed verdict, one
   carrying only a vouch, and one carrying neither, read both surfaces. **Success —**
   `storytree tree <story>` renders the two in SEPARATE columns — `proven=✓/✗/–` derived from
   `events.verdict`, and the ◉/▣ vouch mark derived from `events.attestation` — and no vouch ever
   produces a `proven=✓`; the studio row surfaces the SIGNED verdict ONLY (one witness-shaped glyph
   coloured by `events.verdict`), so no vouch state can reach the row at all even though
   `/api/attestations` still carries it; and `storytree witness list` carries the `proven=` column
   with no vouch column. *(Restated 2026-07-26 to what the surfaces actually do — see the stale-prose
   note above — and re-adjudicated `human` → `machine`: which mark, which column, and which state can
   reach a row are all structural.)*
7. **A vouch never READS as a gate-proven pass.** _(witness: human)(detail: uat-attestation#uat-7)_
   The owner looks at a story whose UAT carries all three states — one test PROVEN, one carrying only
   a vouch, one blank — in the studio panel and in `storytree tree <story>`, and judges whether the
   rigor tiers are unmistakable: can a reader tell, WITHOUT being told, which mark is a gate verdict
   that can green the crown and which is only "I also eyeballed it"? **Success —** the owner's
   stage-2 visual verdict (ADR-0070) that the vouch cannot be misread as a proof.
   *(Operator-attested and irreducible — the one success condition in this story with NO COMPILER.
   The basis is the judgment gap, not spend and not an outward-facing action. Leg 6 proves the marks are structurally different, which is NOT the same claim as a person
   reading them as different rigor; `apps/studio/src/index.css` already records the row's icon styling
   as owner-attested art. Split out of the old leg 6 on 2026-07-26, which fused this verdict with the
   structural claim.)*

## Resolved modeling calls

- **In-UI human signing** (an admin signs an attestation directly, no agent relay) — RESOLVED by
  ADR-0082: the studio "I saw it work" button (PR #271) and `storytree uat attest` (PR #268) sign an
  `operator-attested` verdict from a verified identity (the in-UI signature ADR-0044 §4 deferred).
- **Per-test green by witness** (whether a per-test signal can become a real gate verdict) — RESOLVED
  by ADR-0082: a declared-human test earns a real `operator-attested` verdict and a machine test a
  machine proof; the story's UAT greens as the AND-roll-up. A vouch remains a vouch (never green).
