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
> Nothing in either ADR is built yet.

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
the shared primary checkout — and shipped the only enforcement of it that exists today: its **D5.2
gate-time backstop**, `check:declared`'s lobby arm. **That arm stands and stays built.** D4 below
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
pre-tool policy sees it), and until the authority layer is built and behaviourally proved under D8,
ADR-0245 D5.2 is the *only* rung on the ratchet.

## Context

ADR-0200 calls the primary checkout the lobby and says sessions obtain a workspace through
`storytree worktree create`, which takes the claim before creating the worktree. The built
enforcement does not make that sentence true for a general-purpose agent harness:

- `deriveIdentity()` recognises only repository-minted `.claude/worktrees/<name>` checkouts and
  returns no session identity in the primary checkout;
- `check:declared` deliberately skips the primary checkout, missing database credentials and an
  unreachable ledger, then runs only at the landing gate;
- `.claude/settings.json` supplies Claude-specific, fail-silent orientation hooks; it is not a
  Codex policy surface and contains no pre-write refusal;
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
   permits a new mint. This degrades an already-granted authority; it never manufactures one. The
   receipt is unbuilt — `worktree create` does not stamp one today — so until it exists, this
   decision's unqualified read-only rule is what actually holds.)*

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

## Consequences

**Good**

- The 2026-07-26/27 incident shape is impossible under the writer profile: a Local task can inherit
  the primary checkout and misunderstand its prompt, but the first write is refused before a byte
  changes.
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
  within its recorded scope through the nightly sleep window. A **new** mint still refuses offline,
  and this bullet reads unqualified until the receipt is built.)*
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
  shared checkouts, and adds the expiring claim receipt.
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
