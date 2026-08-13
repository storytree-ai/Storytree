---
status: accepted
decided: 2026-08-12
amends: [257, 284]
arc: codex-factory-parity-arc
---
# ADR-0355: Interactive Codex writes only in its current claimed worktree

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**NOT operational (corrected in place 2026-08-14 per ADR-0139; this line previously read
"Operational" as of 2026-08-13, and a fresh Codex desktop session that same day falsified it — see
"## Delivery status" below for the full account).** The repository generator, trusted actuator,
machine-wide Codex policy, and live-claim reader are installed on the supported Windows host. The
interactive profile admitted writes beneath exactly the current claimed worktree and refused the
primary checkout and a sibling worktree. The factory phase-author profile admitted writes only
beneath its in-worktree replica subtree and refused paths outside it. The lobby profile admitted
startup/read activity and refused a write tool. Both the single-file `model-runtime-seam` and exact
two-file `codex-multifile-runtime-seam` completed as subscription-backed signed live builds with no
scope refusals. **All of that is writer-scope evidence, gathered with a writer already sitting in a
claimed worktree — it says nothing about how a task GETS there.** The lobby bootstrap D4 specifies
has never completed once: it hits a credential circularity (the sandbox ACL denying the Codex
process gcloud ADC / `~/.storytree/secrets.json` is exactly what the bootstrap then needs to take
the claim). D5's literal bar — three writes under the installed profile — does not catch this,
because it never asks the writer to arrive from the lobby; that narrowness is itself part of the
defect, and is treated in "## Delivery status" below.

**Amends** ADR-0257 D2/D3/D7 and ADR-0284 D1/D6/D8. The owner has now chosen and funded the
Codex-only containment thread those decisions left as a scope-and-spend fork. For interactive Codex,
ADR-0284's accepted worktree-to-worktree risk no longer applies: Codex receives authority over one
current claimed worktree, not every registered worktree. Claude's static lobby wall and its accepted
residual sibling-worktree risk are unchanged.

## Context

Storytree already creates one repository-minted worktree per session after taking notice-board
claims. Interactive Codex nevertheless starts in a primary-checkout lobby whose process can reach
the native Windows filesystem, and an ordinary Codex session has shell and patch routes broader than
the repository's file-tool conventions. A prompt saying "stay in your worktree" is therefore advice,
not containment.

ADR-0257 specified the honest Codex composition: managed hooks for the dynamic decision plus an
administrator-owned filesystem permission profile that contains every write route, including the
shell. ADR-0284 deliberately left that adapter unbuilt and made its cost an owner decision. The owner
has now chosen the strict boundary after comparing it with an all-registered-worktrees profile and
with explicit deferral. The extra administration and version-coverage cost is accepted because the
supported interactive writer must not be able to modify the lobby or another session's checkout.

## Decision

1. **One session receives one writable repository root.** The interactive Codex writer may write
   source only beneath the canonical root of its current repository-minted worktree, and only while
   that worktree's Storytree session holds the relevant live claim. The primary checkout, sibling
   worktrees, detached or unregistered checkouts, and paths outside the repository remain read-only.

2. **The hard boundary is an administrator-owned filesystem profile.** A trusted launcher derives
   the current worktree only from independently resolved Git topology plus the Storytree claim
   ledger, then selects or generates the OS permission profile before the Codex writer starts. The
   writer cannot edit, select, widen, or approve around that profile. An operator may use a separate
   maintenance profile, but the agent cannot request or activate it. If Windows cannot express the
   derived single-worktree grant, the writer does not start; the implementation must not fall back to
   all Storytree worktrees or to `danger-full-access`.

   The managed rollout requires Codex 0.138.0 or later, uses `default_permissions` plus a complete
   `allowed_permission_profiles` allowlist, and removes legacy `sandbox_mode` /
   `sandbox_workspace_write` settings rather than mixing the two permission systems. On native
   Windows the requirements allow only the preferred `elevated` sandbox implementation; an
   `unelevated` fallback is not silently substituted for the supported strict boundary.

