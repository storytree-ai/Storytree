---
id: "offer-set-render-agreement"
tier: capability
story: context-traversal-capture
arc: context-decision-tree-arc
title: "The recorded offer set is checked against the artifact's real rendered Sources block"
outcome: "A real spawned `library artifact <id>` read's recorded candidate set is verified against an oracle read off the CLI's OWN printed Sources block rather than off the trace, so the offer set is known to be what the artifact actually offers — and the one axis where the two paths disagree is pinned rather than silently carried."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, artifact-offer-candidate-sets]
decisions: [235, 260, 312]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/offer-set-render-agreement.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/offer-set-render-agreement.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/offer-set-render-agreement.test.ts"
    sourceFile: "packages/context-traversal-capture/src/offer-set-render-agreement.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/offer-set-render-agreement.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/offer-set-render-agreement.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# The recorded offer set is checked against the artifact's real rendered Sources block

## Guidance

Author the six contracts below under these ids, VERBATIM — the leaf's test titles must name them
(`spec.contracts` never reaches the leaf, so `check:coverage` reads 0/6 unless the ids appear here):
`the-recorded-offer-set-is-verified-against-the-cli-s-own-rendered-sources-block`,
`the-oracle-derives-offer-ids-from-the-render-without-importing-the-function-it-checks`,
`the-recorded-order-is-authored-and-the-rendered-order-is-grouped-so-the-sequences-differ`,
`a-read-that-recorded-no-offer-is-reported-as-unverified-and-never-as-agreement`,
`a-label-carrying-its-own-parentheses-still-yields-the-trailing-ref`,
`a-membership-disagreement-names-the-ids-on-each-side-rather-than-a-bare-boolean`.

**WHY THIS EXISTS — the circularity the arc has not yet broken.** Four increments have landed on this
story: offers are recorded at render time (ADR-0260 D1/D2), a read declares which offer it answered
(D3), the replay draws every candidate's outcome (`decision-point-playback`), and each set states its
observable denominator (`offer-observability-share`, ADR-0312). **Every one of them verifies against
RECORDED offers** — against the traversal's own account of what it was shown. That is circular with
respect to this arc's end state, which asks for a trace "whose offers are known INDEPENDENTLY of the
traversal that consumed them". Nobody has asked the prior question: *does the recorded `candidate_set`
match what the artifact really offers?*

`resolveArtifactOffers` RE-DERIVES the offer list from argv + a store, and its module doc asserts it
reproduces "exactly the ref ids `viewArtifact`'s Sources block would print". That is an assertion about
**two independent code paths** — the telemetry's re-derivation from `doc.references`, and the CLI's
actual `groupSources` render — and nothing anywhere compares them. This capability is the comparison.

**THE ORACLE IS THE RENDERED BLOCK, NOT THE REFERENCES ARRAY.** The offer is DEFINED as what the
Sources block printed (ADR-0260 D1), so the oracle parses that block out of the real process's stdout.
Deriving it instead from `doc.references` would re-run the telemetry's own derivation and prove
nothing; importing `offerIdOf` would rebuild the same circularity one layer down. **This module
imports NOTHING from `offer-candidate-sets.ts`** and applies that module's documented id rule itself:
a leading `asset:` is stripped, every other prefix is kept verbatim.

**What the two paths were measured to do, 2026-08-06, over the live corpus (1125 artifacts, 357
carrying at least one reference, 280 carrying two or more) and confirmed end-to-end on a real spawned
read.** Both facts are load-bearing and the leaf must not "fix" either one:

- **MEMBERSHIP AGREES, everywhere. Zero divergences.** No id is dropped, added, or altered by either
  path on any artifact in the corpus. This is the substantive result: the recorded offer set really is
  what the artifact offers.
- **ORDER DIVERGES, on 177 of the 280 multi-reference artifacts (63%).** `resolveArtifactOffers`
  records `references` in AUTHORED order; the Sources block prints them REGROUPED by target type into
  `SOURCE_GROUP_ORDER` (Definitions, Principles, Patterns, Guardrails, …, Decisions (ADRs), …, Other),
  keeping authored order only *within* a group. On the fixture's `merge-ceremony` the recorded sequence
  opens with four `doc:decisions/…` ids and the printed block opens with `trunk` — same ten ids,
  different sequence.

