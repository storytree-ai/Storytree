---
status: accepted
decided: 2026-06-14
amends: [31, 33, 36, 38]
---

# ADR-0040: Proof paints the world — verdict-derived green and the human-witness signpost

## Status

accepted (2026-06-14) — direct owner decisions, made 2026-06-14 in conversation and recorded the
same day. **Amends [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) in part** (the
*display* half of "health is a projection of signed verdicts" — the projection itself stands and
is now actually rendered), **amends [ADR-0033](0033-session-presence-notice-board.md) in part**
(owner decision 4's ✓/✗/– glyph vocabulary **in the studio world only** — the `storytree tree`
CLI glyph column stands unchanged: text has no foliage), and **amends
[ADR-0036](0036-story-world-studio-visualisation.md) / [ADR-0038](0038-story-world-vocabulary-recalibration.md)**
(the visual vocabulary: hue now carries proof, badges leave the world, the signpost is
repurposed). It also supersedes the 2026-06-12 tree-UI legend-audit finding "the signpost is
load-bearing, don't delete" (a PR #67-era observation, not an ADR) — that finding predates
hue-from-verdict; the signpost survives, repurposed as the human-witness mark.

*Numbering note:* checked all remote branches for `docs/decisions/0040*` on 2026-06-14
(post-`git fetch`) — 0039 is the latest taken; 0040 is free.

## Date

2026-06-14

## Context

