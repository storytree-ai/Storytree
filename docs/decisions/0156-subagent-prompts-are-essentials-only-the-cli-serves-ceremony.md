---
status: accepted
decided: 2026-07-04
amends: [51, 52]
---
# ADR-0156: Subagent prompts are essentials-only; the CLI serves ceremony bodies just-in-time

## Status

accepted (2026-07-04) — decided/directed by the owner in conversation on 2026-07-04. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Grounded in a trace-based study
of 2,231 real subagent runs (the mandatory-vs-situational analysis below).

**Amends** [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) and
[ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md), without overturning
either. ADR-0052's thrust stands in full — delegatable agents are still generated, drift-gated,
harness-native `.claude/agents/*.md` spawnable files — but its §1 render choice ("`renderAgentFile`
wraps `renderAgentPrompt`", the full-body-inject keystone) is re-decided: the agent-file surface (and
`storytree agents <name>`) now render an ESSENTIALS view, not the full inline. ADR-0051 is extended —
its one renderer gains a THIRD mode (essentials) alongside the digest (CLAUDE.md, §3) and the full
prompt (SDK leaf, §4), generalising the digest's pointer-manifest to the delegation surface. This is
the natural completion of [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) over the
one surface it never reached.

## Context

[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) / `pull-based-context-architecture`
make context engineering pull-based: brief an agent thinly and let it pull exactly the slice a step
needs, from the live source, rather than pushing a fat static brief at spawn. ADR-0023/0053 realised
this as the choose-your-own-adventure CLI — every command returns an envelope (`result` + `doctrine`
POINTERS into the Library + `next`), "explore to earn the context," because static instruction is
followed less reliably than context pulled at the step that needs it.

Every runtime surface honours this EXCEPT the one that renders a spawned subagent's own system prompt.
The agent renderer has two paths (`packages/library/src/store/render-agent.ts`): `renderAgentDigest`
(thin — the agent's own prose + a pointer MANIFEST; feeds CLAUDE.md/session-orchestrator, ~1.5k
tokens) and `renderAgentPrompt` (fat — it fetches every `context`/`rules`/`antiPatterns` ref and
inlines its FULL BODY, lines 88–101). ADR-0052 pointed the `.claude/agents/*.md` surface (and
`storytree agents <name>`, agents.ts:16) at the fat path. So session-orchestrator got the thin
treatment; the seven delegatable subagents did not.

The trace evidence (2,231 subagent runs, offline transcripts):

- **The prompts are fat and static.** Each delegatable `.claude/agents/*.md` is ~3–7k tokens, 60–83%
  of it injected ref BODIES (story-author ~7.2k / 90%, librarian-curator ~7.1k, frontend-builder
  ~6.4k / 74%). The heaviest bucket is the `rules` section (full principle Why/How bodies, ~46% of
  injected bytes) — the agent only needs each rule's one-line ASSERTION resident.
- **The irony:** the agent ARTIFACTS honour `reference-dont-restate` (they hold `asset:` pointers);
  the RENDERER expands each pointer to its full body at spawn — the machine does the restating the
  principle forbids. `reference-dont-restate` prescribes injecting a unit "just-in-time at the step
  that needs it"; this injects at spawn.
