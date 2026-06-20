---
status: proposed
decided: 2026-06-08
---

# ADR-0024: A definition earns its place only if a cold agent can't reconstruct it (the blind-reconstruction test)

## Status

proposed (2026-06-08) — a pruning discipline for the authored corpus. Sharpens
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md)'s structured-source tier and the
authoritative glossary ([ADR-0002](0002-work-hierarchy-story-capability-contract.md)); motivated by
[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)'s context engineering (every token an
agent reads is paid for, so redundant context is a cost, not a courtesy). First applied to
`docs/glossary.md` on 2026-06-08 (49 terms tested, 11 removed). Applied a second time on 2026-06-20 to
three Library artifacts (`deep-modules`, `recursive-decomposition-patterns`, `exploration-principles`):
all three are §2-reconstructible generic craft, but all three were **kept** under §6 because the
now-wired corpus (ADR-0051/0053) inlines each into live agent prompts — they are load-bearing
cross-references, not shelf items (see §6's added clause). The open question proposing their prune
(`oq-prune-reconstructible-guidance`) was resolved *keep* and retired.

## Date

2026-06-08

## Context

The glossary, the ADRs, and the Library artifacts are an **authored corpus an agent reads to do its
work** (ADR-0011: pull-based, just-in-time context). Authored prose has an asymmetric failure mode:
adding a definition feels free, so the corpus accretes entries that restate what any competent agent
already knows. Those entries are not neutral — under owned context engineering every one is tokens an
agent spends and a sentence an author maintains. A glossary that defines `ndjson`, `ADR`, or `red-green`
from first principles is paying to tell the reader what the reader brought with them.

The hard part is telling **generic knowledge** (the reader already has it) from **genuinely ours** (a
term we redefined, narrowed, or coined — e.g. `asset` is *not* v1's `asset`; `studio` is *not* a
read-only dashboard; `verdict` is reserved for a story's UAT). The author is the worst judge of this:
having written the project, they can't un-know it, so every term *feels* load-bearing. We need an
external arbiter that does **not** share the author's context.

A model with no project context is exactly that arbiter. If an agent — given only its training, or
only a neutral sketch of the project — reconstructs an entry's operational meaning, the entry taught
the reader nothing the reader didn't already have. The owner reaches for this "blind test" often; this
ADR makes it the corpus's pruning rule rather than an ad-hoc instinct.

## Decision

1. **The earns-its-place bar: keep a definition only if a cold agent, given a neutral project
   preamble, gets it *wrong*.** If a blind agent reconstructs the entry's operational meaning, the
   entry is redundant with what the reader already brings and is a deletion candidate. The corpus
   documents what the reader *can't* derive, not what's true.

2. **Two conditions, because there are two distinct ways to be redundant.** Test each term twice,
   blind:
   - **raw** — term name only, no project context. Landing here ⇒ the term is **generic industry
     knowledge** (`deep-modules`, `ndjson`, `ADR`, a CI `gate`).
   - **preamble** — a short, neutral project sketch (see §4), no glossary. Landing here but not raw ⇒
     the term is **derivable from our framing** (`node rollup` falls out of "append-only event log +
     status as projection"; `UAT` falls out of the proof-tier framing).
   - **neither** ⇒ **genuinely ours** — keep. These reliably encode a redefinition or a distinction
     drawn *against* a sibling/v1 meaning, and blind agents fall into exactly the trap the entry
     exists to prevent.

3. **"Close enough" is a correct-usage test, not a prose match.** The question a judge answers is:
   *would a reader handed the blind attempt instead of our entry use the term correctly here, and not
   be misled?* Ignore wording, polish, and missing citations; judge the operational substance and any
   project-specific distinction the entry deliberately draws. An attempt that captures the gist but
   inverts the load-bearing decision (e.g. defines `trunk` as auto-merge-on-green, the exact v1 posture
   we reversed) has **not** landed.

4. **The preamble must not contain the vocabulary under test.** Feeding the project's own nouns into
   the preamble tests the agent's reading comprehension, not the term's necessity. The preamble states
   what the project *is* in plain language and stops short of the words being tested. A loaded
   onboarding doc (e.g. `CLAUDE.md`) is the wrong preamble for this reason.

5. **Blind means blind: definers are isolated from the answer.** The agents producing definitions get
   no tools, no file access, and never see the canonical entry. A separate **judge** — and only the
   judge — reads the canonical entry as ground truth and rules on each condition. Keeping definer and
   ground truth apart is what makes the signal honest.

6. **Structural integrity overrides the test (a deliberate, recorded exception).** A blind-reconstructible
   term is still **kept** if removing it breaks a definitional set or a load-bearing cross-reference —
   e.g. `contract` is reconstructible from the tier framing, but deleting it orphans the
   `story > capability > contract` triad and leaves `capability` ("composed of **contracts**")
   dangling. The test finds *candidates*; coherence of the document is a veto. Such overrides are noted,
   not silent.

   **A Library artifact that another artifact cites is a load-bearing cross-reference — including one
   inlined into an agent's prompt.** Once the corpus is a wired pull surface (ADR-0051/0053), an
   agent's `context`/`rules`/`antiPatterns` list inlines the *full body* of every `asset:` it names,
   and sibling principles compose against it by name. So a blind-reconstructible artifact that an agent
   pulls (or another artifact references) is held under this veto exactly as `contract` is: pruning it
   dangles those refs and breaks the `storytree agents` render / the `check:claude` gate. The raw test
   (§2) flags such an artifact as a *candidate*; it does **not** mandate the prune. First map the
   citations — `storytree library tree focus <id>` lists the inbound edges — and prune only if nothing
   load-bearing depends on it, cleaning every ref in the same change (§7's fold-the-nuance rule applies
   to the cross-refs too). A blind-reconstruction flag is a prompt to *check*, never a license to delete.

7. **The verdict drives an edit, not an autopilot.** High-confidence "reconstructed" terms are removed;
   borderline (single-condition, low-confidence, or nuance-dropping) results are surfaced for an owner
   call, not auto-deleted. When a deleted entry carried a real nuance that lived nowhere else (e.g.
   `UAT`'s "against *real* collaborators"), that nuance is folded into a surviving entry rather than
   lost.

8. **Scope: the authored, human-facing corpus — not code, tests, or evidence.** This governs the
   glossary first, and generalises to any place we write a definition or explanation a reader could
   already supply (ADR prose, Library artifact bodies, `--help` text). It does **not** touch
   machine-checked artifacts: tests, schemas, signed verdicts, and the event log earn their place by
   *enforcement*, not by being non-obvious, and `verification-wins` already governs them.

## Consequences

- **A repeatable harness, not a one-off.** The procedure is: enumerate entries → for each, run a raw
  definer and a preamble definer (both tool-blind) → a judge compares both to the canonical entry and
  classifies generic / derivable / ours with a confidence → remove high-confidence reconstructions,
  surface the rest. The 2026-06-08 glossary pass ran this over 49 terms (147 agents) and removed 11:
  `UAT`, `contract test`, `event log`, `node rollup`, `gate`, `red-green`, `deep-modules`,
  `fail-closed-on-dirty-tree`, `steering`, `ADR`, `ndjson`. `contract` was reconstructible but kept
  under §6.
- **The corpus shifts toward distinctions.** What survives is overwhelmingly terms defined *against*
  something — a v1 meaning, a TS-name collision, a sibling concept. That is a healthy signal: the
  glossary's job is disambiguation, not encyclopaedia.
- **It is itself an instance of `verification-wins` for prose.** Instead of the author asserting "this
  entry is needed," an external check decides it. The arbiter is an LLM with no stake in the text.
- **Cost is real but bounded.** A full pass is a fan-out of cheap, short agents; run it on demand (a
  glossary review, an ADR cleanup), not in CI. The judge needs the canonical text but the definers do
  not, so it parallelises cleanly.
- **Re-runnable as training data drifts.** "Generic knowledge" is defined by what models already know,
  which moves. A term generic today may need re-adding if the ground shifts, or vice-versa; the test is
  the standing rule, its verdicts are snapshots.

## What this does NOT decide

- **A confidence threshold or cadence as policy.** When to run a pass, and how aggressive to be, stays
  a judgment call per review; this ADR fixes the *method*, not a schedule or a numeric cutoff.
- **Whether to automate it as a gate.** It is a discretionary review tool today, not a merge gate. A
  CI hook ("flag glossary entries a blind agent reconstructs") is plausible later but not decided here.
- **The canonical preamble text.** The neutral sketch is regenerated per corpus/area (the glossary's
  is not the ADRs'); §4 fixes the constraint (no tested vocabulary), not the words.
- **Application beyond authored prose** — code/comment pruning is a different problem with different
  arbiters (tests, type-checks) and is out of scope.
- **Slimming `CLAUDE.md` itself.** The observation that the onboarding doc is too loaded to serve as a
  test preamble (§4) is noted; cutting it down is separate work.

## References

- [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (owned, pull-based context — why
  redundant prose is a cost), [ADR-0002](0002-work-hierarchy-story-capability-contract.md) (the
  authoritative glossary this prunes), [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) /
  [ADR-0013](0013-structured-corpus-markdown-as-view.md) (the structured source the glossary is a view
  of), [ADR-0023](0023-library-cli-choose-your-own-adventure.md) (friction-driven, not front-loaded
  guidance — the same "don't pre-load what the reader can get on demand" instinct).
- `docs/glossary.md` (first target; 11 entries removed under this rule).
- Design conversation, 2026-06-08 (the blind-test instinct, made a corpus rule).
