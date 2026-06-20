---
status: accepted
decided: 2026-06-21
amends: [7, 40, 82]
---
# ADR-0083: Author-defined story green: declared obligations, machine per-test UAT, mapped as a bootstrap shortcut

## Status

accepted (2026-06-21) — drafted from a direct owner realignment in conversation, and ratified the same
day: the owner adopted **Fork A** and authorised agents to perform the green flip (recorded by
[ADR-0084](0084-agents-may-flip-an-adr-green.md)). It carried two explicit owner-ratification **forks**
(A and B below); **Fork A is RESOLVED (adopt)** and built (see below), **Fork B remains open** (a
separate session). It **amends [ADR-0007](0007-proof-model.md)** (the `mapped` framing),
**[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §2** and
**[ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)** (story-green
composition); it overturns no honesty wall (`green = a signed verdict` stands).

**Fork A — RESOLVED: adopt (2026-06-21).** The owner chipped this off toward the recommended position,
and decision 3 stands as written: **story green = (all capabilities `healthy`) AND (all per-test UAT
tests `healthy`)**, with capabilities-green a *necessary* condition (six green plants are still not
*sufficient*; a crown can never be green while any capability is red or unproven), and a story with
zero capabilities satisfying the capability clause vacuously. The READ-TIME compute is **built** —
`rollupStoryGreen` ([uat-proof.ts](../../packages/orchestrator/src/proof/uat-proof.ts), red→green
tested) beside the existing `rollupStoryUat`, wired into the CLI `story build` / `storytree tree` crown
and the studio crown (`applyUatCrowns`). This adds a necessary precondition to the read-time roll-up
ONLY; it signs nothing (the honesty walls of ADR-0020 are untouched). The owner ratified this and the
`status:` flip to `accepted` in conversation (2026-06-21); per [ADR-0084](0084-agents-may-flip-an-adr-green.md)
the flip was applied by this session. **Fork B stays open** (the brownfield / foundational machine
observe-and-sign path is a separate follow-on).

## Context

Assessing whether the two foundational **protocol-island** stories — `proof-protocol` and
`storage-protocol` ([renamed by ADR-0078](0078-rename-root-ports-role-not-position.md)) — could reach
`healthy` surfaced a real gap, and the owner's realignment of *why* it exists.

**Where the proof model stands.** `green = a signed gate verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)).
A story greens from its OWN UAT ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §2),
now decomposed into addressable per-test units (`<story>#uat-<n>`, [ADR-0044](0044-per-uat-test-human-attestation.md))
that each earn a real signed verdict by a declared `witness` (`human|machine|either`), the story
greening as the AND-roll-up of those verdicts ([ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)).
The **human** path is built (`storytree uat attest` → an `operator-attested` verdict, PR #268). The
**machine** path is "the gate" — a red→green observed by the spine.

**The wall.** A machine per-test UAT whose proof is an *already-green* suite has **no red** for the
gate to observe. `uat attest` correctly refuses a machine test and redirects it to `node build --real`
([uat.ts](../../packages/cli/src/uat.ts)) — but for a brownfield codebase, or a foundational port whose
proof *is* its passing suite, `--real` can never manufacture an honest red. So a machine-witnessed port
has no path off `mapped`. The two ports' suites are real and green
(`pnpm --filter @storytree/proof-protocol test` = 20/20; `… storage-protocol` = 13/13), yet the gate has
never driven them, so they sit at `mapped` with no exit.

**The owner's reframe (this ADR records it).**
1. `mapped` is a **bootstrap shortcut**, not an honest terminal state. Two uses: (a) **brownfield** —
   a codebase already working in production, *assume green unless disproven*; (b) **foundational
   stories** authored *before the inner-loop machinery is trustworthy* — there is no point flipping a
   story green with machinery you do not yet trust. `mapped` is meant to be **resolved** into a signed
   green, not lived in.
2. The **story author** (inner- and outer-loop) decides what is required to flip a story green — it is
   **authored, live, mutable** data, not a fixed per-tier rule.
3. A story greens when **all its capabilities are green** (their own programmatic / integration tests)
   **AND all its author-declared UAT tests are green**.
4. For a pure protocol (a shape, a seam) there is no integrated journey against real collaborators —
   **the programmatic suite IS the honest proof**. "UAT-as-prose-ceremony" is the wrong frame; a
   machine-witnessed UAT test that runs the suite is the right one.

## Decision

**1. Reframe `mapped` as a bootstrap shortcut (amends [ADR-0007](0007-proof-model.md) + the glossary).**
`mapped` stays *not `healthy`* (it is never self-reported green), but it is explicitly **transient**:
the optimistic "assume green unless disproven" state for a brownfield import, and the holding state for
a foundational story built before the inner loop is trusted. Its definition gains a stated **exit** —
a signed verdict earned through the inner loop (red→green) or, for already-green/brownfield work, the
machine observe-and-sign path (decision 4). A failing test demotes an assumed-green `mapped` node, so
the assumption is falsifiable.

**2. A story's green obligations are author-defined and live.** The story author declares what greens
the story: (a) its **capabilities**, each proven green by its own programmatic / integration tests via
the inner loop; and (b) its **per-test UAT tests** (the `## Story UAT` prose decomposition,
[ADR-0044](0044-per-uat-test-human-attestation.md)/[ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md)),
each with a `witness`. The obligation set is **mutable** — tests and capabilities are added or removed
as the story evolves (stories are live, not fixed). The per-tier `proof_mode` schema fence
([schema.ts](../../packages/library/src/schema.ts)) is unchanged; what is new is that "green" is the
**satisfaction of the declared obligation set**, owned by the author — not a single hard-coded rule.

**3. Story green = (all capabilities `healthy`) AND (all per-test UAT tests `healthy`).** This extends
[ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) d.3's per-test UAT
AND-roll-up with **capabilities-green as a necessary condition**, reconciling it with the glossary's
standing dependency rule — *"you cannot prove a unit that stands on an unproven one."* It refines
[ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) §2 / ADR-0082's *"only the
story's own UAT greens it"*: child-capability green is no longer merely *not sufficient* — it is a
**required input** alongside the story's own UAT roll-up. (Six green plants still do not make a green
crown; but a crown can never be green while any plant is red.) A story with **zero** capabilities (the
two ports) satisfies the capability clause **vacuously** — its green is entirely its per-test UAT.

> **FORK A (owner ratification) — RESOLVED: ADOPTED (2026-06-21).** Decision 3 makes capabilities-green
> *necessary* for story green, which is in direct tension with ADR-0082's just-accepted *"only the
> story's own UAT greens it; six green capability plants do not make a green crown."* **Adopted** — it
> aligns the crown with the dependency rule and matches the owner's "all capabilities green first AND
> uat green." (The alternative — keep ADR-0082 unchanged, UAT-roll-up only — was declined.) This
> affects only stories *with* capabilities; the two ports are unaffected either way. The read-time
> compute (`rollupStoryGreen`) and its crown wiring are **built** (see Status); ADR-0082's reference
> entry below is amended accordingly. The owner ratified the adoption and the `status:` flip to
> `accepted` in conversation (applied per [ADR-0084](0084-agents-may-flip-an-adr-green.md)).

**4. A machine per-test UAT earns its verdict by observe-and-sign when no red→green is available — the
brownfield / foundational "adopted" path.** The spine runs the test's declared machine proof command at
a **clean committed HEAD**, observes it green, and signs a **machine** verdict into `events.verdict`
with provenance recorded as **adopted** (distinct from a gate-driven `pass`). Every honesty wall of the
gate is preserved **except the prior-red requirement**: the result is observed out-of-band (an exit
code the spine watched, never a model claim), attributed to a resolved signer, pinned to a clean
commit, and it greens nothing unless it persists. It reuses `checkUatProof`
([uat-proof.ts](../../packages/orchestrator/src/proof/uat-proof.ts)) — a machine-witness test admits a
non-`operator-attested` verdict — and is the machine counterpart of `uat attest`. This answers the
long-deferred **brownfield mapping mechanism** ([open-questions.md §2](../open-questions.md)).

> **FORK B (owner ratification) — the drive-vs-observe split.** Red→green does two jobs: the green is
> *real / attributable / pinned* (job 1) **and** the test *provably can fail* (job 2). Observe-and-sign
> keeps job 1, drops job 2. **Recommended: split it** — capabilities (new code) earn green by genuine
> red→green through the inner loop; brownfield / foundational obligations (an existing reviewed suite)
> earn green by observe-and-sign, recorded as **adopted** so the audit trail distinguishes it from
> driven-green (exactly as `operator-attested` is distinguishable from a machine `pass`). For a
> human-reviewed existing suite, job 2 is supplied by review. The alternative is to *require* a genuine
> red→green for every machine verdict (then brownfield ports stay `mapped` until a real defect earns a
> regression leg — honest, but the ports never light up without a manufactured red).

**5. The per-test UAT unit carries its declared machine proof command.** A `machine`/`either` test
needs a command for the spine to observe. The author declares it **inline in the UAT prose** — the
backticked command already present in each `_(witness: machine)_` leg (e.g. the ports'
`` `pnpm --filter @storytree/proof-protocol test` ``) — extracted by the `parseUatTests`
([uat-tests.ts](../../packages/library/src/uat-tests.ts)) parser into an optional `proofCommand` on the
`UatTest`. This keeps "the author defines what greens the story" literal: the proof is declared where
the test is declared. (A test with no parseable command is human/either-only — it cannot be
machine-adopted, fail-closed.)

## Consequences

**Good.**
- Foundational ports and brownfield adoptions reach an **honest signed green** without faking a red;
  `mapped` becomes a transient bootstrap state with a defined exit, not a permanent dead end.
- The **author owns the green bar** — it is declared, inspectable (`storytree uat list`), and live.
- `green = a signed verdict` is **preserved**; the human path (`operator-attested`, ADR-0082) and the
  new machine-adopted path both produce real `events.verdict` rows the roll-up derives from.
- Honesty walls hold: spine observes out-of-band; no self-exempt (`sandbox:`/agent identity can never
  sign); clean tree; persists or it greens nothing.

**Bad / costs / what is left as follow-on (surfaced, not buried).**
- **Fork B trades away "the test provably failed once"** for the adopted path. Recorded with distinct
  `adopted` provenance so the world can render (and an auditor can see) the weaker basis — it is not
  silently equated with a driven red→green pass.
- **Fork A overturns a one-day-old decision** (ADR-0082's no-capability-roll-up). Called out as a fork,
  not slipped in.
- **Fork A's READ-TIME compute is now BUILT** (2026-06-21): the capabilities-AND-UAT story roll-up
  `rollupStoryGreen` (`packages/orchestrator/src/proof/uat-proof.ts`, red→green tested) is wired into
  the CLI `story build` / `storytree tree` crown and the studio crown (`applyUatCrowns`). It is a
  READ-time precondition only — it signs nothing, so the honesty walls hold untouched.
- **Still named follow-on (the rest of the DECISION):** mirroring ADR-0082's honest split — the machine
  observe-and-sign path (a `storytree uat run <test> --pg` or a `node build`/`story build` machine-UAT
  mode, **Fork B**); and the per-test `proofCommand` parse in `uat-tests.ts`. Until those land, no
  machine per-test verdict is produced, so the two ports stay `mapped` — correct, since the inner loop
  is still being made correct. (Fork A changes only how an *already-signed* per-test/capability verdict
  set rolls up into a crown; it does not by itself produce any new verdict.)
- **The two ports** already declare `_(witness: machine)_` per-test UAT legs; making those legs carry
  a concrete inline `proofCommand` (decision 5's convention) is a follow-on once that convention is
  ratified — deliberately NOT pre-baked here. They do not change status under this ADR.

## References

- [ADR-0007](0007-proof-model.md) — proof modes incl. `operator-attested` / `mapped` (amended: `mapped` reframed as a bootstrap shortcut).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed gate verdict`, preserved.
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — verdict-derived green (amended §2: capabilities-green now a necessary input).
- [ADR-0044](0044-per-uat-test-human-attestation.md) — per-test UAT units + witness (the data model decision 5 extends).
- [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) — per-test UAT verdicts + AND-roll-up (amended: capabilities-green necessary; machine path widened to include observe-and-sign).
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) / [ADR-0059](0059-gate-as-proof-authoring-nodes-earn-a-signed-verdict-via-thei.md) — gate-as-proof, the *authoring* analogue of finding a genuine red where one is not obvious.
- [open-questions.md §2](../open-questions.md) — the brownfield mapping mechanism (this answers it).
- `packages/orchestrator/src/proof/uat-proof.ts`, `packages/cli/src/uat.ts`, `packages/library/src/uat-tests.ts` — the per-test UAT compute + surfaces the follow-on builds on.
- `stories/proof-protocol/story.md`, `stories/storage-protocol/story.md` — the motivating foundational ports.
