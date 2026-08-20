---
status: superseded
decided: 2026-08-12
amends: [257, 284]
arc: codex-factory-parity-arc
---
# ADR-0355: Interactive Codex writes only in its current claimed worktree

## Status

**SUPERSEDED by [ADR-0390](0390-codex-runs-at-claude-parity-and-the-managed-containment-boun.md) (2026-08-20)** - Codex now runs at Claude parity and the managed containment boundary is withdrawn. This decision's core - *interactive Codex writes only in its current claimed worktree* - is WITHDRAWN. The containment posture it opened is retired. Kept as browsable history; do not calibrate to it.

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
has never completed a live smoke. It used to hit a credential circularity (the sandbox ACL denying
the Codex process gcloud ADC / `~/.storytree/secrets.json` is exactly what the bootstrap then needed
to take the claim); **that circularity is now CLOSED** — see "## Delivery status" below, which records
both the closure and what remains unproven. D5's literal bar — three writes under the installed
profile — never asked the writer to arrive from the lobby, so it could not have caught the
circularity in the first place; that narrowness is also treated below.

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
the OS boundary is right; what was missing is a narrow broker holding operator authentication OUTSIDE
`CodexSandboxOffline` that exposes only these lifecycle operations. Note the two credential paths
disagreed about this: the live-claim PROBE reached the store as a dedicated impersonated reader
(`storytree-codex-claim-reader@…`), while the bootstrap WRITE path reached for a human's personal
secret. (That probe no longer exists — ADR-0375 D8 deleted it when the hook's claim read moved to the
resident authority, leaving one live-claim reader rather than two credential paths.)

**This gap is now CLOSED.** [ADR-0368](0368-the-claim-broker-holds-the-credential-the-sandbox-may-not-an.md)
built exactly that broker: a resident process the OPERATOR starts — by hand or by a logon task, never
by the sandbox — which Codex sends a message to over a loopback channel guarded by a per-launch
ACL'd handshake, deriving `promote` identity from Git topology rather than believing anything the
caller asserts. `codex-bootstrap-dials-the-broker` landed the same day: `codex-worktree-create-entry.ts`
no longer calls `loadLocalSecrets()` or `createPool()` at all, so the bootstrap holds no credential and
opens no database connection. **What is NOT closed:** the broker's own liveness is now
operator-visible work that nothing in this repository can install or self-attest (ADR-0368
Consequences — an agent may never edit its own fence, ADR-0364 D6), and no live smoke has yet run a
genuinely fresh Codex desktop task through the lobby-to-write lifecycle end to end. The credential
circularity is repaired; the LIFECYCLE remains unproven, and neither this ADR nor the arc may describe
it as operational until `codex-lobby-to-write-live-smoke` runs and is recorded.

Two further gaps were confirmed: the actuator's `launch` started a NESTED Codex process
(`& $CodexPayload @CodexArguments`) rather than rebinding the current desktop task, and
`%ProgramData%` ships managed Node but no pnpm/Corepack. Both are recorded on
`codex-factory-parity-arc`. **The first is now CLOSED** — ADR-0364 D4 removed the nested child along
with the policy window that needed it, and the actuator's `launch` verb is retired in favour of an
argument-free `install`. The pnpm/Corepack gap remains open and is now a hard precondition there.

**The same-task rebinding fork is no longer an open question — it was probed on 2026-08-14 and the
product supports it.** `turn/start` accepts a `cwd` override against an existing `threadId`
("override the working directory for this turn and subsequent turns"), it is in the STABLE app-server
protocol rather than behind `--experimental`, and it moves `workspace_roots` — and therefore the
managed profile's write fence — with it. Evidence, including the `thread/read`-reports-the-stale-cwd
trap that would make a naive check read as a false negative:
`docs/research/codex-desktop-task-rebinding-probe-2026-08-14.md`.

**Be precise about what that does and does not settle,** since over-generalising an adjacent proof is
the exact defect this section exists to record. What is proven is that the PRODUCT rebinds a live
thread. What is NOT available is a way for US to issue the call on this host — established by a
second probe the same day (`docs/research/codex-actuator-appserver-reachability-2026-08-14.md`):

    codex app-server daemon version   ->  "only supported on Unix platforms"
    codex remote-control start        ->  "only supported on Unix platforms"
    codex app-server proxy --sock     ->  documented as a UNIX DOMAIN SOCKET path; none on Windows

