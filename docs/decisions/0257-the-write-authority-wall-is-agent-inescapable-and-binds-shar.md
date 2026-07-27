---
status: accepted
load_bearing: true
decided: 2026-07-27
amends: [255]
---
# ADR-0257: The write-authority wall is agent-inescapable and binds shared checkouts

## Status

accepted (2026-07-27) — decided/directed by the owner in the review session that followed
[ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md)'s landing. The
owner reviewed the four amendments below and directed *"okay sounds good make the updates"*.
Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md).
ADR-0255 D1, D2, D3, D5, D6 and D8 stand unchanged and are re-affirmed here: the primary checkout is
a read-only agent lobby, write authority is a live claim-bound workspace rather than a prompt, claim
before workspace stays literal, the rule is harness-neutral with harness-specific adapters, one
workspace session holds one wisp, and the cross-surface proof is behavioural. This ADR re-decides
**D4** (where the authority layer lives) and **D7** (what happens when the ledger is unreachable),
and adds two scope clauses D1 and D7 left open. It does **not** relax the invariant; it makes the
invariant buildable now instead of blocked on machinery that does not exist.

## Context

ADR-0255 correctly diagnosed the 2026-07-26/27 loss-of-isolation incident: prompts cannot enforce
what only an authority boundary can. Its ceremony is already real code —
`packages/cli/src/worktree-create.ts` mints identity, takes the exploring claim, and only then
performs `git worktree add`, refusing without `--pg`. What was missing was never the ceremony. It
was that nothing compelled a session to use it: `deriveIdentity()` returns `null` in the primary
checkout, `check:declared` deliberately skips it, and `.claude/settings.json` carries no pre-write
refusal at all. The lobby has a sanctioned door and an unguarded one.

Four problems in ADR-0255's own enforcement design keep that second door open in practice.

**1. D4 forbids the only boundary either supported harness can supply today.** D4 requires an
OS/runtime filesystem boundary or a write broker, holds that a project-local hook is insufficient
"where the harness lets a user disable, distrust or bypass it", and closes: "A platform that cannot
supply that boundary is read-only until it can." On Windows there is no practical OS boundary here —
the same user identity runs the agent and the legitimate `git worktree add`, and an ACL denying
write to the checkout must still grant `.git`, which ADR-0255's own Consequences section names as
reopening the escape. The honest reading is therefore that Claude Code desktop, the compatibility
default runtime (ADR-0030), is read-only indefinitely, and the ADR ships no wall at all in the
meantime.

That requirement also rests on a conflation. D4's stated bar is that enforcement be "outside model
discretion" and that "no agent may approve or select its own escape hatch" — a claim about the
*agent*. Its rejection of hooks is a claim about the *user*. Those are different threat models, and
ADR-0255 D7 already requires the human one to remain open: "Emergency recovery or primary
maintenance is an explicit human/elevated operation outside the normal agent writer profile."
A boundary a human can lift is not a defect under D7; it is D7's requirement.

The repository already ships exactly this boundary, fail-closed, on both supported surfaces:
`packages/agent/src/sdk-author.ts` holds the Claude Agent SDK leaf's write scope in a `PreToolUse`
hook, and `packages/agent/src/codex-scope-hook.mjs` applies the same policy to the Codex leaf, which
already layers hook plus OS profile — the belt-and-braces model D4 describes — per ADR-0232. One
distinction ADR-0255 does not draw is load-bearing here: those adapters cover *spawned leaves*,
where the spine controls the invocation. An interactive desktop session is launched by the user, so
its only injection point is settings. That is a genuinely weaker adapter and must be recorded as
such, not assumed equivalent.

**2. D7 collides with two accepted, load-bearing ADRs it does not cite.** D2 and D7 refuse a write
whenever the ledger is unreachable. ADR-0255 cites neither
[ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) nor
[ADR-0114](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md). Under ADR-0250 a
remote session can *never* reach the ledger — the fence is TLS re-termination, structural and not
workaroundable — so D7 makes every remote session permanently incapable of any repository write,
rather than merely degraded. Under ADR-0114 the hosted DB sleeps 01:00–07:00 Sydney by design, with
cold starts observed near twenty minutes, so D7 halts all agent writing for roughly a quarter of
every day. ADR-0255's Consequences frame offline as transient downtime; it is in fact a standing
structural exclusion of a whole session class plus a daily outage.

