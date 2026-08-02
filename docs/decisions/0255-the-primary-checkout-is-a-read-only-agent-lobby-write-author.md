---
status: accepted
load_bearing: true
decided: 2026-07-27
amends: [33, 121, 143, 200, 245]
---
# ADR-0255: The primary checkout is a read-only agent lobby — write authority is claim-bound and harness-neutral

## Status

accepted (2026-07-27) — decided/directed by the owner after the 2026-07-26/27 primary-checkout
incident and the forensic review that followed. The owner directed: *"Land the ADR as proposed ...
this needs to work across both surfaces"* — Claude Code and Codex. Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask.

> **Amended by [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md)**
> (accepted, 2026-07-28) — the write-authority wall stands, hardened at D1, D4 and D7 and made
> concrete at D5. Every decision below still holds except where an inline note says otherwise.
> **D1** narrows to *shared* checkouts: the lobby filesystem wall binds wherever more than one agent
> session can reach a durable checkout, while D2's claim rule keeps binding every writer including a
> single-tenant one. **D4** re-decides the composition: a fail-closed pre-tool policy is mandatory on
> every harness, and is sufficient *alone* only where that harness proves complete write-path
> coverage — otherwise a filesystem boundary or broker stays part of the current minimum, and the
> human maintenance profile must be one the agent cannot request, approve or activate.
> **D7** gains a narrow, tamper-evident, expiring claim-receipt exception to offline-read-only.
> **D2, D3, D5, D6 and D8 stand unchanged** — including D5's harness-neutrality, which ADR-0257
> *instantiates* rather than amends by making the Codex adapter concrete (see the note at D5).
> *(Build state corrected in place 2026-08-02, the amendment summary above unchanged: this line read
> "Nothing in either ADR is built yet." ADR-0257's increments 1–3 have since built the Claude half
> and turned it on — see the note at the end of this Status block for exactly what is and is not in
> force.)*

> **⚠ THE BANNER ABOVE IS SUPERSEDED IN PART — read this one with it.
> [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) (accepted,
> 2026-08-02) amends ADR-0257 and ROLLS BACK most of what that banner promised.** The claim-aware
> `PreToolUse` half was retired before it was ever registered, and its code is **deleted**. Read the
> paragraph above as the 2026-07-28 state, then apply these three corrections:
> - **D4's pre-tool mandate does not hold.** "A fail-closed pre-tool policy is mandatory on every
>   harness" is retired for Claude Code: a `PreToolUse` hook FAILS OPEN (only exit code 2 blocks), so
>   it cannot be the agent-inescapable mechanism the clause names. What binds Claude is the static
>   `permissions.deny` block ALONE.
> - **D7's claim receipt does not exist.** It is deleted with the hook that was its only consumer
>   (ADR-0284 D4), and ADR-0257 D5 is CLOSED rather than open. Nothing mints, reads or honours a
>   receipt.
> - **D8 does not "stand unchanged".** Its behavioural proof bar is RETIRED (ADR-0284 D7) along with
>   the semantic layer it was written to prove — it is not an unmet requirement, it has no subject.
>   D2, D3, D5 and D6 do still stand.
>
> **Worktree-to-worktree writes are DE-SCOPED as a hazard** (ADR-0284 D1, owner call on zero evidenced
> instances in five weeks against 13 for the lobby). Nothing refuses one, permanently and by decision.
> This ADR's lobby diagnosis and D1's containment floor survive intact and are what the static block
> enforces.

**Amends** [ADR-0033](0033-session-presence-notice-board.md): its never-blocking contract continues
to govern ambient noticeboard automation, but a separate write-authority guard is blocking by
design. **Amends** [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md):
claim-before-worktree extends from build scheduling to every agent source write; a non-worktree
write is no longer an uncoordinated no-op, it is refused. **Amends**
[ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md): its
SessionStart nudge and landing gate remain useful feedback, but they are no longer the enforcement
boundary for writes. **Amends**
[ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md): the primary
checkout lobby becomes mechanically read-only to agent harnesses, and the claim-gated workspace
ceremony applies across harnesses rather than only to Storytree-owned spawners.

