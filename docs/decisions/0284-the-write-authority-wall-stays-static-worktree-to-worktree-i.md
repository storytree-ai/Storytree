---
status: accepted
load_bearing: true
decided: 2026-08-02
amends: [257]
---
# ADR-0284: The write-authority wall stays static; worktree-to-worktree isolation is de-scoped

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

The owner asked, before the last install step of [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md)
increment 3, whether the wall was being over-built and whether it should be finished at all. Four
independent reviews (hazard evidence, implementation, cheaper alternatives, operational impact) plus
a live behavioural probe of the real hook answered no. The owner then directed: **worktree-to-worktree
is not something that needs protecting** — de-scope it, retire the code, land.

This ADR is the re-decision. It **amends** ADR-0257 rather than superseding it: ADR-0257's Codex
decisions (D2/D3/D7) and its diagnosis of the lobby hazard survive intact and become the only live
thread. What changes is D1's composition, D5, and D9's bar.

## Context

ADR-0257 decided a two-layer wall: a static `permissions.deny` block (the lobby floor) and a
claim-aware `PreToolUse` hook (the semantic layer that binds session to workspace). Increment 3
(#1076) installed the static half and left the semantic half unregistered, because the only checkout
carrying the post-flip script was ephemeral. Finishing it was one command.

The review that preceded this decision found five things, each verified rather than argued.

**1. The two hazards have opposite evidence.** Lobby co-tenancy — sessions treating the shared primary
checkout as a workspace — is real and frequent: 13 dated, cited incidents in five weeks, against a
base rate of 106 branch checkouts across 61 branch names in the lobby's reflog. The worst is commit
`5b238a0a`, a Codex Desktop thread with `cwd = C:\code\storytree` fanning to ~15 children and editing
11 tracked files over ~4 h, the work existing only in the shared checkout.

Worktree-to-worktree — one session writing into a sibling's worktree — has **zero evidenced
instances**, in git history, `docs/`, `stories/`, the 238-item live friction corpus, or the agent-memory
index. The phrase occurs three times in the whole repository, all inside ADR-0257 itself, describing
its own test fixtures and its remaining gap. It was a plausible generalisation of the lobby hazard,
never an observed one.

**2. ADR-0257's ratification basis is not retrievable.** The "sixteen-item concurrency & shared state
cluster" from the 2026-07-23 → 07-28 friction report is not in `docs/`, git, or memory;
`docs/friction-inbox/` holds only a README. Reconstructed by date, at most 4 of ~17 items are
cross-session repository collisions and only 3 are file writes; the cluster's centre of mass is
claim-ledger granularity and live-store contention, which a filesystem write wall does not touch.

**3. A `PreToolUse` hook cannot be an authority boundary.** Per the harness contract, **only exit code
2 blocks a tool call**; every other outcome — script absent, interpreter missing, timeout, crash
before stdout — lets the write proceed. The hook's internals fail closed with care, but only once the
process has started. ADR-0257 increment 3 hit exactly this: the lobby sat on a branch predating the
wall and the script did not exist. Because the registration names an absolute path inside a mutable
checkout, any later `git checkout` of the host silently reverts the wall to fail-open with no signal.
ADR-0257 D1 requires enforcement "impossible for the agent to disable, select around, or approve its
way past". A hook is architecturally incapable of being that.

**4. The shell is unbound and will stay unbound on this machine.** Harness sandboxing does not support
native Windows, and where it exists it confines Bash only. Both layers gate exactly
`Write`/`Edit`/`NotebookEdit`. The consequence is an incentive inversion: once the file tools are the
only refused route, the cheapest way past a refusal is to retype the edit as a shell heredoc — a path
this repository's own agent memory records being used routinely.

**5. Registering it would have broken every compliant session.** Probed against the real hook from a
claimed worktree: a write to the harness-mandated scratchpad and a write to the agent-memory directory
are both REFUSED as "outside this repository", with a message offering no remedy because from the
wall's view there is none. A `Bash rm -rf` on the protected lobby PASSES. The wall would have refused
a session's own scratchpad note while permitting a shell to delete the checkout it protects. This was
recorded in neither ADR-0257 nor the arc; only running it surfaced it.

Two further defects were found in the built semantic layer, recorded here because they are the reason
"finish it" was not a cheap option. The receipt **defines the topology it is checked against** —
`evaluateReceiptAuthority` builds the repo topology from receipt fields and never cross-checks them
against independently computed values, so a forged receipt naming the lobby as its own worktree
classifies the entire repository as inside it. And the git-enumeration guard `write-authority.ts`
documents as "what makes ADR-0257's rejected alternative stay rejected" is **dead code in the shipped
path**: what runs is `locateWorktree`, string-matching on `/.claude/worktrees/` — the rejected
alternative, with a forgeable receipt standing in for the git check.

Against all this, the counterfactual is the decisive number: of the 13 real incidents, the wall as
installed would have prevented 5–6 — the file-tool slips, also the cheapest class to recover from. It
would not have prevented the two most expensive, `5b238a0a` (Codex, outside `--root`) and the sibling
branch-rewind (a `git checkout`, a shell operation). **Both documented incidents in ADR-0255 and
ADR-0245 were Codex**, which neither layer reaches.

## Decision

**D1. Worktree-to-worktree writes are DE-SCOPED as a hazard we build against.** Owner call, on zero
evidenced instances in five weeks of heavy concurrent use. This is not a claim that the write is
impossible — it is a decision that its expected harm does not justify a claim-aware enforcement layer.
It returns as work only if an incident is actually filed. The arc's end-state is amended accordingly:
session isolation means **the lobby is not a workspace**, not that worktrees are mutually sealed.

**D2. The semantic `PreToolUse` half is RETIRED, not deferred.** The hook is never registered, and its
code is deleted rather than parked: `packages/cli/write-authority-hook.mjs`, the receipt module, the
decision core, the hook registration path in the installer, and the `--hook-from` flag. Git is the
archive. Parking it would leave a fail-open mechanism one command away from being switched on by a
future session reading a green ADR, which is precisely the trap this review had to dig out of.

**D3. The static `permissions.deny` block IS the wall.** It stays installed and stays generated from
`repo-manifest.json` by `storytree write-authority install --write`. It is the best value in the whole
design: zero per-write cost, no database dependency, holds under `bypassPermissions`, cannot be
overridden by a more-local allow rule, and cannot brick a session. It addresses the hazard that
actually occurs.

**D4. The claim receipt (ADR-0257 D5) is retired with the hook, and D5 is CLOSED — not left open.**
Its only consumer was the hook; minting is removed from both claim ceremonies and revocation from
`noticeboard done`. This deletes the 12-hour TTL that would have bricked long sessions mid-work, the
Cloud SQL dependency on the write path, and the unresolved signing-key custody fork. **The
signing-key fork does not need resolving; it needs deleting.**

**D5. A `PreToolUse` hook is not an authority boundary, and this is durable.** Recorded so it is not
re-proposed: it fails open on any failure to run, and its integrity depends on a git branch not
moving. It is a legitimate *guardrail* against accidents. It must not again be specified as the
mechanism satisfying an agent-inescapability requirement.

**D6. Codex containment is the only live thread, and it is an owner scope-and-spend decision.**
ADR-0257 D2/D3/D7 — managed `requirements.toml` plus an administrator-defined filesystem permission
profile — remain the work that addresses the observed incidents, and it is the one place a managed
hook has real teeth because it pairs with an OS-level profile that also contains the shell. **Amended
2026-08-12 by [ADR-0355](0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md):** the
owner funded the strict current-claimed-worktree scope and the repository now generates and dry-runs
the managed policy bundle. Administrator-owned machine installation and live three-write attestation
remain the honest gap.

**D7. ADR-0257 D9's two-surface concurrent-load proof bar is retired along with what it was proving.**
With no semantic layer to prove, the bar has no subject. The static block's conformance test against
the installed user-level file stands as the proof that remains.

**D8. The residual gap is stated plainly rather than implied covered.** As amended by ADR-0355,
repository code now generates Codex containment, but interactive Codex remains operationally
uncontained until the administrator-owned profile is installed and the live smoke attests it. The
gap is no longer design or repository generation; it is privileged deployment and evidence.

## Consequences

**Good.** The enforcement in force matches the hazard measured. No per-write tax, no ledger on the
write path, no expiring receipt, no fleet-wide brick risk from path arithmetic on the hot path of
every write — a class of bug that already shipped once (#1076 refused every write, including a
session's own worktree, through a `/` vs `\` disagreement all 49 tests missed). Detached worktrees
need no reaping, because nothing refuses them any more. Sessions keep their scratchpad and memory. The
remaining statement of risk is small, true, and priceable.

**Bad, and accepted.** A session can still write into a sibling's worktree with a file tool; nothing
refuses it on the Claude static wall. We are betting on zero observed Claude instances continuing to
be zero, and the bet is revisited by evidence, not by argument. ADR-0355 makes the opposite choice for
interactive Codex: its generated profile admits only the current claimed worktree once installed.

**Known holes in what remains — the list is now FULLY DISCHARGED.** Three were named on acceptance as
follow-ups against the layer that stays, not as reasons to keep the layer that goes. All three closed
within a day of it, and this paragraph is corrected in place per ADR-0139 rather than superseded: the
decision is unaffected, only the implementation moved.

- **The whole `web/` tree stayed file-tool-writable in the lobby.** `repo-manifest.json` lists `web`
  under `root.files`, so the generator emitted the exact-path rule `Write(//c/code/storytree/web)`,
  which matches the literal path and nothing beneath it — and `web` is the storytree-web submodule, a
  populated site tree in the primary checkout. **Closed by PR #1085.** The manifest was NOT
  misclassified and must never be "fixed": `check-manifest.mjs` sorts tracked paths by `git ls-files`,
  which reports a submodule as ONE gitlink entry, so `web` genuinely IS a root file to the gate that
  owns the manifest — moving it to `root.dirs` makes `scripts/check-manifest.mjs` block. *(Invocation
  corrected in place 2026-08-06 per ADR-0139; nothing here is re-decided and the instruction stands —
  the manifest must still never be "fixed". This named `pnpm check:manifest`; ADR-0311 D2 removed that
  root script, so the command no longer resolves. Both the checker and `repo-manifest.json` survive
  and their behaviour is unchanged — what is gone is only the gate wiring, so a misclassification now
  goes uncaught until someone runs the script.)* The bug was in the
  RULE GENERATOR, and that is where the fix went: `lobbyDenyRules` now emits BOTH an exact-path and a
  `/**` tree rule for every `root.files` entry. Both forms rather than a filesystem probe,
  deliberately — a probe answers "file" for an uninitialised submodule, i.e. exactly on the machines
  whose working tree is bare, which would silently re-open the hole at the next `git submodule
  update`. The inert half costs nothing: a real file has no children for `/**` to match.
- **The lobby's root `node_modules/` carried no rule at all.** The manifest is an allow-list over the
  TRACKED surface, so an untracked directory is invisible to it by construction and had to be named
  separately or nothing would deny it. **Closed by PR #1085**: `node_modules` now sits beside `.git`
  in `EXTRA_DENIED_DIRS`, which exists precisely to carry what the manifest cannot see.
- **ADR-0245 D5.2's gate-time lobby arm was far narrower than either ADR described** — in
  `check-declared.ts` it was reached only when `deriveIdentity()` returned null and then only in the
  primary checkout, so a worktree session's gate never checked whether the lobby was dirty.
  **Closed by PR #1086**: the lobby question is pure git and needs no session identity, so it now runs
  for every session against the primary checkout's tree, and the caller's location is no longer an
  input to the decision. See ADR-0245 D5.2's build note.

## References

- [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) — amended: D1's
  composition, D5, and D9 change; D2/D3/D7 stand.
- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) — D1/D2 stand: the
  lobby is read-only and repository writes are claim-bound. The static block enforces the first.
- [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) — D5.2's gate-time
  lobby arm remains the landing-gate backstop, and is the only arm that covers a shell.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born `accepted`.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why this is a new
  ADR with an `amends` edge rather than an in-place correction: the decision changed.
- `packages/drive/src/write-authority-rules.ts` — the generator for the layer that stays.
- `packages/cli/src/write-authority-install.ts` — `storytree write-authority rules | install`.
