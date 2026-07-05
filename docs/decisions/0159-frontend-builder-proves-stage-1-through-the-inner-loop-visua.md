---
status: accepted
decided: 2026-07-05
amends: [70]
load_bearing: false
---
# ADR-0159: frontend-builder proves Stage 1 through the inner loop; visual self-QA is a first-classed witness

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

frontend-builder (ADR-0070) proves a visual unit in TWO stages: Stage 1 red-green on the provable
geometry/behaviour, Stage 2 operator-attested on the appearance. ADR-0070 §5 named two capability gaps
as UNBUILT at authoring time (2026-06-17):

- **Gap A** — no visual-attestation *phase* in the prove-it-gate machine.
- **Gap B** — "Stage 1 through `node build --real` needs the spec-borne `proofCommand` to drive the
  studio vitest suite (the dogfood path has been node:test-centric)."

With Gap B unbuilt, frontend-builder's Stage-1 proof fell back to hand-running the package test
(`pnpm --filter studio test`). That was the correct interim workaround — but a hand-run is an
*outer-loop* run the spine never observes, so it produces no signed verdict. The recurring cost: caps
frontend-builder builds and gate-lands stay `status=proposed build=unregistered`, and the story crown
reads short on cap-health (the `frontend-builder-gate-land-skips-real-verdicts` symptom).

**Gap B has since shipped.** ADR-0057 §3 expansion B added the spec-borne `proofCommand`, which lets the
spine spawn an arbitrary red/green oracle — including `pnpm --filter studio exec vitest run <file>` — for
the CONFIRM observations and the leaf's feedback tool alike (`packages/orchestrator/src/proof-config.ts`;
the `drive-machinery/proof-command-vocabulary` cap). Story-authors already provision it: **18
studio/frontend caps carry a `--real` vitest `proofCommand` today** (e.g. `stories/studio/chat-panel.md`,
`stories/spawn-visibility/chat-panel-spawn-render.md`, `stories/library-review/review-mode-toggle.md`).
The inner loop can prove-and-sign frontend caps; frontend-builder's guidance simply predates the
capability and was never revisited — the `pnpm --filter studio test` it hand-runs is the SAME assertion
the spine would observe as the `proofCommand`, minus the signed verdict.

Separately, frontend-builder's Stage-2 visual self-QA — the screenshot only a human eye can finally judge
— is reinvented per run: the leaf hand-writes a throwaway capture script each time (`.roads-qa.mjs`,
`chrome --headless --screenshot`), re-hitting the occluded-tab trap (`preview_screenshot` hangs on a
hidden tab) and producing unrepeatable evidence. A reusable Playwright harness already exists in the repo
(`apps/desktop/e2e/harness.mjs`, `apps/studio/playwright.config.ts`) but the guidance never points at it.

## Decision

Re-author frontend-builder's process guidance (its Library `agent` artifact — seed-canonical, ADR-0055)
so its two-stage proof fits the inner-loop model as it stands today. Three changes; the two-stage
boundary and the operator-attested look are preserved unchanged.

1. **Stage 1's provable core routes through the inner loop.** frontend-builder decomposes a visual unit
   (`orchestrate-route-supplement`), then routes the provable core — geometry generators (`Vec2[]`) and
   component behaviour (jsdom) — through `storytree node build <cap> --real --store pg` (or `story build
   --real --store pg` chained by `depends_on`), so the spine observes red→green via the cap's
   `proofCommand` and SIGNS the verdict. This is what earns cap-health and clears `unregistered`.
   Hand-running `pnpm --filter studio test` as the proof of record is retired — it is a local feedback
   tool, not the proof.

2. **A cap missing an adequate `proof.real` block routes to story-author, never a silent hand-build.**
   The `proof.real` block (with the vitest `proofCommand`) is authored where the cap is authored — the
   story spec, owned by story-author (`route-structural-forks-to-story-author`). If a frontend cap lacks
   one, frontend-builder RAISES it rather than falling back to the unobserved hand-run. This is the
   structural fence that stops the `unregistered` recurrence at source.

3. **Visual self-QA is first-classed as a witness capability, not a per-run script.** A new Library
   pattern, `render-and-witness-a-flag-guarded-surface`, captures the reusable discipline: push
   machine-checkable visual facts DOWN into Stage-1 assertions first (a screenshot is not a substitute
   for an assertion you can write); witness the irreducible look with the committed Playwright harness +
   the `preview_*` MCP, not a fresh throwaway script; keep the capture feedback-only. The look still
   earns an operator-attested verdict the human signs (ADR-0007 / ADR-0070 §3) — never self-signed; the
   orchestrator stands the experience up (`stage-the-attestation-experience`).

This **amends** ADR-0070's operational posture (Gap B is closed; Stage 1 routes through `--real`). The
two-stage model, the operator-attested boundary, and the named Gap A (an in-gate visual-attestation
phase) are unchanged — Gap A remains an optional future build; Stage 2 continues to be recorded via the
existing attestation path (`storytree uat attest`, a `human`/`either` UAT leg), not a dedicated gate
phase.

Scope note: this ADR changes guidance CONTENT only. The agent-render MECHANISM (essentials-prompt + JIT
CLI pull, re-deciding ADR-0052 on a parallel arc) is out of scope; this ADR's Decision steps + their
attached ceremonies/assets are the step→mapping input that arc consumes for frontend-builder.

## Consequences

- Frontend caps built through the re-authored process earn signed spine verdicts and `check:coverage`
  credit (`coverage-gate.ts` scans the cap's `proof.real.testFile`, `.tsx` included), so a green story
  crown honestly reflects proven visual work — closing the `unregistered` gap BY CONSTRUCTION rather than
  by post-hoc `adopt`.
- The ADR-0097 `adopt` path (observe-gate `(covers:)`) remains the honest RECOVERY for caps already
  landed gate-only; the re-authored process is the honest PREVENTION (route through `--real` up front).
  The two are peers (ADR-0105), not rivals.
- Visual self-QA stops being reinvented per run; the occluded-tab trap is designed out (the harness's
  headless capture, not `preview_screenshot` on a hidden tab). This is the LIGHT option the owner chose:
  standardise on the existing harness, no new package/verb built now; a committed witness helper or a
  `storytree witness` verb is a possible follow-on story if reinvention persists.
- No change to the spine, the proof schema, or story specs — the `proofCommand` capability and the 18
  wired caps already exist. The only build is corpus authoring (this ADR + the new pattern + the
  re-authored agent artifact).

## References

- Amends: [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) (the two-stage
  proof; Gap A / Gap B) — Gap B now closed.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) §3 expansion B (the
  spec-borne `proofCommand` that shipped Gap B) · [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)
  (the prove-it-gate) · [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) /
  [ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md) (adopt as the peer
  recovery) · [ADR-0007](0007-proof-model.md) (operator-attested, never self-granted) ·
  [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (born-accepted) ·
  [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) (the agent tier is
  seed-canonical).
- Code: `packages/orchestrator/src/proof-config.ts` (`RealProofConfig.proofCommand`),
  `packages/cli/src/coverage-gate.ts` (`proof.real.testFile` coverage scan).
- Library: `asset:render-and-witness-a-flag-guarded-surface` (new); `asset:frontend-builder` (re-authored);
  `asset:orchestrate-route-supplement`, `asset:route-structural-forks-to-story-author`,
  `asset:stage-the-attestation-experience`.
