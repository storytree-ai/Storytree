---
status: accepted
decided: 2026-08-14
arc: codex-factory-parity-arc
amends: [355]
---
# ADR-0364: Codex write authority is a standing worktrees grant narrowed by the live claim

## Status

accepted (2026-08-14) — decided/directed by the owner in conversation on 2026-08-14. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends **ADR-0355**. That decision's core — *interactive Codex writes only in its current claimed
worktree* — is UNCHANGED and still binding. What this replaces is the MECHANISM by which that fence is
granted, and with it ADR-0355's delivery shape.

## Context

ADR-0355 grants write authority through a machine-wide permission profile naming ONE worktree by
absolute path, installed and then reverted around a launcher:

    Install-Policy  $Config.activePolicy        # writer profile live, machine-wide
    try     { & $CodexPayload -C <worktree> }   # a NESTED Codex task runs inside this window
    finally { Install-Policy $Config.lobbyPolicy }

So write authority exists only for the actuator's lifetime, and **the nested child is the only thing
holding the window open**. That is why a bootstrap ends with the owner talking to a task that does not
hold the worktree — the launcher IS the access.

Two probes on 2026-08-14 established facts that turned out NOT to bind, and the record should say so
plainly rather than leave them looking load-bearing:

- **PR #1322** — the product genuinely can rebind a live task (`turn/start` with a `cwd` override,
  stable protocol; it moves `workspace_roots` and therefore the write fence with it).
- **PR #1325** — but on Windows no outside process can issue that call: `app-server daemon`,
  `remote-control` and `proxy --sock` are all Unix-only.

Both are true. Neither is the constraint: even a working rebinding returns a task that snaps to
read-only the moment the actuator exits. The binding property is the AUTHORITY LIFETIME.

Three further facts shaped the decision:

- The managed hook ALREADY re-probes the live claim on every tool call and already fails closed
  (`decideWriter` in `packages/cli/src/codex-session-containment.ts`). Under ADR-0355 it checks a claim
  inside a profile that ALSO names the worktree, so the two agree and the profile reads as
  load-bearing when it is largely redundant.
- Session identity is derived from GIT TOPOLOGY only — `gitDir` vs `commonDir` plus
  `git worktree list`, with no path-prefix check anywhere in `resolveCodexSessionTopology`. A worktree
  under any parent is already first-class (ADR-0033), so nothing needs building to recognise one.
- The bootstrap is an administrator-owned pinned bundle because it carries DB CREDENTIALS — the
  comment above `MANAGED_CODEX_HOOK_SCRIPT` says so outright, and
  `codex-worktree-create-entry.ts` calls `loadLocalSecrets()` + `createPool()` directly. Minting a
  worktree was never itself sensitive; it was dragged behind the wall by the credential.

## Decision

**D1. The writer profile becomes a STANDING grant over the worktrees area.** It no longer names a
single worktree, and it is no longer installed and reverted around a launcher. There is no policy
window.

**D2. The managed hook is the effective fence.** It refuses any worktree the session does not hold a
live claim on. This is the authority ADR-0355 intended; it is now the one that actually decides,
rather than the second of two agreeing checks. It continues to fail closed on a missing, slow,
unreachable or malformed claim read. (The read mechanism itself later moved — from a spawned
standalone probe process to a resident broker call, ADR-0375 D1/D3/D4 — but the fail-closed property
this decision states is unchanged either way.)

**D3. The lobby stays read-only.** Unchanged, and not in scope. It is the wall that matters.

**D4. No nested child.** The actuator stops hosting the Codex session. Same-task rebinding is not
required and is not pursued: with no policy window there is nothing to rebind INTO. PR #1322's and
#1325's findings are retained as background, not as blockers.

**D5. Codex mints its own worktree through `storytree worktree create`.** Once the broker holds the
credential (`codex-out-of-sandbox-claim-broker`, `codex-bootstrap-dials-the-broker`), the bootstrap
holds none, and the stated reason for an administrator-owned bundle is gone. The one residue is that
`git worktree add` always writes bookkeeping into the MAIN repo's `.git/worktrees/` — under a
read-only lobby that needs either a narrow grant to exactly that path or a small privileged step. It
does NOT need the actuator to host a session.

**D6. Enforcement stays pinned.** The managed hook and the profile install remain administrator-owned
and outside the repository. An agent may never edit its own fence, and no part of this decision
relaxes that. `PermissionRequest` stays refused unconditionally.

**D7. Sequencing.** `codex-managed-toolchain-payload` moves FIRST — it is a precondition, not a
convenience: `pnpm storytree …` cannot run in a contained task at all today, so D5 is unreachable
without it. The broker pair follows. `codex-lobby-to-write-live-smoke` has its criteria rewritten
BEFORE it runs, not after.

## Consequences

**The coarse fence is now wider than the effective fence, and that is the accepted cost.** If the
managed hook is ever bypassed or fails open, the blast radius is every worktree rather than one. The
hook fails closed today and is administrator-owned; this is a real reduction in defence-in-depth,
taken knowingly in exchange for removing the launcher. **Anyone weakening the hook is now weakening
the only fence** — that is the property to protect in review.

Sibling-worktree isolation survives via the hook, so this is NOT the same as granting the worktrees
home unconditionally (the option explicitly rejected). ADR-0284 accepts unconditional
sibling-worktree risk for Claude; this decision deliberately does not take that shortcut for Codex,
even though it would have been consistent.

**A persistent grant revoked by a later event was rejected** as the only option that can fail OPEN: a
crashed session would leave a live write grant with nothing to revoke it. Authority is bounded here by
a claim that is re-probed per tool call, not by a revocation message that might never arrive.

Good things that follow: the nested task disappears; the actuator shrinks from session host to at most
one privileged step; the Windows control-socket gap stops mattering; and write authority becomes
visible on the notice board as a claim rather than invisible as a process lifetime.

ADR-0355's `## Delivery status` section is corrected in place to point at this decision rather than at
the socket gap it previously (wrongly) named as the blocker.

## References

- ADR-0355 — the containment this amends; its core fence is unchanged.
- ADR-0033 — identity from any git-registered linked worktree, whatever its parent path.
- ADR-0200 — the claim ledger this now leans on as the authority bound.
- ADR-0284 — the sibling-worktree risk accepted for Claude, deliberately not taken here.
- `packages/cli/src/codex-session-containment.ts` — profile generation, `decideWriter`, `Install-Policy`.
- `docs/research/codex-desktop-task-rebinding-probe-2026-08-14.md` (PR #1322) — rebinding is supported.
- `docs/research/codex-actuator-appserver-reachability-2026-08-14.md` (PR #1325) — but unreachable on Windows; background, not a blocker.