3. **Managed Codex policy supplies the dynamic guard and explanation.** System-managed
   `%ProgramData%\OpenAI\Codex\requirements.toml` sets `allow_managed_hooks_only = true`, pins
   `[features].hooks = true`, names an absolute `[hooks].windows_managed_dir`, and permits only the
   generated Storytree profiles needed by that session. A managed
   `PreToolUse` hook canonicalises the working directory and every extractable target, verifies the
   current branch and live claim, rejects lobby/sibling/ambiguous write attempts, and explains the
   refusal. A `PermissionRequest` hook records attempted widening. The hook is defense in depth; per
   ADR-0284 D5 it is never described as the filesystem authority by itself.

4. **Lobby bootstrap is an exact actuator.** A lobby session may invoke the repository-owned
   `storytree worktree create` ceremony through a trusted launcher that validates its executable,
   arguments, checkout, and Git-metadata targets as one operation. Generic shell, `git`, package
   installation, or arbitrary `.git` access is not granted in the lobby. After the claim succeeds and
   the worktree is provisioned, the writer restarts or hands off under the worktree-scoped profile.

   **The bootstrap must end holding a WORK claim, not the exploring claim the ceremony takes.**
   `storytree worktree create` takes `exploring` claims (ADR-0200 D3), while D1's authorisation
   admits a writer only on a live `work` claim naming that session and branch. An interactive Claude
   session bridges the two with a separate `noticeboard declare`; the actuator has no second turn in
   which to spend one, so promotion is part of the SAME fail-closed bootstrap operation — a refused,
   partial, or wrongly-stamped promotion refuses the bootstrap rather than returning a worktree whose
   writer can never be authorised.

5. **Lifecycle evidence is part of delivery.** Tests cover lobby classification, canonical current
   worktree resolution, sibling and traversal refusal, stale/absent claim refusal, ambiguous targets,
   managed-policy generation, and a dry-run installer/launcher path. Machine-wide installation is a
   privileged operator action and remains visibly separate from repository generation. The final
   live smoke must show a lobby write refused, a current-worktree write admitted, and a sibling write
   refused under the installed profile before this containment is claimed operational.

## Delivery status — NOT operational (2026-08-14)

**A fresh Codex desktop session on 2026-08-13 falsified the claim that this containment was
operational.** The decision above is unchanged and still stands; what follows is the honest state of
its delivery, so that no later reader takes `accepted` for `working`.

Be precise about WHICH leg failed, because the earlier "operational" claim was not simply invented.
D5's literal bar is three writes — lobby refused, current worktree admitted, sibling refused — and
the writer-scope evidence behind it (those refusals, plus two subscription-backed signed live builds)
appears to be genuine; nothing observed here falsifies it. **What was never demonstrated is the
LIFECYCLE that D4 specifies: a task starting in the lobby and reaching that claimed worktree at
all.** So the defect is twofold — the operational claim generalised writer-scope evidence into a
lifecycle it had not tested, and D5's own bar was drawn too narrowly to catch that, because it
assumes a writer already sitting in a claimed worktree and never asks how it got there. **A future
smoke must begin in the lobby, not in the worktree.**

The blocking defect is a credential circularity in the bootstrap, confirmed at three levels:

- The actuator's `Protect-SandboxCredentials` applies `icacls /deny` for `<COMPUTERNAME>\
  CodexSandboxUsers` over gcloud config, `~/.config/gcloud`, `~/.storytree/secrets.json`, and
  `~/.codex/auth.json`. Observed on the dev host:
  `C:\Users\mickh\AppData\Roaming\gcloud MicksMSpro\CodexSandboxUsers:(OI)(CI)(DENY)(RX)`.
- `codex-worktree-create-entry.ts` then needs exactly those paths — `loadLocalSecrets()` for
  `STORYTREE_DB_USER`, and ambient ADC for the Cloud SQL connector — to take the claim.
- The actuator carries no identity transition. It is "trusted" in the sense of hash-pinned, exact-
  grammar, and topology-verified; it still executes with its caller's token, and its caller in the
  lobby is the sandboxed Codex process. So the bootstrap authenticates as the identity the boundary
  just denied.