**THE ORDER DIVERGENCE IS PINNED, NOT REPAIRED, AND THE LEAF MUST NOT CHANGE EITHER PATH.** Nothing in
the repo joins on offer position: every consumer of `candidateNodeIds` is set-based
(`decision-point-playback`'s `new Set(...)` membership test), count-based (`offer-observability-share`,
`query-render`'s `candidates=N`), or an order-preserving `.map` used only for display. ADR-0235
clause 3 independently bans ordering as evidence of causation, so no verdict anywhere moves with it.
Making the two agree is a **decision, not a repair** — it belongs to the owner and to its own ADR, and
either direction (record in group order, or print in authored order) changes a rendered surface that
signed UAT legs pin. Contract 3 asserts the divergence for the same reason ADR-0312 D5 asserts the
`list` divergence: a silent divergence is how the next drift starts.

**Do NOT touch `offer-candidate-sets.ts`, `observe-cli.ts`, `commands.ts`, `knowledge-sources.ts`, or
any other existing file.** The nine capabilities on this story all hold signed verdicts and a failed
`--real` permanently under-claims the one it ran against; editing a source file under another
capability's `real.sourceFile` also drifts its anchor. This is a NET-NEW file pair that reads existing
behaviour and asserts about it. In particular: do not reorder `SOURCE_GROUP_ORDER`, do not sort
`candidateNodeIds`, and do not add a normalisation step that hides the order difference.

**Shape — the exports from `offer-set-render-agreement.ts`:**

```ts
export type UnverifiableReason =
  | "the-read-recorded-no-library-artifact-visit"
  | "the-render-and-the-trace-both-offered-nothing";

export interface OfferSetDisagreement {
  /** Printed by the render, absent from the recorded set. */
  readonly missingFromRecorded: readonly string[];
  /** Present in the recorded set, never printed by the render. */
  readonly extraInRecorded: readonly string[];
}

export type OfferSetAgreement =
  | { readonly verified: false; readonly reason: UnverifiableReason }
  | {
      readonly verified: true;
      readonly membershipAgrees: boolean;
      readonly orderAgrees: boolean;
      readonly rendered: readonly string[];
      readonly recorded: readonly string[];
      readonly disagreement: OfferSetDisagreement;
    };

export function parseRenderedSourcesOffers(stdout: string): readonly string[];
export function compareOfferSetToRender(
  stdout: string,
  events: readonly ContextTraversalEvent[],
): OfferSetAgreement;
export function renderOfferSetAgreement(result: OfferSetAgreement): string;
```

`OfferSetAgreement` is a DISCRIMINATED UNION on `verified`, not a boolean plus optional fields: the
repo runs `exactOptionalPropertyTypes`, so optional members typecheck differently at the composition
site than at the read site. Narrow on `verified` and read the rest inside the branch.

**`parseRenderedSourcesOffers` — the oracle.** `viewArtifact` prints the block as
`lines.push("", "Sources:")`, then per group `  <Group>:`, then per item `    - <label>  (<ref>)`
(`packages/cli/src/commands.ts`). So:

1. Find the first line that is exactly `Sources:`. Absent → return `[]`.
2. Consume following lines while they begin with two spaces; stop at the first line that does not
   (a blank line, `provenance:`, `next:`, or end of input).
3. An ITEM line matches `    - ` at the start. Take the ref as the content of the **LAST**
   parenthesised group on the line, anchored at end of line — never the first. A label legitimately
   carries its own parentheses (`groupSources` labels an unresolvable pointer
   `asset:foo (unknown asset)`, so the line reads `    - asset:foo (unknown asset)  (asset:foo)`),
   and a first-match parse silently returns `unknown asset` there. A group-header line has no
   trailing `(…)` and is skipped by the same rule.
4. Apply the offer-id rule INLINE — `ref.startsWith("asset:") ? ref.slice(6) : ref` — stripping ONLY a
   leading `asset:` and only once. Do not import `offerIdOf`, and do not `import` anything from
   `offer-candidate-sets.js`.
5. Return the ids in the order printed, duplicates kept.

Total: any string in, an array out, never a throw.

**`compareOfferSetToRender` — the comparison, fail-closed.** In order:

1. Find the `library-artifact`-surface visit in `events` (narrow with `isContextVisitEvent`). Absent →
   `{ verified: false, reason: "the-read-recorded-no-library-artifact-visit" }`. This is the ADR-0260
   D4 bypass — a flagged argv observes no visit at all — and it must be reported as UNVERIFIED, never
   as agreement (`asset:unrun-check-is-unverified-not-refuted`).
2. Take the recorded ids from the `candidate_set` whose `candidateSetId` is
   `candidate-set:<that visitId>`, or `[]` if there is none. Compute the rendered ids with
   `parseRenderedSourcesOffers`.
3. Both empty → `{ verified: false, reason: "the-render-and-the-trace-both-offered-nothing" }`. A
   vacuous match is not a verification.
4. Otherwise `verified: true`. `membershipAgrees` compares the two as MULTISETS (sorted copies,
   equal length, equal element-by-element — duplicates are significant). `orderAgrees` compares them
   as SEQUENCES. `disagreement.missingFromRecorded` lists rendered ids whose recorded count is lower,
   `extraInRecorded` the converse; both are `[]` when membership agrees.

Do NOT resolve the candidate set by "the most recent one" or by scanning for any set containing a
rendered id — that is ADR-0260 D3's refused trace-side resolution. The join is the id shape
`candidate-set:<visitId>` off the visit this render produced, and nothing else.

**`renderOfferSetAgreement`** returns a single-line summary for a human reading a check: for
`verified: false`, `offer-set agreement: unverified — <reason>`; otherwise
`offer-set agreement: membership <agrees|DISAGREES>, order <agrees|differs> (rendered N, recorded M)`.
The word for a disagreeing order is **`differs`, never `DISAGREES`** — order carries no verdict.
Never throws.

**Fences.** No filesystem, no clock, no store, no id generation, no new package, no new dependency, no
network. The module is handed a stdout string and an event list and judges those. It emits no
telemetry event, so no coverage constant moves and none may be edited.

**Files.** `packages/context-traversal-capture/src/offer-set-render-agreement.ts` and
`offer-set-render-agreement.test.ts`. The package scaffold and every import already exist. Export
nothing from `index.ts` — the index export, if any, is glue authored outside this leaf's write scope
(ADR-0158).

**No `as` casts of any kind in the test file.** Narrow the `ContextTraversalEvent` union through the
exported `isContextVisitEvent` and explicit `kind` checks plus `assert.ok`, the way
`decision-point-playback.test.ts` does. The proof run is tsx-driven so types are stripped: a cast makes
the assertion prove nothing while `check:coverage` still counts the test, and the package typecheck
goes red only AFTER the verdict is signed. Annotate a composed event with its OWN member type
(`CandidateSetEvent` / `ContextVisitEvent`), never with the whole union — a union annotation is
excess-property-checked against every member.

**THE SPAWN IS NOT OPTIONAL — contracts 1 and 3 must drive the REAL CLI.** A test that hand-writes a
Sources-block string and compares it to a hand-written event list proves nothing about the two code
paths this capability exists to compare; it would re-create the circularity in the test file. Copy the
harness already proven in `terminal-capture.uat.test.ts` in this same package:

- `spawnSync(process.execPath, [LAUNCHER, ...args], { encoding: "utf8", env })` where `LAUNCHER` is
  `fileURLToPath(new URL("../../cli/launch.mjs", import.meta.url))`.
- A fixture STORE DOOR in its OWN process, started in `before` and killed in `after`:
  `spawn(process.execPath, [fileURLToPath(new URL("../../cli/fixture-door.mjs", import.meta.url))])`,
  awaiting its `PORT=<n>` stdout line, then handing the child
  `STORYTREE_STORE_URL=http://127.0.0.1:<port>`. It MUST be a separate process: `spawnSync` blocks
  this process's event loop for the child's whole lifetime, so an in-process door would deadlock.
- `STORYTREE_TRAVERSAL_DIR` at a fresh `fs.mkdtempSync` directory per case, and an explicit
  `STORYTREE_SESSION_ID`, so no run touches a real machine's `~/.storytree/traces`.
- Read the trace back with `readTraversalSession({ dir, sessionId })` from `./sink.js` — a fresh
  reader call after the child has exited, which is what makes the offers observed rather than claimed.
- Assert the child exited 0 before asserting anything about its output.

Use the fixture artifact **`merge-ceremony`** for contracts 1 and 3: its ten references span three
Source groups with the `asset:` entries authored in the middle, so it exercises both the `asset:`-strip
rule and the regrouping. Read its refs from the fixture rather than hard-coding a count that a future
fixture edit would silently invalidate — assert on the RELATIONSHIP between the two sequences, not on
a literal list.

## Contracts

1. **`the-recorded-offer-set-is-verified-against-the-cli-s-own-rendered-sources-block`**
   - **asserts —** spawn the REAL CLI for `library artifact merge-ceremony` against the fixture door,
     with a fresh trace dir and an explicit session id. Parse the offer ids out of the process's OWN
     stdout with `parseRenderedSourcesOffers`, read the trace back with `readTraversalSession`, and
     call `compareOfferSetToRender`. The result is `verified: true`, `membershipAgrees` is `true`, and
     `disagreement.missingFromRecorded` and `disagreement.extraInRecorded` are both empty. Assert
     additionally that the rendered set is non-empty and contains at least one `asset:`-stripped id
     (`trunk`) and at least one `doc:` id kept verbatim — otherwise a parser that returned `[]` would
     satisfy a membership check against a recorded set it never actually compared.
   - **why —** this is the arc's end-state clause. The oracle is the render, which is what the offer is
     DEFINED as; the recorded set comes from the trace; neither is derived from the other.

2. **`the-oracle-derives-offer-ids-from-the-render-without-importing-the-function-it-checks`**
   - **asserts —** `parseRenderedSourcesOffers` over a hand-built Sources block covering every ref
     shape the corpus carries returns `["trunk", "doc:decisions/0022-x.md", "node:some-story",
     "bare-id", "asset-like-but-not-prefixed"]` — i.e. a leading `asset:` stripped exactly once, and
     `doc:` / `node:` / bare ids kept VERBATIM. Include an `asset:asset:x` entry and assert it yields
     `asset:x`, proving the strip happens once rather than repeatedly.
   - **why —** the rule is `offerIdOf`'s, applied independently. Importing the function under test
     would rebuild the circularity this capability exists to break; this contract is what keeps the
     copy honest.

3. **`the-recorded-order-is-authored-and-the-rendered-order-is-grouped-so-the-sequences-differ`**
   - **asserts —** on the SAME real spawned read as contract 1: `membershipAgrees` is `true` while
     `orderAgrees` is `false`. Assert the cause rather than only the symptom — the recorded sequence's
     first id is a `doc:` id and the rendered sequence's first id is not, and both sequences hold the
     same ids as multisets.
   - **why —** the one axis where the telemetry's re-derivation and the real render disagree, PINNED
     rather than repaired. Nothing joins on offer position and ADR-0235 clause 3 bans ordering as
     evidence, so no verdict moves; making the two agree is an owner decision with its own ADR. A
     silent divergence is how the next drift starts (the ADR-0312 D5 precedent).

4. **`a-read-that-recorded-no-offer-is-reported-as-unverified-and-never-as-agreement`**
   - **asserts —** two cases, both `verified: false` and each carrying its own reason. (a) An event
     list with no `library-artifact` visit at all → `the-read-recorded-no-library-artifact-visit`.
     (b) A `library-artifact` visit present, no `candidate_set` recorded, and a stdout carrying no
     `Sources:` line → `the-render-and-the-trace-both-offered-nothing`. Assert in both cases that the
     result carries NO `membershipAgrees` field the caller could read as `true`.
   - **why —** ADR-0260 D4's under-report is the ACCEPTED failure mode, and a checker that reported a
     bypassed mechanism as agreement would launder it into evidence
     (`asset:unrun-check-is-unverified-not-refuted`).

5. **`a-label-carrying-its-own-parentheses-still-yields-the-trailing-ref`**
   - **asserts —** `parseRenderedSourcesOffers` over the real `groupSources` unresolvable-pointer
     shape — `    - asset:foo (unknown asset)  (asset:foo)` — returns `["foo"]`, not
     `["unknown asset"]`. Include a second item whose label carries balanced parentheses mid-string
     and assert the trailing ref still wins.
   - **why —** the ref is the LAST parenthesised group, anchored at end of line. A first-match parse
     passes every tidy case and silently corrupts exactly the offers whose target could not be
     resolved — which is the population most likely to reveal a real divergence.

6. **`a-membership-disagreement-names-the-ids-on-each-side-rather-than-a-bare-boolean`**
   - **asserts —** over a hand-built pair where the render printed `["a", "b"]` and the recorded set
     holds `["b", "c"]`: `membershipAgrees` is `false`, `disagreement.missingFromRecorded` is `["a"]`,
     and `disagreement.extraInRecorded` is `["c"]`. Assert a duplicate is significant: a render
     printing `["a", "a"]` against a recorded `["a"]` disagrees, with `missingFromRecorded` `["a"]`.
   - **why —** if the two paths ever DO diverge on membership, the finding must name what diverged.
     A bare `false` sends the next session back to re-derive the comparison by hand, and duplicates are
     exactly where a set-based comparison would lie (the same node offered twice is the `ambiguous`
     case this arc's end state names by name).