**3. D1's "ignored" clause prevents the lobby bootstrapping its own escape.** D1 forbids creating or
modifying files in the primary working tree, "tracked, untracked or ignored". But minting a
workspace requires `pnpm storytree worktree create`, which requires `node_modules` in the lobby, and
the ceremony itself runs `git fetch`, `git worktree add` and `pnpm install`. D3 gestures at the
tension — the lobby "does not gain a generic write-capable shell merely because Git must update the
common directory" — without resolving which artifact classes the trusted actuator may touch.

**4. The incident's actual hazard is co-tenancy, and D1 does not say so.** What made 2026-07-26/27
severe was that fourteen descendants inherited one *shared physical* checkout, leaving it stale,
dirty and the sole copy of hours of work. A remote session runs in an ephemeral isolated container
with no co-tenant to strand. Binding the rule to every checkout rather than to shared ones is what
forces problem 2 to be handled as an exception instead of falling out of scope naturally.

## Decision

1. **The authority layer's bar is agent-inescapable, not unbypassable — and a fail-closed pre-tool
   policy meets it.** Replacing ADR-0255 D4's first bullet: enforcement must be impossible for the
   *agent* to disable, select around, or approve its way past. A fail-closed `PreToolUse` policy
   that runs before every generic write path — file edit/patch tools, shell/process execution, and
   write-capable MCP or plugin tools — satisfies this bar and is the required boundary today. It
   canonicalises actual target paths and validates repository/worktree/claim/branch identity; in the
   lobby, ambiguous shell commands are denied rather than guessed read-only. A human with
   filesystem access can still lift it, and that is D7's sanctioned recovery path, not a defect.

2. **The OS/broker boundary is the target state, not the entry price.** A filesystem permission
   profile or write broker remains the strongest form and stays the goal, layered under the pre-tool
   policy exactly as the Codex leaf already layers them (ADR-0232). ADR-0255 D4's closing sentence —
   that a platform which cannot supply that boundary is read-only until it can — is **withdrawn**.
   A supported harness is compliant once its fail-closed pre-tool policy is proven by D8's
   behavioural bar. Both surfaces share one policy module; only the adapter that installs it is
   harness-specific. The interactive-session adapter installs through settings and is recorded as
   weaker than the spine-controlled leaf adapters, which is a known and accepted difference in
   strength, not a difference in the rule.

3. **The lobby keeps a narrow, enumerated write allowlist so it can mint.** Amending ADR-0255 D1:
   the prohibition binds **source** — anything under version control or that would appear in a
   diff. The trusted actuator may additionally write Git metadata required by `worktree create`
   (`.git`, including the common directory and `worktree`/`fetch` state) and local tooling artifacts
   that are ignored and reconstructible (`node_modules`, build caches, `*.tsbuildinfo`). The
   allowlist is enumerated, not inferred from `.gitignore`: an ignored file that is not on it is
   refused. Nothing else in the lobby is writable, and the allowlist never widens to a generic
   write-capable shell.

4. **A minted worktree carries its claim receipt, so ledger loss degrades instead of bricking.**
   Amending ADR-0255 D7: `worktree create` stamps the granted claim — session id, branch, unit ids,
   grade, grant time — into the workspace at mint time, as durable evidence that authority *was*
   granted. When the ledger is unreachable, minting a **new** workspace is refused, which preserves
   the property that actually protects the shared checkout: no uncoordinated new workspace can
   appear. An already-minted workspace whose receipt matches its derived identity and branch
   continues to accept scoped writes. A receipt that is absent, malformed, or mismatched against
   derived identity refuses, exactly as a missing claim does. The receipt is a cache of a past
   grant, never a substitute for one: whenever the ledger is reachable it is authoritative and the
   receipt is re-validated against it.

5. **The rule binds shared checkouts.** Amending ADR-0255 D1: a checkout is in scope when more than
   one agent session can reach it — the developer machine's primary checkout and any long-lived
   host any two sessions share. An ephemeral, single-tenant, disposable container that no other
   session can reach is out of scope and writes normally within it, because there is no co-tenant to
   strand and nothing durable to leave dirty. Scope is a property of the *checkout*, never of the
   harness or of the agent's confidence about its own isolation; when in doubt a checkout is shared.
   With D4 and this clause, ADR-0250's permanently-offline remote sessions keep working without
   needing an exception, and ADR-0114's nightly window stops new mints rather than all writing.