**Read the cause correctly, because the obvious guess is wrong.** This is NOT the sandbox, and NOT
the `CodexSandboxUsers` boundary that defeats the bootstrap above — an UNSANDBOXED process running as
the operator hits the same wall, because on Windows the mechanism does not exist at all. Widening the
sandbox would not help, which is worth knowing before it is proposed as the fix. Only the process
already holding the app-server channel — the desktop application itself — can issue `turn/start`.

**But that reachability gap is NOT what binds, and recording it as the blocker was an error.** The
binding constraint was this decision's own delivery shape. The mechanism below is the one ADR-0364
replaced, and it is retained here because it is what the correction is a correction OF; it is no
longer what the generator emits. `Install-Policy` swapped a MACHINE-WIDE policy, and the actuator
restored the lobby policy in its `finally`, so the writer profile existed only for the actuator's
lifetime —

    Install-Policy $Config.activePolicy        # writer profile live, machine-wide
    try     { & $CodexPayload -C <worktree> }  # the nested child runs INSIDE this window
    finally { Install-Policy $Config.lobbyPolicy }

The nested child was therefore STRUCTURAL: it was the only thing holding the write window open. Even a
working same-task rebinding would have handed back a task that snapped to read-only the moment the
actuator returned. So the Windows socket gap is true but incidental — fixing it would not have
delivered the journey.

The real fork is **how WIDE and how LONG-LIVED Codex's write authority should be**: a per-worktree
absolute path handed out for a launcher's lifetime (today), or a standing grant over a known
worktrees area bounded by the live claim the managed hook already re-probes on every tool call. The
second dissolves the launcher, the nested child and the rebinding question together, and would let
Codex mint its own worktree through `storytree worktree create` rather than through an
administrator-owned bundle — that bundle is pinned because it carries DB CREDENTIALS (see the comment
above `MANAGED_CODEX_HOOK_SCRIPT`), not because minting a worktree is sensitive, so the broker
increment removes its reason to exist. Enforcement (the managed hook, the profile install) must stay
pinned regardless; an agent may never edit its own fence.

**That fork is now SETTLED by [ADR-0364](0364-codex-write-authority-is-a-standing-worktrees-grant-narrowed.md),
which amends this decision** (owner-directed 2026-08-14). The fence above — Codex writes only in its
current claimed worktree — is UNCHANGED and still binding. What ADR-0364 replaces is how it is
granted: a standing grant over the worktrees area, narrowed by the live claim the managed hook already
re-probes per tool call, instead of a per-worktree profile installed for a launcher's lifetime. The
nested child, the policy window, and the same-task rebinding question all dissolve with it; the
Windows socket gap recorded above is retained as background, not as a blocker. The pnpm/Corepack gap
is promoted to a hard precondition there, because `pnpm storytree …` cannot run in a contained task at
all today.

What HAS landed, and is proven by `packages/cli/src/codex-session-containment.test.ts`: the
exploring→work promotion required by D4 above, the live-claim check failing closed on a gradeless
claim (it previously admitted one, which is precisely the exploring shape the bootstrap leaves), a
worktree-local `TEMP`/`TMP` inside the writer's own grant so tsx and Playwright can start, and a
profile deny narrowed from the whole `~/.codex` tree to `~/.codex/auth.json` — the credential stays
unreadable while the skills the same directory advertises become readable, which also makes the two
halves of the deny (profile and ACL) agree.

**ADR-0364's mechanism has since landed in the same generator and suite**: one standing requirements
file granting the worktrees area, a policy receipt carrying no worktree/branch/session identity, a
hook that narrows on the LIVE CLAIM re-derived from the worktree the process is standing in, and an
actuator whose `launch` verb is gone. The sibling-worktree refusal the per-worktree profile used to
carry is now an explicit test — a session holding a live claim on one worktree is refused both when it
reaches ACROSS into a sibling and when it WALKS INTO one, under a profile that permits both at the OS
layer. That test is load-bearing in a way the others are not: the hook is the only fence, so weakening
it weakens everything. Note also that the JS hook still carried the gradeless-claim fail-open that the
PowerShell half had already closed; it is closed there too now.

**The live smoke's criteria were REWRITTEN on 2026-08-14, BEFORE running it, and this paragraph is the
record ADR-0364 D7 asked for.** D7 required the rewrite to happen first rather than at attestation
time, because this arc was closed once on a bar that had drifted, and a criterion quietly reinterpreted
while it is being signed is exactly how that happens again. The twelve criteria on
`codex-lobby-to-write-live-smoke` keep their numbers — ADR-0355 and the increment both cite them by
position — and five changed text:

