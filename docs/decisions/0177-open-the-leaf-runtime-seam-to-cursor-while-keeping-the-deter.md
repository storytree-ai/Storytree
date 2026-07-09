---
status: accepted
decided: 2026-07-09
amends: [11, 30]
load_bearing: true
---
# ADR-0177: Open the leaf-runtime seam to Cursor while keeping the deterministic spine

## Status

accepted (2026-07-09) — decided/directed by the owner in conversation on 2026-07-09. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0030** — its architectural core stands: rent a capable live harness, keep
the owned loop as the deterministic fallback, and hold proof outside every leaf behind
`PhaseAuthor`. Overtaken is the stronger **Claude-only / all-in** conclusion and the funding premise
that made one live harness sufficient. Claude remains a supported implementation; it is no longer
the only admitted live implementation. **Amends ADR-0011** — its deferred pivot trigger has fired,
but this decision still refuses a speculative many-provider registry: one second implementation
must prove the seam before the abstraction grows.

**Correction ([ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md), per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** Cursor IDE does
read `.claude/agents/*.md` as a compatibility source. Cursor's native project-subagent contract,
including for SDK project settings, is `.cursor/agents/*.md`; Storytree generates both directories
from the same Library agent population. Decision 6 is corrected in place below; the runtime-seam
decision is unchanged.

## Context

ADR-0030 deliberately rented the Claude Agent SDK as storytree's live leaf. The decision was safe
because the important trust boundary stayed owned: `packages/orchestrator` sequences phases,
observes RED/GREEN itself, and signs the verdict; the runtime only authors. `packages/agent` also
kept the small owned loop (`Model` → `runTurn` → `ToolExecutor`) as an offline executor and pivot-out
target. The resulting `PhaseAuthor.author(phase, prompt)` seam is real and heavily exercised.

The operational premise has now bitten: the owner's Anthropic programmatic credits are exhausted,
while useful non-Anthropic models are available through the Cursor coding harness. This is exactly
the pricing/funding pivot class ADR-0030 said the seams must make cheap. Continuing to bind every
live/real build directly to `ClaudeAgentAuthor` would turn an available architectural escape hatch
into a paper promise.

Cursor now publishes a TypeScript SDK (`@cursor/sdk`) for local and cloud coding agents. It can
discover the models available to the caller, run a local agent against a supplied workspace, stream
events, resume sessions, expose MCP/custom tools, and distinguish startup failures from terminal run
failures. It is a plausible second **harness** implementation. It is not provider independence:
inference still runs through Cursor's hosted model service, model availability is account-dependent,
and a `CURSOR_API_KEY` is required.

There are important safety differences. Local Cursor agents can execute built-in write/shell tools
without an interactive approval prompt by default; custom tools are local-only; hooks are file-based
rather than per-run callbacks; Auto-review is best-effort rather than a security boundary; and the
current official sandbox documentation does not establish a Windows sandbox backend. A Cursor leaf
therefore earns admission only by proving that Storytree's phase-specific write fence cannot be
bypassed. Model quality alone is not sufficient.

Google ADK was suggested as a possible spine. That is the wrong placement. Storytree already owns a
small deterministic spine whose value is reproducible sequencing, out-of-band proof, event
persistence, and signed verdicts. Replacing it with an agent framework would move the trust base into
the rented runtime and duplicate control flow Storytree already tests. Google ADK may be reconsidered
later as a leaf adapter if a concrete Google-managed capability (for example Agent Engine or A2A)
requires it; no such requirement exists now.

Finally, ADR-0174 retired the in-app interactive work-orchestrator in favour of an embedded terminal,
and ADR-0175 reserved the old chat engine for a future `app-guide`. A model-portability experiment
must not accidentally resurrect that retired interactive runtime or consume the deferred
`app-guide` journey. The portability target is the proof leaf behind `PhaseAuthor`.

## Decision

1. **Keep the deterministic spine unchanged.** `packages/orchestrator` continues to own phase order,
   proof execution, clean-tree checks, signing, verdict persistence, and halt-is-never-a-pass.
   Cursor, Claude, the owned loop, and any future runtime are untrusted authors. No runtime reports
   RED/GREEN or hands in a verdict.

2. **Admit Cursor as the first second live harness behind `PhaseAuthor`.** Build a
   `CursorPhaseAuthor` (final name may follow package conventions) in `packages/agent`. The spine
   consumes only `PhaseAuthor`; the runtime is first injected through the existing
   `authorOverride`/resolver test seam. The first implementation does not change `ProveSpec` or
   `proveUnit`.

3. **Prove admission in two bounded rungs.**
   - **Rung A — read-only handshake:** discover an available model with `Cursor.models.list()`, run a
     local SDK session with no write authority, and normalize startup failure, terminal status,
     model/run identity, text, tool events, latency, and usage. This is a runtime probe, not a new
     desktop chat product and not the deferred `app-guide`.
   - **Rung B — synthetic `PhaseAuthor` smoke:** author Storytree's existing synthetic red/green pair
     through the prove-it-gate. Expose only Storytree-owned scoped file operations and fixed feedback
     doorbells. Demonstrate that built-in shell/write/edit paths cannot bypass the
     `AUTHOR_TEST`/`IMPLEMENT` fence. The spine independently observes RED then GREEN.

   Rung B is refused if the Cursor SDK cannot provide a fail-closed policy boundary on the supported
   host. A useful model with an uncloseable write bypass is not an admitted build leaf.

4. **Do not add a production runtime selector until both rungs pass.** After admission, add one
   explicit harness selector (provisionally `--runtime claude|cursor|owned`) at the
   `resolveProveSpec` composition boundary. `--model` remains the selected harness's model identifier.
   Claude remains the default until the Cursor live leg is operator-attested. Model identifiers are
   discovered/capability-checked, never assumed from a hard-coded cross-account list.

5. **Keep runtime SDK imports in the agent organism.** Provider/harness SDK imports belong only in
   `packages/agent`; `packages/orchestrator`, `packages/drive`, the CLI, desktop, and studio consume
   Storytree-owned types. This generalises ADR-0004's single-runtime-import-site discipline from
   Anthropic to every model runtime.

6. **Reuse owned prompts and tools, not runtime-specific prompt forks.** Cursor IDE can read
   `.claude/agents/*.md` as a compatibility source; the Cursor SDK's native committed contract is
   `.cursor/agents/*.md`. Storytree therefore renders both from the same Library agent population
   ([ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md)) and adapts
   Storytree-owned tool descriptors at the runtime edge. Dedicated proof roles remain direct phase
   prompts rather than generic subagents.

7. **Keep credentials and observability explicit.** `CURSOR_API_KEY` joins the user-level
   `~/.storytree/secrets.json` allowlist only when the live adapter lands; environment still wins.
   Every live experiment records the runtime, discovered model/parameters, run identity, terminal
   status, policy denials, turns/usage where available, latency, and the spine's independent proof
   observations. A paid/authenticated live call is operator-attested, never a standing offline test.

8. **Do not adopt Google ADK or LangGraph as the spine.** They may inform patterns or later implement
   a leaf, but deterministic Storytree control flow does not move into them.

9. **Defer provider-independent raw-model work.** A later increment may adapt the owned `Model` seam
   to Vercel AI SDK (Gemini first, then one second provider) to gain independence from both Cursor and
   Anthropic hosting. That is a separate evidence-backed step, not part of the first Cursor harness
   increment and not a reason to invent a provider registry now.

## Consequences

**Good.**

- Anthropic credit exhaustion no longer stops progress once the second leaf passes the same honesty
  walls as the first.
- The pivot is small by construction: the proof ruler, story sequencing, verdict protocol, Library,
  and drive machinery do not move.
- Cursor gives one harness access to multiple hosted models and lets the project compare them without
  first rebuilding a coding harness per provider.
- The two-rung admission sequence buys evidence before exposing a user-facing selector or trusting a
  new runtime with writes.
- The implementation creates a clean fresh-session boundary: this ADR and the bounded
  `agent` → `cursor-sdk-leaf` recommendation are the onboarding contract; the implementation session
  need not inherit the exploratory conversation.

**Bad / watch.**

- Cursor is a second rented harness, not provider independence. Its billing, model catalogue, service
  availability, and account entitlements remain external dependencies.
- Storytree must maintain two runtime adapters and normalize materially different event, tool,
  permission, resume, and error models.
- Cursor's file-based hooks and permissive local defaults may make a phase-specific write fence
  impossible or awkward on Windows. The correct outcome in that case is a failed Rung B, not a weaker
  gate.
- The current code leaks Claude SDK types (`SdkQueryFn`, `Options`, SDK `tool()` values) into several
  agent-internal roles. The first leaf does not justify a broad `AgentSessionRuntime` abstraction;
  duplication is accepted until the second implementation reveals the smallest honest common shape.
- Existing docs that equate `--live`/`--real` with Claude and subscription funding must be updated when
  the selector lands, not prematurely during the probe.
- The `story-author` found no sanctioned live write boundary for story/capability/contract units:
  `storytree story` builds but does not author, while `library artifact new|edit` accepts knowledge
  documents rather than work-hierarchy units. The intended placement is the existing `agent` story,
  with a new `cursor-sdk-leaf` capability depending on `phase-author-seam`, but that hierarchy remains
  deliberately unpersisted. The implementation session must resolve or explicitly escalate this
  authoring-capability gap before runtime code; it must not hand-edit around the role boundary.

## References

- ADR-0004 — orchestrator/agent boundary and single runtime import site.
- ADR-0011 — owned loop, thin `Model` seam, and the deferred provider pivot (amended here).
- ADR-0020 / ADR-0091 — spine-observed red/green and spine-only verdict signing.
- ADR-0030 — Claude Agent SDK live runtime and pivot-out by architecture (amended here; Claude
  remains supported while its all-in/exclusive premise is corrected in place per ADR-0139).
- ADR-0110 — owner direction at design time is ratification.
- ADR-0174 / ADR-0175 — embedded terminal replaces the interactive work-orchestrator; chat
  infrastructure is reserved for `app-guide`.
- `packages/agent/src/{phase-author,model,sdk-author}.ts`
- `packages/orchestrator/src/{resolve-prove-spec,prove-it-gate,owned-loop-author}.ts`
- Cursor TypeScript SDK documentation: `https://cursor.com/docs/sdk/typescript`
- Google ADK model/runtime documentation: `https://google.github.io/adk-docs/`
