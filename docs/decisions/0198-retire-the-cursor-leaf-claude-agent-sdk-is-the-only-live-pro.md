---
status: accepted
decided: 2026-07-15
supersedes: [177]
amends: [30, 179]
load_bearing: true
---
# ADR-0198: Retire the Cursor leaf — Claude Agent SDK is the only live prove-it-gate harness

## Status

accepted (2026-07-15) — decided/directed by the owner in conversation on 2026-07-15. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Supersedes ADR-0177** — Cursor as a second live prove-it-gate harness (Rung A handshake, planned
`CursorPhaseAuthor`, `CURSOR_API_KEY` billing path, and the provisional `--runtime
claude|cursor|owned` selector) is retired. Flip ADR-0177 to `superseded`.

**Amends ADR-0030** — restores the live-leaf conclusion: the only admitted live prove-it-gate
author is `ClaudeAgentAuthor` on the Claude Agent SDK with subscription auth
(`CLAUDE_CODE_OAUTH_TOKEN`). The architectural core of ADR-0030 still stands (rent a capable
harness, keep the owned loop as offline/pivot-out fallback, proof stays behind `PhaseAuthor`).

**Amends ADR-0179** — the desktop credential surface drops the `cursor-api-key` kind. Hosted kinds
are `oauth` and `api-key` only.

## Context

ADR-0177 opened the leaf-runtime seam to Cursor after Anthropic programmatic credits were
exhausted. It admitted Cursor as a second rented harness behind `PhaseAuthor`, required a
`CURSOR_API_KEY`, and planned two admission rungs (read-only handshake, then synthetic
`PhaseAuthor` smoke) before any production `--runtime` selector.

Rung A landed (`packages/agent/src/cursor-handshake.ts` on `@cursor/sdk`). Rung B and the
selector never shipped — production `--live`/`--real` stayed hard-wired to `ClaudeAgentAuthor`.
Even so, the Cursor SDK path is **metered API billing** (ADR-0184): it does not ride a Cursor IDE
subscription. The owner hit unexpected API charges when that path was exercised, and directed that
no Storytree surface may invite or enable Cursor API spend again.

The Cursor IDE as an **outer-loop** work surface (this chat, Composer, generated
`.cursor/agents/*.md` per ADR-0178) is a different product: subscription-funded interactive
editing. That is not a prove-it-gate leaf and is out of scope for this retirement.

## Decision

1. **Claude Agent SDK is again the only live prove-it-gate leaf.** `resolveProveSpec` continues to
   wire `--live`/`--real` exclusively to `ClaudeAgentAuthor`. No Cursor `PhaseAuthor`, no harness
   selector, no second live author.

2. **Delete the Cursor SDK leaf machinery.** Remove `@cursor/sdk`, `cursor-handshake.ts` (+ tests),
   and all barrel exports. Do not leave a dormant import that can still bill.

3. **Stop hydrating and hosting `CURSOR_API_KEY`.** Drop it from `SECRET_KEYS` /
   `~/.storytree/secrets.json` hydration, from desktop `CredentialKind` / Credentials panel, and
   from any broker/bridge tests that treat it as a first-class runtime credential. A stray
   `CURSOR_API_KEY` in the environment must not authenticate a Claude build (existing refusal
   stands) and must not unlock a Storytree-owned Cursor run (there is none).

4. **Retire the `cursor-sdk-leaf` work hierarchy.** Remove the capability from the agent story; it
   recorded an unfinished admission probe, not a production contract.

5. **Keep ADR-0178.** Generating `.cursor/agents/*.md` for Cursor IDE project settings does not call
   `@cursor/sdk` and does not bill. Outer-loop IDE convenience stays.

6. **Correct overtaken prose in place** (ADR-0139): any accepted ADR or onboarding text that still
   names a metered Cursor leaf as a live option (notably ADR-0184's "no paid inner loop" framing)
   is updated to say the Cursor leaf is retired and live builds are Claude-subscription only.

## Consequences

**Good.**

- No Storytree path can invoke `@cursor/sdk` or hydrate `CURSOR_API_KEY` into a live agent run.
- Billing for `--live`/`--real` is again a single, understood model: Claude subscription via
  `CLAUDE_CODE_OAUTH_TOKEN`.
- The `PhaseAuthor` seam and owned-loop pivot-out remain; a future second harness would need a new
  ADR with an explicit non-metered (or owner-accepted metered) funding model.

**Bad / watch.**

- Anthropic credit / subscription exhaustion is again a hard stop for live builds until a different
  escape hatch is decided.
- Desktop credentials shrink to two kinds; any previously stored `cursor-api-key` in a member's
  keychain becomes unreachable through the UI (harmless residue — clear manually if desired).
- ADR-0177's two-rung admission evidence is historical only; do not treat Rung A as partial credit
  toward re-admitting Cursor without a fresh decision.

## References

- Superseded: [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md)
- Amended: [ADR-0030](0030-all-in-on-claude-agent-sdk.md),
  [ADR-0179](0179-desktop-credentials-are-configurable-through-the-storytree-u.md)
- Untouched (IDE outer-loop, not the leaf):
  [ADR-0178](0178-render-delegatable-library-agents-to-native-cursor-subagent.md)
- Billing framing corrected under:
  [ADR-0184](0184-machine-witness-drive-machinery-s-three-live-uat-legs.md)
- Code: `packages/agent/src/sdk-author.ts`, `packages/orchestrator/src/resolve-prove-spec.ts`,
  `packages/drive/src/secrets.ts`, `apps/desktop/src/credential/kinds.ts`,
  `apps/studio/src/components/CredentialsPanel.tsx`