**Amends** [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md)
*(edge recorded by the librarian pass on 2026-07-28 — this ADR was authored without citing it, and
both ADRs independently amend ADR-0200 for the same hazard; the edge below is a record of what this
body already effects, not a new decision)*. ADR-0245 diagnosed the same fault — uncommitted work in
the shared primary checkout — and shipped the first enforcement of it to be **in force**
*(build state corrected in place 2026-08-02: this read "the only enforcement … in force today", with
a parenthetical that the write-time wall "enforces nothing yet". ADR-0257 increment 3 flipped the
wall on the same day, so it is no longer the only one — see the note at the end of this block)*: its
**D5.2 gate-time backstop**, `check:declared`'s lobby arm. **That arm stands and stays built.** D4 below
already places it in the feedback layer, and "Rejected alternatives" rejects the merge gate only as
*the authority boundary*, never as defence in depth — "the late gate remains defence in depth" is
this ADR's own words. What is amended is ADR-0245 D5's **ranking**: the gate is no longer "the
boundary that matters", it is the late backstop behind a write-time wall. ADR-0245 D1/D2 are adopted
unchanged and remain load-bearing here — the fault is a *condition of a checkout*, never an accusable
session, which is why D1 above addresses the checkout rather than an identity. ADR-0245 D3/D4 (the
push/delivery half) stay owner-parked and are untouched.

The two arms are **complementary and differently keyed**, and neither substitutes for the other:
this ADR's wall keys on *an agent write attempt* and prevents the checkout becoming dirty at all;
ADR-0245 D5.2 keys on *dirty* and refuses the landing once it already is. The residual cases the
wall cannot cover are exactly what keeps the gate arm live — D7 preserves an explicit human
recovery/maintenance path (a human editing the primary checkout is not an agent harness and no
pre-tool policy sees it), and D8's behavioural proof bar is still unmet. *(Corrected in place
2026-08-02: this closed "ADR-0245 D5.2 is the *only* rung on the ratchet". Increment 3 added a second
rung for the file tools. D5.2 remains the only rung for a **shell**, and the only rung on any machine
without the wall installed — which is every machine except one.)*

**BUILD STATE — what is actually in force, 2026-08-02.** This ADR is a DECISION about what the lobby
must be; the sentences above describe that decision and are not claims of installation. Read the
build state only from here, and from [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md),
which owns it:

- **IN FORCE, on the developer machine only:** the static `permissions.deny` block of D1, generated
  from `repo-manifest.json` and installed USER-level, which refuses `Write`/`Edit`/`NotebookEdit`
  across the primary checkout while leaving `.claude/worktrees` writable. A lobby write by a file
  tool is refused before mutation. **The lobby is mechanically read-only to the FILE TOOLS of ONE
  harness on ONE machine — nothing broader.**
- **RETIRED, NOT PENDING (ADR-0284 D2):** the semantic half — the `PreToolUse` adapter that knew
  about claims, branches, detached HEAD and junction escapes. Its code is **deleted**
  (`write-authority-hook.mjs`, `write-authority.ts`, `write-authority-receipt.ts`). **Nothing
  evaluates a claim on the write path, and nothing will.** *(This bullet read "INSTALL-ON-DEMAND, and
  unregistered as of 2026-08-02 … registered and exercised end-to-end, then unregistered because the
  only checkout carrying the post-flip script was an ephemeral worktree." Corrected in place 2026-08-02
  per ADR-0139, because that phrasing read as one command away from ON — which is precisely the trap
  ADR-0284 D2 deleted the code to close. The host problem was not the reason it was retired; it was
  one symptom of the reason: a boundary sourced from a mutable checkout is a convention, not a wall.)*
- **NOT BUILT, AND NOW UNSCHEDULED:** any Codex-side enforcement (so D5's harness-neutrality is
  decided, not achieved), D4's trusted mint actuator, D8's brokered common-directory access, and
  **shell/`Bash` containment on either surface** — a shell can still write anywhere the process can.
  ADR-0284 D6 names the Codex adapter as the one live remaining thread and an owner scope-and-spend
  call; the rest is de-scoped or retired.
- **There is no claim receipt.** *(This bullet read "The claim receipt of D7 exists but is UNSIGNED".
  Retired by ADR-0284 D4 with its only consumer.)*

Two readings this note exists to refuse. It is **not** true that "the primary checkout is a
mechanically read-only agent lobby" without qualification — that describes the decision, and it holds
for the file tools of one harness on one machine, not for a shell, not for Codex, and not anywhere
else. It is equally **not** true that "nothing enforces it" — the static half is real, installed and
behaviourally verified. *(This paragraph used to close "D8's proof bar is what closes the gap between
the two, and it is unmet." D8 is retired — ADR-0284 D7 — so nothing is scheduled to close that gap;
the gap is now the accepted, stated residual risk of ADR-0284 D8, not a work item.)*