6. **The behavioural proof bar is unchanged and extended by two cases.** ADR-0255 D8 stands in full.
   Add: a workspace holding a valid receipt accepts scoped writes while the ledger is unreachable,
   and a mint attempted in that state is refused. Unit tests of hook scripts or config renderers
   remain necessary but not sufficient.

## Consequences

**Good**

- A wall exists this week rather than after a broker is designed. The policy module already exists
  fail-closed on both supported surfaces (`sdk-author.ts`, `codex-scope-hook.mjs`); this is
  extending proven code to a new caller, not new machinery.
- The compatibility-default runtime (ADR-0030) stops being read-only indefinitely, which is what
  ADR-0255 D4 as written implied for Claude Code desktop.
- ADR-0250 and ADR-0114 stop colliding with the invariant. Remote sessions keep their offline docs
  and gate work; the nightly window blocks new mints instead of all writing.
- The lobby can perform the one ceremony it exists to offer, which D1's "ignored" clause otherwise
  forbade.
- Scoping to shared checkouts states the hazard that actually caused the incident, so future
  surfaces are classified by co-tenancy rather than by a growing exception list.

**Bad / accepted**

- A human with filesystem access can still disable the hook. This is deliberate under ADR-0255 D7
  and is the residual risk accepted in exchange for shipping a wall now.
- The interactive-session adapter is weaker than the spine-controlled leaf adapters, because the
  user launches the session. Until an OS profile or broker lands underneath, an interactive session
  on a shared checkout is protected by a boundary the *user* can remove.
- The claim receipt is a second place authority is represented. It is deliberately a cache with a
  short trust surface — re-validated whenever the ledger is reachable — but a stale receipt on a
  long-lived unreachable-ledger workspace is a real window, bounded by the receipt's grant time.
- Classifying a checkout as shared or ephemeral is a judgement the boundary must make mechanically.
  Defaulting to shared is safe but will treat some genuinely isolated containers as in scope.
- The enumerated allowlist needs maintenance as tooling changes; a new build artifact directory will
  be refused until it is listed. That is the intended failure direction.
- Path canonicalisation still must handle Windows drive case, junctions and symlinks, nested
  worktrees and Git common-directory indirection. A textual prefix check remains unsafe.

## Rejected alternatives

- **Wait for the OS boundary or broker before enforcing anything.** Rejected: it leaves the second
  door open indefinitely on the default runtime, which is the exact state the incident exposed.
- **Treat a user-disableable hook as no boundary at all.** Rejected: it conflates agent-bypassable
  with human-disableable, and ADR-0255 D7 requires the latter to remain possible.
- **Grant the lobby a general write-capable shell so the ceremony works.** Rejected: it reopens the
  escape ADR-0255 closes. The narrow enumerated allowlist is the bounded form.
- **Exempt remote sessions from the write rule by harness name.** Rejected: ADR-0255 D5 is right
  that the harness name never grants an exception. Scope binds the checkout's co-tenancy instead.
- **Let an unreachable ledger permit writes generally.** Rejected: that is the uncoordinated writing
  ADR-0255 D7 exists to prevent. Only an already-granted, receipt-bearing workspace continues.
- **Keep the claim only in the ledger and accept the nightly outage.** Rejected: a daily multi-hour
  freeze plus permanent exclusion of remote sessions is too high a price for a property the receipt
  preserves.

## References

- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) — the decision
  this amends; D1/D2/D3/D5/D6/D8 stand.
- [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) — remote sessions
  are structurally offline; the fence is TLS re-termination.
- [ADR-0114](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md) — the fixed
  01:00–07:00 Sydney sleep window.
- [ADR-0232](0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md) — the Codex leaf's fail-closed
  `PreToolUse` hook layered under an OS profile.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the one ledger
  and the claim-gated workspace ceremony.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) —
  claim-before-worktree and hard refusal.
- [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) — the earlier
  `proposed` treatment of the same shared-primary-checkout hazard; ADR-0255 did not cite it and it
  needs a curator pass to supersede or fold it.
- `packages/agent/src/sdk-author.ts` — the existing fail-closed `PreToolUse` write scope, Claude.
- `packages/agent/src/codex-scope-hook.mjs` — the same policy, Codex.
- `packages/cli/src/worktree-create.ts` — the claim-first mint that stamps the receipt.
- `packages/drive/src/noticeboard.ts` — `deriveIdentity()`, which the boundary validates against.