ADR-0031 settled that **health is a projection of signed verdicts** — a REAL promotion lands
*code*, never *status*; `events.verdict` is where proof lives. But the studio world only ever
projected the *negative* half: a signed ✗ withered a capability, while a signed ✓ changed no
foliage — proof showed up as a small ✓/✗ disc badge (capabilities) and a ✓/✗ signpost (the
story's own UAT), with green foliage still painted solely by the authored `status: healthy`.
That left two doors open:

1. **Hand-painted green.** Authoring `status: healthy` was the only way to a green crown or
   plant — exactly the self-reported health ADR-0031 exists to prevent.
2. **The same bit twice.** Once hue derives from the verdict, a ✓ badge next to a green plant
   repeats one bit of information — ADR-0038's "delete what explains itself" standard applies.

Separately, the story tier needs an honest answer to *who must witness a UAT*. The notice-board
chain (`storytree story build`) drives the story's own UAT node last; for most stories that UAT
is a human ceremony — a machine signing it would be a forged witness. Some stories will earn a
fully scripted UAT (the `stories/studio` Playwright shadow, `apps/studio/uat/story-uat.spec.ts`,
is the canonical future candidate), but its gate wiring does not exist yet.

## Decision

Seven owner calls, one coherent reshape of how proof is displayed and witnessed:

1. **Capability green derives from the signed verdict — no human sign-off at capability grain.**
   A capability whose latest signed verdict in `events.verdict` is a `pass` renders GREEN
   (healthy foliage). Authored `status: healthy` **stops painting capabilities green** — the
   verdict is the only green source at that tier (otherwise the hand-painting door reopens); an
   authored `healthy` with no signed pass under-claims to **mapped** (brownfield: real, not yet
   proven). The authored ladder keeps its other jobs (proposed = amber, mapped = brown,
   retired = absent, building wears proposed — ADR-0038). **Wither semantics are unchanged**:
   last signed run failed OR authored unhealthy — and authored `unhealthy` wins even over a
   signed pass (the disagreement shows in the panel's verdict line, never as a green plant).
   The seam is `provenStatus` in `apps/studio/src/lib/worldStatus.ts`: everything downstream of
   the fetch still sees only the presented world.

2. **Story green = the story's OWN UAT verdict only.** The existing no-roll-up decision
   (ADR-0033 owner decision 4) is unchanged: the crown goes deep-green only from a signed pass
   on the story's UAT node, never from child verdicts — six green plants do not make a green
   crown. A signed UAT *fail* withers the crown (same `provenStatus` fold).

3. **Story writers declare who witnesses the UAT.** New optional story-frontmatter field
   `uat_witness: human | machine` (`UatWitness` on the `Story` tier in
   `packages/core/src/schema.ts`; plumbed through the orchestrator's `loadNodeSpec` and the
   studio tree payload). **Absent = human** — fail-closed toward requiring the operator. The
   defaulting lives in ONE place, core's `effectiveUatWitness` (re-exported through
   `@storytree/orchestrator` so the studio dev server's lazy import reaches the same helper the
   gate uses). Gate enforcement: `storytree story build` REFUSES to drive or sign the story UAT
   node when the effective witness is human — the capability nodes still build; the story node
   is WITHHELD from the chain with a clear message (and needs no test-command registry entry,
   since the gate never drives it). Machine-witnessed stories proceed normally. **No existing
   story flips its declaration in this change** — all stories stay undeclared (= human).
   `stories/studio` is the canonical future machine-witness candidate (its Playwright UAT
   shadow is fully scripted), but its gate wiring doesn't exist yet, so declaring it now would
   be aspirational.

4. **The ✓/✗ tick badges leave the world UI.** Once hue carries proof, the badge is the same
   bit twice (ADR-0038's "delete what explains itself"). Removed: the per-capability verdict
   disc, the signpost's ✓/✗ glyph, and the island nameplate's `· UAT ✓/✗` suffix. Precise
   verdict facts (pass/fail/never-built + timestamp) STAY in the story panel / capability cards
   (`VerdictLine`, the sub-DAG card marks) and tooltips. The CLI `storytree tree` glyph column
   is UNCHANGED (`packages/cli` tree / tree-verdicts): text has no foliage, so the glyphs stay.

5. **The signpost is repurposed as the human-witness mark.** Only `uat_witness: human` stories
   (including the undeclared default) render a signpost; machine-witnessed stories get none.
   It stands **dashed-blank** until the story's UAT verdict is signed, then shows a **filled
   seal** in the verdict's hue — the FILL is the new bit (the ceremony happened); the hue is a
   deliberate small echo of the crown. A signed fail reads distinctly: withered crown + a red
   seal vs. a blank sign.

6. **Offline under-claims.** With the DB down / verdicts absent, hues fall back to the authored
   ladder — a proven world reads amber/brown, never green: the world under-claims, never
   over-claims. The StoreBanner is the global "proof layer absent" signal; the legend's proof
   row states this.

7. **Named later work — recorded, deliberately NOT implemented:**
   - **Verdict ageing.** A ✓ is pinned to a commit; code drift after promotion should
     eventually age/demote the green (ADR-0016 staleness territory).
   - **The human-witness signing ceremony.** Today no machinery records a human-witnessed
     story-UAT verdict into `events.verdict`, so every signpost honestly stands blank; how the
     operator's ceremony gets signed and persisted is its own decision.
   - **Wiring `stories/studio`'s scripted UAT into the gate**, after which it can honestly
     declare `uat_witness: machine`.

## Consequences

- The studio world finally renders ADR-0031's projection both ways: the six proven
  notice-board capabilities read green from their signed passes while their authored status
  stays `proposed` forever — and nobody can paint a green plant by editing frontmatter.
- `storytree story build library --dry-run` now proves the chaining as 7/7 capabilities signed
  plus a WITHHELD story node (the library story is undeclared = human). Proving the full
  chain *including* a story UAT node requires a machine-witnessed story — the gate tests use a
  temp one.
- An invalid `uat_witness` value fails the spec load loudly (zod enum) — never a silent
  default.
- The legend's proof row speaks the new vocabulary: proven green / withered / awaiting
  witness / witnessed, plus the offline under-claim note. The `legendFacts` badge facts
  (capPass/capFail/signPass/signFail/anyUnproven) are replaced by hue + signpost facts.
- The world is now *less* precise at a glance about never-built-vs-offline (the dropped
  "no-mark" badge state); that distinction lives in the panel's `– never built` line and the
  StoreBanner, which is where an operator already has to look to act on it.