- **5** assumed the task was HANDED OFF into the minted worktree. ADR-0364 D4 leaves no launcher and no
  nested child, so there is nothing to hand off from: one task mints its worktree and writes in it.
- **7 would otherwise have passed VACUOUSLY, and that is the correction that matters.** Under this
  decision's original mechanism the profile named one worktree, so a sibling's ABSENCE from the profile
  was the refusal. Under the standing grant the profile NAMES the sibling and permits it at the OS
  layer; the refusal comes from the managed hook's live-claim check alone. A smoke confirming "the
  profile does not grant the sibling" would now be confirming something false about a fence that is
  real — so criterion 7 requires the hook's own refusal reason as the evidence, and requires confirming
  the hook is installed and firing before anything else there reads as a pass.
- **9** assumed `pnpm` resolves in a contained task. Nothing puts it on that PATH; it now names the
  pinned managed toolchain explicitly.
- **10** and **11** were satisfied by the launcher that set `TEMP`/`TMP` for its child and applied
  credential ACLs per launch. The task sets its own scratch now, and the ACLs are install-time machine
  state.

The old dependency on same-task rebinding is DISSOLVED rather than satisfied: it existed only to serve
criterion 5's handoff. **Until a live smoke from a genuinely fresh Codex desktop task is recorded
against those rewritten criteria, neither this ADR nor the arc may describe the lifecycle as
operational.**

## Consequences

**Good.** An interactive Codex session gets a simple physical invariant: one claimed worktree is its
workshop. Shell and patch routes share the same OS boundary; the lobby and other sessions are not
protected merely by prompt obedience. The claim ceremony, filesystem grant, and observable refusal
all name the same session identity.

**Cost / watch.** Installation requires administrator-owned Windows configuration, a trusted
profile generator, Git common-directory handling, and a deployed-Codex hook coverage inventory.
Under ADR-0364 a worktree switch no longer requires a new profile or a process handoff — the standing
profile already covers the area and the session's live claim decides — so what to watch there is the
claim, not the install. A database outage or stale claim refuses a new writer rather than widening it.
Repository tests can prove generation and policy decisions but cannot self-attest the machine-wide
installation, so the installed-host proof remains an operator-owned attestation whenever the managed
payload, Codex version, or Windows sandbox changes.

The native Windows permission profile's `deny_read` does not constrain shell subprocesses. The
installed actuator therefore also applies explicit deny ACLs for the local Codex sandbox group to
Codex auth, gcloud credentials, and Storytree secrets. Those are machine state, so since ADR-0364
they are applied once at `install` rather than around each session — the actuator no longer starts a
model turn to apply them before. The live
attestation confirmed those files, application-default credentials, the claim-reader's cloud token
path, and outbound OAuth access all fail from the sandbox while the outer operator remains logged in.
At the time of that attestation the claim hook reached the live ledger through a dedicated keyless
impersonated service account whose database role could only `SELECT` `events.node_claim`. **That is
attestation history, not current state — ADR-0375 D8 deleted the standalone reader**, and the hook now
asks the resident claim authority over loopback for the answer, so there is one live-claim reader
rather than two credential paths. The narrow-credential property is unchanged in kind; it moved to
the writer identity the resident authority holds (ADR-0375 D2).

## References

- ADR-0255 — the primary checkout is a read-only lobby and work begins only after a claim.
- ADR-0257 — the surviving Codex managed-hook plus OS-profile composition amended here.
- ADR-0284 — the owner scope-and-spend fork answered here; Claude's decision remains unchanged.
- ADR-0110 — the owner's in-conversation direction is ratification.
- `packages/cli/src/worktree-create.ts` — the claim-before-workspace ceremony the launcher admits.
- `packages/cli/src/codex-session-containment.ts` — the managed requirements, hooks, session policy,
  and trusted-actuator generator.
- `packages/cli/src/codex-live-claim-probe-entry.ts` — the standalone keyless live-claim reader this
  ADR's attestation used; DELETED by ADR-0375 D8, which moved the hook's claim read onto the resident
  claim authority instead (see the "Delivery status" and "Consequences" corrections above).
- `packages/cli/src/codex-worktree-create-entry.ts` — the standalone, exact-argument lobby bootstrap
  over the claim-before-workspace ceremony.
- `packages/agent/src/codex-author.ts` — the factory phase author selects the managed replica-only
  profile and keeps its production replica inside the claimed worktree.
- Codex manual: Permissions, Hooks, Managed configuration, and Windows sandbox (verified
  2026-08-13 against the current manual; permission-profile managed allowlists require Codex
  0.138.0+).