## Context

ADR-0200 calls the primary checkout the lobby and says sessions obtain a workspace through
`storytree worktree create`, which takes the claim before creating the worktree. The built
enforcement does not make that sentence true for a general-purpose agent harness:

- `deriveIdentity()` recognises only repository-minted `.claude/worktrees/<name>` checkouts and
  returns no session identity in the primary checkout;
- `check:declared` deliberately skips the primary checkout, missing database credentials and an
  unreachable ledger, then runs only at the landing gate;
- `.claude/settings.json` supplies Claude-specific, fail-silent orientation hooks; it is not a
  Codex policy surface and contains no pre-write refusal. *(Still literally true of the COMMITTED
  project file, re-verified 2026-08-02 — it declares neither `permissions.deny` nor a `PreToolUse`
  entry, and ADR-0257 increment 3 records why it structurally cannot: the deny rules are unavoidably
  absolute machine paths, so a committed block would be keyed to one box and would deny every
  worktree its own sources. Do not read this fact as "no pre-write refusal exists" — the wall is
  installed USER-level, outside the repository, and is in force there.)*
- a Codex Local task or a child spawned from it inherits the saved checkout as its runtime working
  directory, while a worktree path in a prompt is advisory text rather than an authority boundary;
- full-access agent tools can write an absolute path outside their current working directory, so
  checking `cwd` alone is not a confinement mechanism.

The gap caused a real loss-of-isolation incident overnight on 2026-07-26/27. A Codex Desktop task
was created in Local with `cwd: C:\code\storytree`, full filesystem access and no approval wall. Its
website writer was explicitly told to preserve and work in that existing checkout; a sibling audit
then fanned out into fourteen descendants, all inheriting the same runtime checkout. Together the
work left the primary checkout on stale `main` with unlanded tracked, untracked and submodule
changes. The work survived only because it was forensically recovered onto
`codex/uat-proof-gate-binding-rescue` and
`codex/website-experience-uat-specs-rescue` before the primary checkout was restored.

One separately-audited Codex task had been told to work only from
`.claude/worktrees/app-surface-f0e166`. Its runtime `cwd` still remained the primary checkout, but
it complied by using absolute worktree paths. That distinction is load-bearing: prompts can produce
good behaviour, but they cannot prove or enforce it.

The existing late gate protected `main` from an ordinary landing; it did not protect the shared
checkout from being dirtied, stranded hundreds of commits behind, inherited by further sessions,
or becoming the only copy of hours of work. By the time a merge gate can object, the isolation
failure has already happened.

Claude Code and Codex expose different hook, sandbox and worktree mechanisms. A policy encoded only
in one harness's settings recreates the same gap on the other surface. The invariant must therefore
be stated in repository terms and enforced at every write boundary, with harness adapters as
projections of one rule.

## Decision

1. **The primary checkout is a read-only agent lobby.** The primary checkout is the canonical Git
   working tree whose top-level owns the repository's common `.git` directory, after canonical path
   resolution. Every agent harness may inspect it, read `CLAUDE.md`, query the tree and ledger, and
   request a workspace. No agent's general-purpose file or shell tools may create, modify, rename,
   delete or restore files in that working tree — tracked, untracked or ignored — regardless of
   which branch it currently names. The stronger checkout-wide rule replaces the narrower
   "`cwd` is primary and `HEAD` is `main`" incident formulation: changing branches must never reopen
   the lobby as an accidental workspace.

   *(Amended by [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) D6:
   this filesystem wall binds every **shared** checkout — the developer machine's primary checkout
   and any long-lived host more than one agent session can reach — and not a single-tenant
   disposable container, which cannot strand a co-tenant's filesystem. That is a narrowing of **this
   decision only**: D2 below still binds the single-tenant writer, which needs its one noticeboard
   claim and still appears as one session/wisp. An isolated filesystem is not a coordination
   exemption.)*