- **Guidance is PUSHED, context is PULLED — and only context.** The state each agent needs is already
  pulled just-in-time: `storytree adr list` in 49% of librarian runs, `library artifact` in 25/50/67%,
  direct `Read` of the brief-named ADR in 64% of story-author runs, mirroring live sibling stories in
  98%. But the durable GUIDANCE is force-inlined and barely re-touched: librarian pulls a guidance
  body in ~3 of 119 runs and never its own ceremony bodies ("the ritual is inlined into nearly every
  brief"); frontend-builder touches the CLI in 8% of runs ("guidance is pushed in, not pulled"). The
  mandatory floor across every agent is generic orient→act→verify; the heavy ceremony/principle
  bodies are SITUATIONAL (graduation ~30% of librarian runs, ADR reservation ~7% of story-author
  runs, operator-attest ~45% of frontend runs) yet inlined into 100% of spawns.
- **Nothing keeps it lean.** `check:agents` (build-agents.ts) is a pure DRIFT check (missing / stale /
  orphan); no size or essentials gate exists anywhere. CLAUDE.md is human-read, so its bloat was
  audited into the digest; the `.claude/agents/*.md` files are machine-only, so nothing pressured
  them to stay thin. (Two of the seven — `graduation-synthesist`, `friction-analyst` — render full
  ~3.2k-token files and were never spawned once.)

## Decision

The `.claude/agents/*.md` surface and `storytree agents <name>` render an **essentials-only** view; the
CLI is the just-in-time retrieval surface for everything else, reusing ADR-0023/0053 unchanged.

1. **Essentials only, inline.** A rendered subagent prompt carries only: (a) the agent's OWN prose —
   role, authority boundary, workflow shape, escalation (kept verbatim; this is the signal); (b) a
   FLOOR CHECKLIST; (c) an ESCAPE HATCH; (d) per-step DOORS. No full ref bodies inline.

2. **The floor is a checklist of assertions, not bodies.** Every `rules` + `antiPatterns` ref renders
   as its ONE-LINE ASSERTION — the imperative itself ("never self-exempt from the gate") — resident
   and unmissable — plus a `storytree library artifact <id>` pull-hint for the rationale. Safety rests
   on **assertion + fence, not on the inlined body**: every hard refusal is ALSO enforced in code (the
   prove-it-gate spine, the write-scope PreToolUse hook, CI approval-gated-trunk), so a body that was
   not read cannot become a bypass. Per `guidance-quality`, a resident imperative backed by a code
   fence is stronger structure than a 400-token body skimmed once at spawn. A refusal not yet
   independently fenced is a candidate to BECOME a fence (flagged follow-up, not a blocker here).

3. **The escape hatch — escalate UP when blocked or out of scope.** Every delegatable subagent carries,
   as a required inline element, the manager-first escalation rung: when it hits *"this isn't my job"*
   (outside its role/authority), *"I have no process for this"* (no step/ceremony covers it and a pull
   did not surface one), or *"a capability gap blocks me until infrastructure is built"* — it STOPS and
   hands the situation UP to the **session-orchestrator** (the manager) with the reason, in its return
   message. It does NOT force-fit the work into a hollow proof and does NOT silently skip it. This is
   the subagent-side trigger for `orchestrate-route-supplement`'s "raise the capability gap and
   EXPAND"; it completes the escalation ladder **specialist → manager (orchestrator) → owner**
   (`human-owns-the-outer-loop` is the manager→owner rung; this adds the specialist→manager rung). It
   MUST be inline, never a pull: an agent cannot pull the instruction to stop once it is already past
   the point of knowing it should. A new guardrail artifact
   (`escalate-up-when-blocked-or-out-of-scope`, authored by guidance-curator during the build) is
   cited in every delegatable agent's floor and renders as an assertion under rule 2.

4. **Wiring the pull to the step (option c): the step→ceremony map lives once.** Each agent artifact
   gains a STRUCTURED association of workflow step → the ceremony/pattern refs that step needs
   (authored once, in the Library). The renderer GENERATES from it: the on-disk file's per-step door
   lines AND a `storytree agents <name> --step <step>` affordance that serves just that step's
   envelope. Navigation is NOT re-implemented in the prompt — it stays the existing ADR-0023 `next:`
   envelope chain: pull one ceremony, follow its `next:`/DAG onward. Repo files (ADRs, stories, source)
   continue to be pulled by direct `Read` of the brief-named path; Library BODIES (ceremonies /
   patterns / principles) route through `storytree library artifact <id>` or
   `storytree agents <name> --step`. This keeps the map DRY (move a procedure once, every door stays
   right) and avoids the mild restatement a hand-written per-step prose index (the rejected "option b")
   would reintroduce.

5. **A size/structure gate, so it cannot silently re-bloat.** A new check (extending `check:agents`)
   fails the build if a rendered `.claude/agents/*.md` exceeds a token budget, if any ref's full BODY
   appears inline (only assertions + pointers are allowed), or if a `context` ceremony ref is not
   attached to a workflow step (no "just-in-case" riders) — the fence the surface never had.

6. **Build order is CLI-first, then thin, then rollout.** Sequence as provable units: (i) the
   structured step→refs schema + the `storytree agents <name> --step` retrieval affordance land FIRST
   (thinning the prompt before the pull path is solid would strand the agents in the gap); (ii) then
   the essentials renderer repoints the agent-file surface + `storytree agents <name>`; (iii) then the
   size/structure gate; (iv) then roll out to the four well-behaved agents whose workflow steps are
   already clear — `librarian-curator`, `story-author`, `guidance-curator`, `corpus-investigator`.
   **`frontend-builder` folds in only after its process revisit** (its steps and inner-loop fit are
   under separate investigation; its two-stage visual-proof process is legitimately different and not
   yet decomposed). `graduation-synthesist` / `friction-analyst` get the thin render but need no
   step-map until they are actually spawned.

## Consequences

- **Good.** Each spawned prompt drops ~60–83% (per-spawn 3–7k → ~1–2k tokens), and — more important
  than size — it becomes FRESH (bodies read live at the step, never a spawn-time snapshot) and DRY
  (one Library source, no N-copy drift). The floor stays safe (assertion + code fence). The escape
  hatch prevents the failure a thin prompt could otherwise invite — improvising a process, force-fitting
  a hollow proof, or silently skipping — by making "stop and hand up to the manager" the sanctioned
  move. The CLI choose-your-own-adventure becomes the single retrieval system for guidance, exactly as
  ADR-0053 intended.
- **Cost / sharp edges.** A cold `storytree` pull is ~5s, so pulls are STEP-triggered, never up-front —
  the floor + escape hatch are inline (zero pulls to be safe), and because each situational process
  fires in a fraction of runs the expected pulls/run stay low; pulling everything up front would just
  move the bloat into onboarding latency. The step→refs association is a schema addition on the agent
  artifact plus a one-time curator migration to populate it across the four agents. `frontend-builder`
  is blocked on its process revisit before it can join. A new gate is one more thing to keep green.
- **Net.** Completes ADR-0053 over the last surface ADR-0052 left on full-inline; unifies the on-disk
  `.claude/agents/*.md` file and `storytree agents <name>` on one essentials envelope; leaves the
  harness-native delegation path (ADR-0052) and the harness-agnostic pull model (ADR-0030) both intact.

## References

- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the agent renderer / render modes (amended: +essentials mode).
- [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) — the `.claude/agents` surface (amended: its render function re-decided).
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) / [ADR-0053](0053-cli-builds-its-guidance-prose-from-the-library.md) — the choose-your-own-adventure CLI envelope this reuses / completes.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is ratification (this ADR born accepted).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — harness-agnostic pull-based context (untouched).
- Principles/patterns: `pull-based-context-architecture`, `reference-dont-restate`, `signal-and-noise`, `guidance-quality`, `orchestrate-route-supplement` (the capability-gap escalation this triggers).
- Code: `packages/library/src/store/render-agent.ts` (`renderAgentPrompt` / `renderAgentDigest` / `renderAgentFile`), `packages/cli/src/agents.ts`, `packages/cli/src/build-agents.ts`.
- To author during the build: the `escalate-up-when-blocked-or-out-of-scope` guardrail (guidance-curator); the structured step→refs schema field (library organism).
- frontend-builder process revisit: tracked separately (spawned task, 2026-07-04).
