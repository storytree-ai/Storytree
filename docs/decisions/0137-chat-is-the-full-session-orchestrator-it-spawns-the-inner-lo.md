---
status: proposed
---
# ADR-0137: Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write

## Status

proposed — directed by the owner 2026-06-29 in design discussion with the orchestrator, and drafted by
the orchestrator from that discussion (the workflow this ADR itself sanctions, decision 2). It mostly
**affirms the already-accepted ADR-0108**; what is genuinely NEW is the ADR-authoring carve-out
(decision 2) and the sharpening of *how* ADR-0108 Phase 3 is built (decision 1). Awaiting the owner's
wording-confirm to flip to accepted. Amends ADR-0108; upholds ADR-0091.

## Context

ADR-0108 already decided the shape the owner re-articulated here: a server-side session-orchestrator
runtime with **whole-loop authority** (orient → decide → decompose → route provable units to the inner
loop → gate → librarian pass → open the landing PR), running the one generated `session-orchestrator`
agent (ADR-0051), **driving the spine without ever handing in a verdict** (ADR-0091 upheld, d.5), with
**accept-to-land the permanent human gate** (d.3). Its accepted costs explicitly name that it "runs
agent-authored orchestration (decompose, **spawn subagents**, open PRs)."

But the BUILD is phased, and only Phases 1–2 are realized in the desktop chat: today it is a
**read/propose-only** headless session (`packages/agent/src/headless-orchestrator.ts` — `tools: []` +
orientation + `propose_unit`). It can orient and propose; it cannot spawn anything or drive. The
desktop-drive walk (2026-06-28) added a propose→accept→**dispatch** bridge (click Build →
`routedBuildRunner`), but the orchestrator still does not SPAWN the inner loop. So "chat brings a story
in" or "chat fixes a bug through the inner loop" is unreachable — **not because it's undecided**
(ADR-0108 decided it) but because **Phase 3 (drive authority) is unbuilt.**

The owner's framing sharpens two things ADR-0108 left implicit:

- **How the orchestrator drives** — by SPAWNING the right subagents into the strong inner-loop
  scaffolding (often literally one: the story-author to author work; the builder leaf to drive a
  change/fix red→green), which it ADHERES TO and does not reinvent. The chat gets *orchestration
  (spawn)* power, not raw `Write`/`Bash`.
- **The one thing it does NOT delegate** — authoring ADRs. The owner's reason: the orchestrator holds
  the discussion context, a handoff to a spawned subagent bleeds it, and orchestrators are precisely
  the role that sharpens discussion into a decision. (This ADR is itself an instance of that.)

## Decision

1. **The desktop chat realizes ADR-0108's whole-loop authority by SPAWNING subagents into the
   inner-loop scaffolding** — the sharpening of how Phase 3 (drive authority) is built. The
   orchestrator's power is to SPAWN and route, never to write code or sign:
   - Bring a story in (`mapped`/`proposed`) → spawn the **story-author** (the live Library write; often
     a single spawn — "literally just a story writer").
   - Bug fix / change → spawn the **inner-loop builder leaf** to drive the change red→green; the spine
     observes RED→GREEN and SIGNS, CI re-proves, the human lands (ADR-0091 + ADR-0022, verbatim).
   It ADHERES TO the existing strong scaffolding (the prove-it-gate, the phase machine, the signing
   spine) — it spawns INTO it, never reinvents or bypasses it.

2. **ADR-authoring is the orchestrator's SOLE direct corpus write.** It MAY reserve (`adr new`) and
   author an ADR body directly — because it holds the discussion context and a subagent handoff loses
   it. EVERYTHING ELSE it produces goes through a spawned subagent: the work hierarchy via the
   story-author, code/tests via the inner-loop leaf, and the decision LOG's integrity (status
   projection, supersession edges, the `load_bearing` set, graduation) via the **librarian-curator**
   (ADR-0095 / ADR-0086). The orchestrator authors the DECISION; the librarian-curator maintains the
   LOG — complementary, not overlapping. (This formalizes existing practice — CLAUDE.md already has the
   orchestrator reserve ADRs for design forks.)

3. **The boundaries are unchanged.** The deliberate whole-story go-green stays the human's forest-map
   **Adopt/Build** button (ADR-0094 / ADR-0136) — a billed, outward-facing PR is a click, not an
   autonomous act. **Accept-to-land** stays the permanent human gate (ADR-0108 d.3). The orchestrator
   NEVER hand-signs a verdict (ADR-0091's no-verdict-handed-in stands; the spine signs). The
   orchestrator's spawning handles authoring + conversational changes/fixes; the human's button + merge
   are the direct gates.

## Consequences

**Good**
- Settles HOW to build ADR-0108 Phase 3: the chat gains subagent-SPAWNING, not raw write/drive — so the
  safety is the **gate the spawned roles pass through**, not a special wall on the chat. The
  highest-leverage inner-loop-adoption lever (ADR-0128 / ADR-0129, `docs/research/inner-loop-adoption-gap.md`)
  gets a concrete, integrity-preserving build shape.
- The desktop chat becomes the SAME orchestrator the Claude Code terminal session already is (spawn
  subagents, delegate red→green, author ADRs) — one model, no special-case subset.
- The carve-out keeps decision-authoring where the context lives (no handoff bleed) while the
  librarian-curator still owns the log's integrity — the division is explicit, not blurred.

**Bad / accepted costs**
- An orchestrator that spawns the inner loop is a much larger surface than a propose-only session: it
  needs the SDK subagent/Agent-tool surface on the live runtime (ADR-0030), careful tool-scoping per
  spawned role, the single-session/concurrency guard (ADR-0108 d.6), and the turn-cap brake
  (ADR-0130 / ADR-0131). A real build arc, not a wiring increment.
- **OPEN design tension (flagged, not solved here):** how a bug fix / change — which is *not* a new
  story — becomes a provable unit the gate can drive (a new contract/test on an existing story? a new
  capability? a node-level real drive, given the node path is a synthetic smoke today, ADR-0099-B). The
  routing of CHANGES (vs. new work) into the inner loop is the next design question.

**Neutral**
- Affirms, does not retire, ADR-0108's shape and phasing; the terminal session-orchestrator is
  unchanged (it already works this way).

## References

- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the chat-driven
  session-orchestrator runtime + its phased build; this **amends/sharpens** d.3 (spawn-to-drive) and
  commits the Phase-3 build shape; affirms d.5 (no verdict handed in).
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — proof-off-tether;
  "no verdict is ever handed in" — **UPHELD** (the orchestrator holds no signing key; the spine signs).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the generated
  `session-orchestrator` agent the runtime runs.
- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) / ADR-0086 — the
  librarian-curator (graduation + log integrity); the orchestrator spawns it. ADR-authoring stays the
  orchestrator's.
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) / ADR-0136 — the
  human's forest-map Adopt/Build is the deliberate whole-story go-green.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the live Claude Agent SDK runtime (the
  subagent-capable author).
- ADR-0099-B — node `--live` smoke is synthetic; a real unit-level drive is the primitive a bug-fix
  path needs.
- ADR-0128 / ADR-0129 + `docs/research/inner-loop-adoption-gap.md` — drive authority is the lever.
- Code: `packages/agent/src/headless-orchestrator.ts` (the propose-only runtime to promote);
  `packages/agent/src/sdk-author.ts` (`ClaudeAgentAuthor` — the subagent-capable runtime).