2. **Write authority is a live claim-bound workspace, not a prompt.** A repository write is
   authorised only when its canonical target is inside a recognised repository-minted worktree
   whose derived session id and branch match a live claim in the one noticeboard ledger. At least
   one live claim of any grade admits orientation and scoped preparation in the workspace; the
   existing exclusive `work` grade continues to govern story work. A missing identity, mismatched
   branch, absent/stale claim, unreachable ledger or unclassifiable target REFUSES the write.
   Instructions, `cwd`, branch names, directory naming conventions and a later clean gate are
   evidence or feedback, never substitutes for this authority check.

3. **Claim before workspace remains literal.** `storytree worktree create --node ... --intent ...
   --pg` is the canonical mint: it finalises the worktree/session identity, takes the exploring
   claim, then performs filesystem and Git worktree creation. The lobby exposes that operation
   through a narrow trusted actuator; it does not gain a generic write-capable shell merely because
   Git must update the common directory. A harness-created worktree is not automatically
   authorised. A Claude, Codex or future adapter may admit its native worktree only if it can
   preserve the same claim-before-creation ordering and register the same repository-derived
   identity. Until that adapter exists, the native worktree remains read-only for Storytree work.

4. **Enforcement has an authority layer and a feedback layer.**
   - The authority layer is outside model discretion: an OS/runtime filesystem boundary, a
     write broker, or both make the primary checkout read-only and expose writes only within
     eligible worktrees. A user-selectable "full access" mode is not an allowed Storytree writer
     profile. No agent may approve or select its own escape hatch.
   - A pre-tool policy runs before every generic write path available in that harness, including
     file edit/patch tools, shell/process execution and write-capable MCP or plugin tools. It
     canonicalises actual target paths and validates repository/worktree/claim/branch identity. In
     the lobby, ambiguous shell commands are denied rather than guessed read-only.
   - SessionStart instructions, statuslines, noticeboard deltas and `check:declared` remain the
     feedback layer. They explain the refusal and show the next ceremony; they are not the wall.
   - A project-local hook alone is insufficient where the harness lets a user disable, distrust or
     bypass it. Claude and Codex integrations must use the strongest non-bypassable policy surface
     that each deployed runtime provides. A platform that cannot supply that boundary is
     read-only until it can.

   *(Amended by [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) D1:
   the bar is stated as the strongest agent-inescapable composition each harness actually provides.
   The fail-closed pre-tool policy is **mandatory on every** supported interactive harness — not one
   of two interchangeable options — and it is sufficient as the semantic decision layer *alone* only
   where that harness proves complete coverage of every local write path. Where it does not, a
   filesystem boundary or broker is part of the **current minimum**, not a future improvement. The
   human recovery hatch of D7 is narrowed in kind rather than removed: a human may enter a separately
   selected maintenance profile, but the agent cannot request, approve or activate it — a human
   escape hatch and an agent-selectable one are different threat models.)*

   *(**Re-amended 2026-08-02 by [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md)
   D2/D5 — the pre-tool mandate above is RETIRED for Claude Code.** A `PreToolUse` hook fails open:
   only exit code 2 blocks a tool call, so an absent script, a missing interpreter, a timeout or a
   crash all admit the write, and because a registration names an absolute path inside a mutable
   checkout, any later `git checkout` of the host silently reverts it. It is therefore architecturally
   incapable of being the "outside model discretion" authority layer this decision's first bullet
   requires, and it must not be re-specified as one. **What survives of D4 is the first bullet's
   filesystem boundary**, realised as the static `permissions.deny` block: it holds under
   `bypassPermissions`, cannot be overridden by a more-local allow rule, and cannot be selected around
   by the agent. The second bullet's "shell/process execution and write-capable MCP or plugin tools"
   coverage is NOT achieved and is not scheduled — `permissions.deny` gates `Write`/`Edit`/
   `NotebookEdit` only, so a `Bash` command remains unbound. ADR-0284 D8 states that residual gap
   plainly rather than implying it covered. The fourth bullet's "read-only until it can" rule is not
   applied to Claude: the owner accepted the partial boundary instead.)*