This is a composition fault, not a reason to widen the sandbox. The claim-first ordering is right and
the OS boundary is right; what is missing is a narrow broker holding operator authentication OUTSIDE
`CodexSandboxOffline` that exposes only these lifecycle operations — which is host integration this
repository cannot install or self-attest. Note the two credential paths already disagree about this:
the live-claim PROBE reaches the store as a dedicated impersonated reader
(`storytree-codex-claim-reader@…`), while the bootstrap WRITE path reaches for a human's personal
secret. Whatever broker shape is chosen, the write path should not be the one holding an operator
credential.

Two further gaps are confirmed and are NOT repository-side either: the actuator's `launch` starts a
NESTED Codex process (`& $CodexPayload @CodexArguments`) rather than rebinding the current desktop
task, and `%ProgramData%` ships managed Node but no pnpm/Corepack. Both are recorded on
`codex-factory-parity-arc`; the same-task rebinding fork is an open question against that arc.

What HAS landed, and is proven by `packages/cli/src/codex-session-containment.test.ts`: the
exploring→work promotion required by D4 above, the live-claim check failing closed on a gradeless
claim (it previously admitted one, which is precisely the exploring shape the bootstrap leaves), a
worktree-local `TEMP`/`TMP` inside the writer's own grant so tsx and Playwright can start, and a
profile deny narrowed from the whole `~/.codex` tree to `~/.codex/auth.json` — the credential stays
unreadable while the skills the same directory advertises become readable, which also makes the two
halves of the deny (profile and ACL) agree.

**Until a live smoke from a genuinely fresh Codex desktop task is recorded, neither this ADR nor the
arc may describe the lifecycle as operational.**

## Consequences

**Good.** An interactive Codex session gets a simple physical invariant: one claimed worktree is its
workshop. Shell and patch routes share the same OS boundary; the lobby and other sessions are not
protected merely by prompt obedience. The claim ceremony, filesystem grant, and observable refusal
all name the same session identity.

**Cost / watch.** Installation requires administrator-owned Windows configuration, a trusted
launcher/profile generator, Git common-directory handling, and a deployed-Codex hook coverage
inventory. Worktree switches require a new profile or process handoff. A database outage or stale
claim refuses a new writer rather than widening it. Repository tests can prove generation and policy
decisions but cannot self-attest the machine-wide installation, so the installed-host proof remains
an operator-owned attestation whenever the managed payload, Codex version, or Windows sandbox changes.

The native Windows permission profile's `deny_read` does not constrain shell subprocesses. The
installed actuator therefore also applies explicit deny ACLs for the local Codex sandbox group to
Codex auth, gcloud credentials, and Storytree secrets before launching a model turn. The live
attestation confirmed those files, application-default credentials, the claim-reader's cloud token
path, and outbound OAuth access all fail from the sandbox while the outer operator remains logged in.
The claim hook reaches the live ledger only through a dedicated keyless impersonated service account
whose database role can `SELECT` `events.node_claim` and cannot insert, update, or delete it.

## References

- ADR-0255 — the primary checkout is a read-only lobby and work begins only after a claim.
- ADR-0257 — the surviving Codex managed-hook plus OS-profile composition amended here.
- ADR-0284 — the owner scope-and-spend fork answered here; Claude's decision remains unchanged.
- ADR-0110 — the owner's in-conversation direction is ratification.
- `packages/cli/src/worktree-create.ts` — the claim-before-workspace ceremony the launcher admits.
- `packages/cli/src/codex-session-containment.ts` — the managed requirements, hooks, session policy,
  and trusted-actuator generator.
- `packages/cli/src/codex-live-claim-probe-entry.ts` — the standalone keyless live-claim reader.
- `packages/cli/src/codex-worktree-create-entry.ts` — the standalone, exact-argument lobby bootstrap
  over the claim-before-workspace ceremony.
- `packages/agent/src/codex-author.ts` — the factory phase author selects the managed replica-only
  profile and keeps its production replica inside the claimed worktree.
- Codex manual: Permissions, Hooks, Managed configuration, and Windows sandbox (verified
  2026-08-13 against the current manual; permission-profile managed allowlists require Codex
  0.138.0+).
