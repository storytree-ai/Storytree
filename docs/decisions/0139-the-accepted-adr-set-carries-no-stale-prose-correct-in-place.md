---
status: accepted
decided: 2026-06-29
supersedes: [86]
amends: [37]
load_bearing: true
---
# ADR-0139: The accepted ADR set carries no stale prose: correct in place, supersede on re-decision, rehome durable guidance

## Status

accepted (2026-06-29) — decided/directed by the owner in conversation on 2026-06-29. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Born `accepted` under
[ADR-0084](0084-agents-may-flip-an-adr-green.md) (an agent may transcribe an evidence-backed flip when
the owner has directed the decision). It overturns no honesty wall: status stays a PROJECTION of the
`## Status` prose ([ADR-0006](0006-event-store-observability-surface.md) /
[ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)); `green = a signed verdict`
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) is untouched — this is governance over a
DOCUMENTATION projection, not over a proof.

**Supersedes** [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — 0086
established the librarian-curated lifecycle but concluded that `supersedes_in_part` + an in-prose note
is the clean steady state, and drew its copy-on-write line (§D) so conservatively that removing
overtaken prose fell on the "new ADR" side. The result is the exact rot the owner flagged: ~20 accepted
ADRs sit *live in part* with dead prose still in the body. This ADR reverses that stance and retires the
mechanism. Per its own rule it supersedes 0086 in FULL (not in part) and restates 0086's still-true
parts below. 0086 flips to `superseded`.

**Amends** [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — narrows the frontmatter edge spec
(§1): `supersedes_in_part` is retired as an edge type, and the ADR-health suite (§3) changes
accordingly (the `supersede-in-part-note` check is removed; a new check forbids the retired edge). The
ADRs-stay-source principle (0037 "does NOT decide": "ADRs = source; artifacts = derived") is preserved
and leaned on — see Decision 5.

## Context

ADRs are append-only HISTORY and the live, iterating guidance is the Library artifacts
([ADR-0017](0017-cross-cutting-knowledge-tier.md)). But the *accepted* ADR set — what `adr list
--current` / `--load-bearing` returns, the set a new session calibrates to — had drifted into carrying
stale prose, by design:

1. **`supersedes_in_part` leaves dead prose in an accepted ADR.** When ADR-Y overtakes part of ADR-X,
   X stays `accepted` ("live in part") with the overtaken prose still in its body; the only safeguard
   (the `supersede-in-part-note` health check) requires an incoming note pointing at what's dead — it
   does not remove the dead prose. 0086 judged this clean; it is not. The canonical incident is
   [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) §5's "DBOS/Postgres durable execution
   stands", overtaken by [ADR-0019](0019-library-tier-name-and-defer-dbos.md) yet still readable as a
   live accepted decision. A session that pulls such an ADR reads guidance that is false.

2. **The set only grows.** Across 135 ADRs: 128 `accepted`, 4 `proposed`, **3 ever `superseded`** —
   despite 20 `supersedes_in_part` and 76 `amends` edges. Nothing leaves the current set, so whole
   evolution chains sit green at once and the calibrate-to-these set (52 `load_bearing`) is too large to
   be the small onboarding set it was meant to be ([ADR-0086] §A).

3. **The cost lands on retrieval.** The diagnosis behind this ADR (the owner's "orchestrators ask
   questions already answered in the ADRs" observation, 2026-06-29) found the abstraction tier is
   healthy (47 principles, 44 definitions, …) but durable guidance is often buried in ADR *bodies*,
   which are context-heavy and not the surface an orchestrator pulls. Stale-but-accepted prose makes
   that worse: even when an answer is found in an ADR, it may be dead.

0086 §D already drew the right dividing line in principle — *"does this change what was DECIDED? if
yes, copy-on-write (a new ADR); if it is a projection or a correction, edit in place"* — and listed
status flips, edge fixes, typos, and `load_bearing` as in-place. The gap is only where
**removing overtaken content** falls: 0086 read it as a substantive `## Context`/`## Consequences` edit
(→ new ADR), which is why partial overtakes became `supersedes_in_part`-with-stale-prose instead of an
in-place correction. The fix is to move that one boundary.

## Decision

**1. Invariant: an accepted ADR carries no stale prose.** Every ADR in the current set
(`status: accepted`) is true in full. The moment any claim in it is overtaken, it is made true again —
by one of the two operations below, chosen by intent.

**2. Truth-maintenance is CORRECT-IN-PLACE.** Removing or fixing **overtaken/false content to keep an
ADR true — without changing what was decided — is a correction, edited in place** (refining 0086 §D:
this is explicitly a correction, not a substantive re-decision). The prior text is not lost: ADR bodies
live only in git (the DB's `events.adr_number` logs only number allocations, never prose —
`packages/library/src/store/adr-store.ts`), so `git log -p` / `git blame` / `git log -S` is the
archive. No new ADR, no clutter.

**3. Re-decision is SUPERSEDE-AND-REPLACE.** Changing **what was decided** still copies to a NEW ADR
(atomic number, [ADR-0050](0050-adr-number-allocation.md)) that `supersedes` the old; the old flips to
`superseded` and is **kept as a file** (not deleted): other ADRs and story `decisions:` edges point at
it (the `story-decisions` gate enforces that graph), and "why we changed our mind" is worth keeping
browsable. The dividing line is unchanged from 0086 §D — *did the DECISION change?* — only the
placement of stale-content removal moves (Decision 2).

**4. `supersedes_in_part` is retired.** Edges are binary: `amends` (strictly additive — every prior
claim of the target stays true) or `supersedes` (the target is overtaken → corrected in place if the
decision stands, or fully superseded if the decision changed). "Live in part" is no longer a state. A
new ADR-health check forbids the `supersedes_in_part` frontmatter field; the `supersede-in-part-note`
check is removed.

**5. Durable guidance is REHOMED out of ADR bodies into Library artifacts.** Cross-cutting guidance
buried in an ADR body is extracted into the right `principle` / `definition` / `pattern` artifact (the
[ADR-0095](0095-graduate-durable-agent-memory-into-the-library.md) graduation mechanism, applied to ADR
bodies), leaving a lean ADR that records the *decision and its rationale* and links to the rehomed
artifact. This does not move the ADR into the Library — the ADR stays the source decision record
(ADR-0037 "ADRs = source; artifacts = derived"); it moves the *derived guidance* to the surface an
orchestrator actually pulls just-in-time. Rehoming makes the answer findable; it is the consolidation
that also fixes retrieval.

**6. Active ⟺ load-bearing.** Every `accepted` ADR is current-state by definition — if it is not
load-bearing, it should not be accepted (its content is rehomed and it is superseded, or it is genuinely
current and stays). The separate `load_bearing` tag is therefore redundant in the steady state and is
**retired at the end of the consolidation pass** (`adr list --load-bearing` becomes an alias of
`--current`); the `load-bearing-live` gate retires with it. **No hard cap** on the set size — it is the
librarian's editorial call. Until the pass completes the tag stays useful as the worklist marker: the
~76 accepted-but-untagged ADRs are the de-facto "should I still be active?" list to process.

**7. The librarian enforces this as a standing pass.** Restating and extending 0086 §B/§C: the
`session-orchestrator` spawns the `librarian-curator` before each merge ceremony
([ADR-0095](0095-graduate-durable-agent-memory-into-the-library.md) D7), and that pass now also keeps
the accepted set TRUE — correct stale content in place, supersede on re-decision, rehome durable
content — so the corpus is kept in shape every loop, not in one-off sweeps. The librarian's authority
to flip `→ superseded` and the transcribe-not-invent honesty invariant (0086 §C) are unchanged; status
remains a projection of the `## Status` prose. A CI gate (the retired-edge check, Decision 4) is the
un-bypassable floor; the semantic judgment ("this prose is overtaken", "this guidance should be
rehomed") is the librarian's, caught on the reviewed PR.

**Restated from ADR-0086 (still in force).** §A — `storytree adr list --current | --load-bearing |
--status` is the CLI-searchable current-state view derived from `docs/decisions/` on disk, never a
hand-list in `CLAUDE.md`. §C — the `librarian-curator` may flip `→ superseded` as curation, always as a
projection of the prose, never inventing a flip; `accepted → proposed` un-deciding stays human-only.

## Consequences

**Good.**
- The accepted set is true in full: an orchestrator that pulls any current ADR never reads dead
  guidance. The "DBOS stands" class of trap is structurally gone, not flagged-and-left.
- Retrieval improves as a side effect: rehoming moves durable answers out of context-heavy ADR bodies
  into the distilled artifacts the orchestrator pulls just-in-time.
- The current set stops expanding: overtaken ADRs leave it (superseded) or are corrected to stay true;
  the onboarding set shrinks toward the genuinely-current and stays small. History (the file count) is
  still append-only — that is correct; what is bounded is `adr list --current`.
- No archive clutter: truth-maintenance leaves no superseded-shell file behind; only genuine
  re-decisions keep a superseded file (where the rationale is worth browsing).

**Bad / costs / follow-on (surfaced, not buried).**
- **Decided bodies are no longer immutable.** Allowing in-place removal of stale content widens 0086
  §D's in-place set. The protection against silently rewriting a *decision* (rather than correcting
  stale prose) shifts from "the body is immutable" to: the reviewed PR diff, the librarian's
  transcribe-not-invent discipline, and git preserving every prior version. Judged acceptable for a
  solo-owner repo; the risk is a misjudged "correction" that is really a re-decision, caught on review.
- **The deleted content is in git, not in the corpus.** Recovering it is `git log -p`/`-S`
  archaeology, not `adr list`. For truth-maintenance corrections (rarely revisited) this is the right
  trade; genuine re-decisions keep a browsable superseded file precisely because they are revisited.
- **The consolidation pass is real work.** 20 `supersedes_in_part` targets to correct/supersede, 76
  `amends` edges to audit (most are genuinely additive and stay), and the ~76 untagged accepted ADRs to
  triage and rehome. Done in batches, each a reviewed PR (the librarian's standing pass), not one sweep.
- **Gate ordering.** The retired-edge check would red the gate while the 20 in-part edges still exist,
  so it lands WARN-first (or after the pass clears them) and flips to FAIL once the last edge is gone.
- This is the meta-layer (the dev repo's ADRs); it says nothing about the product story-trunk, which
  stays approval-gated ([ADR-0008](0008-ui-drives-agents-approvals.md)).

## References

- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) — superseded: the
  librarian-curated lifecycle, the `adr list` query (§A, restated), the spawn-librarian-at-landing
  discipline (§B, restated/extended), and the supersede authority (§C, restated). Its
  `supersedes_in_part`-is-clean conclusion and `load_bearing` gate (§E) are overturned.
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — amended: the frontmatter edge spec (retire
  `supersedes_in_part`) and the ADR-health suite.
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) — ADRs = source, artifacts = derived (preserved;
  rehoming moves derived guidance, not the decision record).
- [ADR-0095](0095-graduate-durable-agent-memory-into-the-library.md) — the graduation mechanism
  (memory → Library), here applied to ADR bodies; and D7, the pre-merge librarian pass this folds into.
- [ADR-0050](0050-adr-number-allocation.md) — atomic ADR-number allocation (a re-decision allocates
  through it).
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — agents may transcribe an evidence-backed flip.
- `packages/cli/src/adr-health.ts` (the gate suite to change), `packages/cli/src/adr-frontmatter.ts`
  (the edge parse), `packages/library` seed `librarian-curator` artifact (the mandate to update) — the
  encodings the enforcement unit touches next.