5. **The rule is harness-neutral; adapters are harness-specific.**
   - Claude Code consumes the shared repository policy through its blocking pre-tool boundary plus
     the existing `.claude` orientation surfaces.
   - Codex consumes it through a constrained filesystem permission profile and managed pre-tool
     policy; full-access Storytree writers are disallowed by managed requirements rather than
     composer convention.
   - Owned loops, SDK authors, IDE agents, MCP writers and future harnesses enter through the same
     claim-and-workspace authority. The harness name never grants an exception.
   The exact vendor configuration syntax may evolve; the repository invariant and refusal
   semantics do not.

   *(**Stands unchanged** — [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md)
   says so in as many words, and its D2/D3/D7/D8 INSTANTIATE this decision rather than amend it,
   exercising the "exact vendor configuration syntax may evolve" clause directly above. What those
   decisions add: the Codex bullet is made concrete and delivered from the **managed** layer, not
   repository `.codex` config — `requirements.toml` pinning hooks on, `allow_managed_hooks_only`, an
   administrator-defined permission profile with `:danger-full-access` omitted, and a managed
   `PreToolUse` hook that canonicalises targets and validates repository/worktree/branch/claim before
   every documented local tool route. Managed hooks and the managed filesystem profile are required
   **together**: the hook is the live claim decision, the profile is the containment, and neither
   substitutes for the other. Codex-native worktrees under `$CODEX_HOME` are not authorised by naming
   or convenience, and shared `.git` common-directory access stays brokered or exactly scoped.)*

   *(**Still stands as a DECISION, 2026-08-02 — but "stands unchanged" now overstates the Claude
   bullet, so read it with [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md).**
   Claude Code no longer "consumes the shared repository policy through its blocking pre-tool
   boundary" — that boundary is retired (D2); it consumes it through `permissions.deny`, which is a
   path list and knows nothing of claims. The Codex bullet and everything ADR-0257 D2/D3/D7 make
   concrete are UNTOUCHED and are, per ADR-0284 D6, the only live thread left — and the one surface
   where the composition above still reads correctly, because there the managed hook pairs with an
   OS-level profile that also binds the shell. **Harness-neutrality is further from achieved than
   before, not closer**: the invariant is decided on both surfaces and enforced, partially, on one.)*

6. **One workspace session, one wisp, with harness provenance.** The repository-minted worktree
   basename remains the logical `sessionId` and therefore the one claim/wisp identity across
   surfaces (ADR-0033/0200/0212). Child agents inherit that workspace identity and do not create one
   wisp each. A separate writable top-level task requires its own claim-bound worktree. Claude and
   Codex may hand one logical workspace between surfaces; two independent top-level writers must
   not concurrently treat the same worktree as separate sessions. Vendor thread/run ids and
   transcript locations are correlation metadata attached to the logical session's audit trail,
   never replacement claim identities.

7. **Offline means read-only, and exceptions are human actions.** Ledger loss cannot silently turn
   coordinated writing into uncoordinated writing. The tree, Library and checkout remain readable;
   write attempts fail with the unavailable authority named. Emergency recovery or primary
   maintenance is an explicit human/elevated operation outside the normal agent writer profile,
   auditable as such. An agent cannot infer that authority from urgency, an owner-authored prompt
   or the existence of stranded work.

   *(Amended by [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) D5:
   "offline means read-only" gains one narrow exception, because refusing every write whenever the
   ledger is unavailable collides with the fixed ADR-0114 01:00–07:00 database sleep window. A
   workspace minted while the ledger was reachable carries a **tamper-evident, expiring claim
   receipt** — issued by the claim authority after the claim succeeds, signed with material the
   writer cannot reach, read-only to the writer, and carrying a finite `expiresAt`. While the ledger
   is unreachable, a matching unexpired receipt admits **only its recorded scope**; missing, deleted,
   malformed, forged, expired or mismatched receipts still refuse, and an unreachable ledger **never**
   permits a new mint. This degrades an already-granted authority; it never manufactures one.
   **This decision's unqualified read-only rule is what holds, and the exception above is now
   permanently void** — final correction 2026-08-02 per ADR-0139, superseding two earlier build-state
   notes on this clause. **[ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md)
   D4 RETIRES the receipt** and closes ADR-0257 D5: increment 2's partial build (stamped by both claim
   ceremonies, finite `expiresAt`, live-branch re-validation, never signed) is DELETED along with the
   hook that was its only consumer, and the signing-key custody fork is deleted rather than resolved.
   The earlier notes here read "the hook that would honour it ships behind a default-off switch" and
   then "the hook … is install-on-demand and was unregistered"; both are void — there is no hook, no
   switch, and no receipt. **The conclusion has survived three rewrites unchanged and is now
   unconditional: no write is admitted by a receipt, and the narrow offline exception never came into
   effect.** The collision this exception was written to solve — the fixed ADR-0114 01:00–07:00 sleep
   window — does not arise for what remains, because the static block never consults the ledger at all.)*

8. **The cross-surface proof is behavioural.** This decision is not green until the supported
   Claude and Codex surfaces both prove:
   - every available generic write route refuses before mutation in the primary checkout,
     including an absolute target from a different `cwd`;
   - a repository-minted workspace is absent when its initial claim is refused;
   - a claimed workspace accepts scoped writes and appears as the same single ledger session/wisp
     from both surfaces;
   - a missing/stale claim, branch mismatch and unavailable ledger each refuse a write;
   - child agents cannot escape the parent's write scope; and
   - the trusted claim-and-mint actuator still works without granting general primary-checkout
     write access.
   Unit tests of hook scripts or config renderers are necessary but not sufficient; each real
   harness boundary is exercised.

   *(**RETIRED 2026-08-02 by [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md)
   D7, together with ADR-0257 D9 which extended it — the bar has no subject, it is not an unmet
   requirement.** Every item above except the first proves the claim-aware layer, which is deleted;
   bullets 2, 4 and 5 name claims, receipts and a mint that nothing consults on the write path any
   more. What is proved for the layer that stands is narrower and real: the static block's
   conformance test against the installed user-level file, plus the behavioural verification that a
   lobby `Write` is refused and a worktree write succeeds. **Do not read this clause as blocking —
   this ADR is not "not green pending D8".** Its last sentence keeps its force for anything built
   next: unit tests of hook code are necessary and not sufficient. ADR-0257 increment 3 proved that
   the expensive way, shipping a `/` vs `\` defect that refused every write in the fleet while all 49
   of its tests stayed green, because each fixture built both sides of the comparison the same way.)*

## Consequences

**Good**

- The 2026-07-26/27 incident shape is impossible under the writer profile: a Local task can inherit
  the primary checkout and misunderstand its prompt, but the first write is refused before a byte
  changes. *(**True of the decision, FALSE of what shipped — corrected in place 2026-08-02.** That
  incident was a **Codex** Desktop task, and no layer of the wall binds Codex; the Codex adapter
  (ADR-0257 D2/D3/D7) is unbuilt and per ADR-0284 D6 unscheduled. It was also a full-access task with
  shell, and neither layer binds a shell on any surface. ADR-0284 counted the counterfactual: of 13
  dated lobby incidents the installed wall would have prevented 5–6 — the file-tool slips, the
  cheapest class to recover from — and neither of the two most expensive, this one and a sibling
  branch-rewind by `git checkout`. The bullet is kept because it correctly states the goal; it does
  not describe today.)*
- Coordination and filesystem authority derive from the same ledger. Codex work becomes visible to
  Claude and the forest without introducing a second presence store or vendor-specific wisps.
- The primary checkout remains a trustworthy, current orientation point for every session. A
  crashed or confused agent cannot strand all later Local sessions on its private dirty state.
- The invariant survives harness churn. Hooks explain it in vendor-native terms; the authority
  remains repository- and claim-shaped.
- The late gate remains defence in depth while ceasing to be the first moment an invalid workspace
  is detected.

**Bad / accepted**

- Offline agent authoring is deliberately unavailable. This is stricter than the current
  `check:declared` skip arms and will interrupt work when the ledger is down. *(Amended by ADR-0257
  D5, see D7 above: an already-minted workspace holding a valid unexpired receipt keeps writing
  within its recorded scope through the nightly sleep window. A **new** mint still refuses offline.
  Corrected in place 2026-08-02: this closed "and this bullet reads unqualified until the receipt is
  built" — the receipt IS built as of ADR-0257 increment 2, so the condition needs restating rather
  than removing. The bullet reads unqualified until the receipt is **signed** and the hook that
  honours it is **registered**; neither holds today, so no receipt admits any write.
  **FINAL, later the same day: the bullet reads unqualified PERMANENTLY.** ADR-0284 D4 retires the
  receipt, so the condition can never be met and the ADR-0257 D5 amendment above is void. In practice
  the interruption this bullet warns of never materialised either — the static block that is the whole
  wall has no ledger dependency, so nothing about it breaks during the sleep window.)*
- Git worktree creation, commits and landing touch shared Git metadata. The permission profile needs
  carefully bounded metadata access or a brokered actuator; a broad `.git` write grant would reopen
  the escape this ADR closes.
- Codex Desktop's native Worktree/Handoff experience cannot be treated as authorised until a
  claim-first adapter exists. Opening a repository-minted worktree as the Codex project may be a
  less convenient interim path.
- Non-bypassable Codex policy may require machine-managed configuration or a dedicated agent
  profile/host; repo-local settings alone cannot guarantee the wall while retaining unrestricted
  access elsewhere.
- Path canonicalisation must handle Windows drive case, junctions/symlinks, nested worktrees and
  Git common-directory indirection. A textual prefix check is unsafe.
- A sequential Claude↔Codex handoff can preserve one wisp; simultaneous independent writers in one
  physical worktree are refused rather than represented as false parallel sessions.
- Humans retain an explicit recovery path, so the machine policy reduces accidental and agentic
  writes rather than pretending the operating system can distinguish intent under one unrestricted
  user identity.

## Rejected alternatives

- **Prompt every agent to `cd` first.** Rejected: prompt text does not change runtime `cwd`, and
  absolute writes ignore it.
- **Refuse only when primary is on `main`.** Rejected: a branch switch is not write authority and
  would make the safety property depend on mutable Git state.
- **Rely on `check:declared`, pre-commit or the merge gate.** Rejected: all run after the shared
  checkout may already be dirty and irreplaceable work may exist only there.
- **Use only repository-local hooks.** Rejected as the authority boundary: hook trust, disablement
  and incomplete tool coverage vary by harness. They remain valuable refusal/diagnostic adapters
  behind a filesystem or broker wall.
- **Accept every Claude/Codex-created worktree, then claim on first write.** Rejected: it reverses
  ADR-0121/0200's no-claim-no-workspace ordering and creates invisible, unowned workspaces.
- **Create a separate Codex presence record.** Rejected: the noticeboard is already the one
  coordination and observability ledger. Harness provenance decorates one logical session.

## References

- [ADR-0033](0033-session-presence-notice-board.md) — worktree-derived session identity and the
  ambient-hook failure lesson.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) —
  claim-before-worktree and hard refusal.
- [ADR-0142](0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md) —
  worktree/session claim lifecycle.
- [ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md) — the existing
  nudge and landing wall.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the one ledger,
  claim-gated workspace ceremony and primary lobby this ADR hardens.
- [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md) — one logical
  session/wisp.
- [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) — the same hazard
  treated at the gate; its D5.2 lobby arm is the built late backstop this wall sits in front of, and
  its D1/D2 checkout-not-session reasoning is adopted here (amended edge, see Status).
- [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) — accepted
  2026-07-28; **amends this ADR** at **D1, D4 and D7**, and **instantiates D5** without changing it
  (see the Status blockquote and the inline notes). Read it alongside this one: it makes the
  authority bar agent-inescapable, makes the Codex adapter concrete, narrows the checkout wall to
  shared checkouts, and adds the expiring claim receipt. *(Read it only with ADR-0284 below: two of
  those four — the agent-inescapable pre-tool composition and the claim receipt — are retired.)*
- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — accepted
  2026-08-02; **amends ADR-0257** and is the current word on what the wall is. It retires the
  claim-aware `PreToolUse` half before it was ever registered, closes the receipt, retires the
  behavioural proof bar, and **de-scopes worktree-to-worktree isolation as a hazard**. This ADR's
  lobby diagnosis and D1's containment floor are what survive and what the static deny block
  enforces. **Read it before acting on any build-state sentence here.**
- `packages/cli/src/worktree-create.ts` — current claim-first repository worktree mint.
- `packages/drive/src/noticeboard.ts` — current `.claude/worktrees`-specific identity derivation.
- `packages/cli/src/check-declared.ts` — current late gate and fail-open skip arms.
- `.claude/settings.json` and `packages/drive/src/ambient-presence.ts` — current Claude-only,
  never-blocking ambient integration.
- Codex task `019f9e7d-0593-7290-8ea8-66bf14cbad5d`, writer
  `019f9ee1-0752-7c81-9086-cf98b47e4194`, audit
  `019f9ee1-556d-7322-9575-fcf848d97ac2`, and compliant delegated task
  `019f9e23-5b99-7820-abaa-40cdc2a2b822` — local forensic evidence for the incident mechanism and
  prompt-versus-authority distinction.
