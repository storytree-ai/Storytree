---
status: accepted
load_bearing: true
decided: 2026-07-28
amends: [255]
---
# ADR-0257: The write-authority wall is agent-inescapable and binds shared checkouts

## Status

accepted (2026-07-28) — **ratified by the owner on 2026-07-28.** The owner reviewed the five-day
friction report (2026-07-23 → 07-28), whose sixteen-item "concurrency & shared state" cluster is
exactly this ADR's subject, and approved every recommendation in it, naming this acceptance
explicitly. The separate owner action this ADR was deliberately held for has therefore happened, and
the Codex review round it was held through is complete.

Drafted `proposed` (2026-07-27) in the Claude Code review that followed
[ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md)'s landing, then
revised by the Codex review the owner requested before acceptance. The Codex review agrees with the
four amendments' intent and makes the Codex adapter concrete; it also corrects three overclaims in
the first draft. A Codex hook is not by itself a complete filesystem boundary, the existing Codex
phase hook is seed code rather than an interactive-session wall, and `worktree create` does not yet
stamp a claim receipt. **The first two corrections survive acceptance unchanged** and are the
standing guard against re-introducing those overclaims — an implementer citing a green status here
must still not read them as solved. *(Curated 2026-08-02: the THIRD is now half-discharged in its
literal form only — increment 2 makes `worktree create` stamp a receipt. What the correction was
really guarding survives in full: the receipt is UNSIGNED, so it is not yet the authority artifact
D5 requires. See the increment-2 note below.)*

> **AMENDED 2026-08-02 by [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md),
> before the semantic half was ever registered. READ THAT FIRST.** The owner de-scoped the
> worktree-to-worktree hazard (zero evidenced instances in five weeks) and RETIRED the `PreToolUse`
> half rather than deferring it: the hook, the receipt and the decision core are **deleted**. What
> stands from this ADR is the static deny block (D1's containment floor), the diagnosis of the lobby
> hazard, and the Codex decisions D2/D3/D7 — which are now the only live thread, because both
> documented incidents were Codex. D5 is CLOSED (not open); D9's proof bar is retired with what it
> proved. The build-state bullets below are kept as the record of what increments 1–3 produced;
> read them as history, not as current state.

**Accepted is not built — and as of 2026-08-02 it is PARTLY built, on Claude only, and now
ENFORCING on the developer machine.** What went green on 2026-07-28 was *what the wall must be*, not
that any of it existed. Increment 1 (2026-07-29, #1001) added the pure decision —
`packages/drive/src/write-authority.ts` — installed nowhere. Increment 2 (2026-08-01, #1072) wired it
into the write path and shipped it switched off. Increment 3 (2026-08-02) flipped it on; what that
changed is recorded after the increment-2 notes below.

- **The Claude `PreToolUse` adapter EXISTED** (`packages/cli/write-authority-hook.mjs`) and was proven
  behaviourally: it spawned against real sibling worktrees and refused the cross-session write, the
  lobby write, the `..` escape, a detached HEAD, a rewound branch, and an absent/expired/malformed
  receipt. The transport fork the arc recorded is settled — the hook loaded the typed decision through
  tsx (MEASURED ~450 ms per write, against ~20 s for a ledger dial and ~2.3 s for the full CLI graph),
  so there was ONE implementation rather than a hand-rolled `.mjs` copy of the path logic. *(Deleted
  by ADR-0284 D2 — never registered. Its behavioural suite could not see the two things that killed
  it: the harness lets a `PreToolUse` hook FAIL OPEN on anything but exit code 2, and a write to the
  harness scratchpad or the agent-memory directory is refused as "outside this repository", which
  would have broken every compliant session on its first such write.)*
- **The receipt of D5 was PARTLY built.** It was stamped by both claim ceremonies — `worktree create`
  (correcting the Codex reviewer's "does not stamp one today") and `noticeboard declare` — carried a
  finite `expiresAt`, was revoked by `noticeboard done`, and was re-validated on every write against
  the LIVE HEAD branch. It was **NOT SIGNED**, and a `Bash` command could forge one. *(Retired by
  ADR-0284 D4 with the hook that was its only consumer, which CLOSES D5 rather than leaving it open:
  the signing-key custody fork did not need resolving, it needed deleting. A defect found on the way
  out and worth recording: `evaluateReceiptAuthority` built the repo topology FROM receipt fields and
  never cross-checked them, so a forged receipt naming the lobby as its own worktree classified the
  whole repository as inside it.)*
- **The static containment of D1 is GENERATED** (`write-authority-rules.ts`, from `repo-manifest.json`
  so the lobby surface cannot drift from the wall). Increment 2 wrote it nowhere; increment 3 installs
  it. What increment 2 verified empirically on Windows was the harness DENY MECHANISM the generator
  targets, with a rule installed by hand; increment 3 verified the generated block itself, in force.
  **This is the half that stands** (ADR-0284 D3).

**As of increment 2 nothing was enforced.** The hook shipped behind `STORYTREE_WRITE_AUTHORITY`,
defaulting OFF, and no deny block was installed — because static rules cannot be env-gated and,
measured on 2026-08-01, 38 of the 39 registered worktrees held no live claim and 14 were on detached
HEAD. Turning it on before those were drained would have refused writes fleet-wide.

**Increment 3 (2026-08-02) is the flip, and it is machine-scoped.** The owner confirmed a drained
fleet (measured: zero live claims on the ledger) and it landed:

- **The switch defaults ON.** `STORYTREE_WRITE_AUTHORITY=off` is now the human kill switch. The
  invariant is *registered means enforcing* — a hook wired into settings yet silently inert, because
  an env var was never set, is no longer a reachable state. *(Both the switch and the hook it gated
  are gone — ADR-0284 D2. Deny rules cannot be env-gated, so there is no kill switch for what
  remains: lifting the static half means editing `permissions.deny` directly.)*
- **The wall installs USER-level, not in the repository**, through
  `storytree write-authority install --write`. Three mechanics force this and none of them is taste:
  the deny rules are unavoidably ABSOLUTE (a single-leading-slash rule anchors at the settings file's
  own directory, so a "relative" block would resolve against each WORKTREE's root and deny every
  session its own `packages/**`); a committed absolute block is keyed to one machine and fails in
  every worktree and in CI; and `.claude/settings.local.json` cannot carry it either — Claude Code
  resolves that file THROUGH worktrees to the main checkout, so it is one SHARED file for the whole
  fleet rather than a per-worktree one. *(This third mechanic originally read "gitignored, hence
  absent in a freshly minted worktree". That reason was wrong — the file is shared, not absent —
  and is corrected in place per ADR-0139; the conclusion it supported is unaffected. Verified
  behaviourally 2026-08-02: a deny rule written into a worktree's own `settings.local.json` does not
  bind that session, while the user-level block demonstrably does.)* The hook registration carried
  `--root <checkout>` so a user-level registration did not fire in every other repository on the
  machine. That bound also kept **remote/web container sessions unaffected**, which is D6's
  single-tenant exemption — they are plain clones, and a committed registration would refuse every
  write in them. *(Moot since ADR-0284 D2: there is no registration. The deny rules name absolute
  paths on one machine, so remote sessions are untouched by construction.)*
- **The generated block is installed by a command, never by hand**, because it is DERIVED from
  `repo-manifest.json`; a derived artifact that can only be produced by hand rots at the first
  manifest change. The conformance test that increment 2 left self-arming now points at the installed
  user-level file and is green there. It is local-only by construction: CI has no installed wall.
- **The hook's HOST is not assumed.** The registration names an absolute script inside a real
  checkout, so what runs is whatever that checkout's branch holds. On 2026-08-02 the protected lobby
  sat on `claude/act2-intro-decisions`, which predated the wall entirely — the script did not exist.
  The installer therefore verifies the host script is present AND post-flip before registering, and
  REMOVES a stale registration rather than leaving one that falls open; `--hook-from <checkout>` lets
  a pinned checkout host the wall for a lobby that cannot. *(ADR-0284 D2 read this the other way and
  retired the hook because of it: an install-time presence check is a SNAPSHOT, and a boundary whose
  integrity depends on a git branch not moving is a convention, not a wall. The host check and
  `--hook-from` are deleted; `install --write` now only strips a legacy registration.)*
- **A brick was found and fixed, and only running the wall for real could find it.** Installed, the
  wall refused EVERY write including the session's own claimed worktree, reporting them as "outside
  this repository". `normaliseForCompare` in `write-authority.ts` folded case and trailing separators
  but not `/` vs `\`, while `containsPath` built its boundary with `path.sep` — and the two sides
  disagree on Windows by construction, because topology roots come from `locateWorktree` (which
  forward-slashes) and canonical targets come from `realpathSync.native` (which does not). All 49
  tests passed throughout: every fixture built both sides with the same `path.join`, so their
  separators always agreed. This is D9's argument in miniature — unit tests of hook code are
  necessary and not sufficient — and it is now pinned by regression tests at both layers.

**What is in force on the dev machine today:** the static deny block (93 rules), verified
behaviourally — a `Write` into the lobby is refused, a write inside a worktree succeeds. **That is
the whole wall, permanently** (ADR-0284 D2/D3). The semantic half was registered once, exercised
end-to-end (own worktree allowed; sibling worktree refused *by name*; lobby refused), then
unregistered because the only host carrying the post-flip script was an ephemeral worktree — and it
was retired before it was ever registered again.

**Read that split precisely, because the static half is CLAIM-BLIND.** The deny block is a list of
absolute paths; it cannot know a claim, a branch or a session. It denies the LOBBY and permits
everything under `.claude/worktrees` — necessarily, since denying that would freeze the fleet, and a
deny rule cannot carry an allow-exception. So **one session writing into a SIBLING session's worktree
is not refused by anything.** What increment 3 achieved is therefore the LOBBY hazard, not session
isolation: the primary checkout is closed to Claude's file tools, and worktree-to-worktree remains
open. *(Verified 2026-08-02 against the installed block: 93 rules, none matching `.claude/worktrees`.)*
**ADR-0284 D1 accepts that gap deliberately** rather than treating it as unfinished work: five weeks
of heavy concurrent use produced zero evidenced worktree-to-worktree writes, against 13 for the lobby.
It returns as work if an incident is filed.

**Current split (corrected in place 2026-08-13, then RE-corrected 2026-08-14 per ADR-0139 — see
ADR-0355 § Delivery status).** The preserved Codex adapter (D2/D3/D7) and exact lobby actuator are
installed on the supported Windows host, and the managed OS profile's individual writer-scope
behaviour (contains Codex shell and patch routes to one claimed worktree; the managed hook re-reads
its live claim) was observed. **That is not the same as "attested":** ADR-0355 D5's live smoke — the
full lobby-bootstrap-through-write lifecycle — has NOT passed; the lobby bootstrap hits a credential
circularity that stops it reaching a claimed worktree at all on a live task. Claude remains on
ADR-0284's static, claim-blind file-tool wall: its shell and accepted sibling-worktree gap are
unchanged. Shared Git authority is not granted broadly; the trusted actuator owns the exact bootstrap
and launch operations, once the credential fork is resolved. **D9's bar remains retired** by ADR-0284
D7; ADR-0355 D5 and its installed-host smoke are the governing Codex delivery evidence, and that
evidence does not yet exist.
[ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) D5.2's gate-time
lobby arm is no longer the *only* live enforcement — since increment 3 this ADR's static layer refuses
lobby writes before mutation — but it still stands as the landing-gate backstop this ADR sits in front
of rather than replaces, and it remains the only arm that covers a shell. *(It reads accurately as
of 2026-08-02. It briefly did not: in `check-declared.ts` that arm was reached only when
`deriveIdentity()` was null and then only in the primary checkout, so a worktree session's gate never
checked whether the lobby was dirty. The scoping was fixed the same day — the arm is pure git, needs
no session identity, and now runs for every session against the primary checkout's tree; see
ADR-0245 D5.2's build note.)*

**Amends** [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md). The
`amends: [255]` edge **now binds** (it bound on acceptance, 2026-07-28). ADR-0255 D2, D3, D5, D6 and
D8 stand: repository writes are claim-bound, claim-before-workspace remains literal, the invariant is
harness-neutral, one workspace session holds one wisp, and proof is behavioural. This ADR:

- re-decides D4 as the strongest agent-inescapable composition each supported harness actually
  provides;
- re-decides D7 with a tamper-evident, expiring claim receipt;
- narrows D1's checkout wall to shared checkouts without narrowing D2's coordination rule; and
- binds the Codex adapter to managed hooks **and** a managed filesystem permission profile.

The first three amendments are recorded in place at ADR-0255 D1, D4 and D7. The fourth is **not** an
amendment: ADR-0255 D5 already required a constrained Codex filesystem profile *and* a managed
pre-tool policy, and expressly allowed the vendor syntax to evolve — D2/D3/D7/D8 below INSTANTIATE
that decision rather than change it, and ADR-0255 D5 carries a note saying so.

## Context

ADR-0255 correctly diagnosed the 2026-07-26/27 loss-of-isolation incident: prompts cannot enforce
what only an authority boundary can. The claim-first ceremony is real code —
`packages/cli/src/worktree-create.ts` mints identity, takes the exploring claim, and only then
performs `git worktree add`. Nothing compels an interactive session to use it:
`deriveIdentity()` returns `null` in the primary checkout, a late gate cannot prevent the checkout
being dirtied, and neither supported desktop surface currently installs a claim-aware pre-write
wall.

The first draft of this ADR identified four real corrections to ADR-0255:

1. A human recovery hatch and an agent-selectable escape are different threat models. Human
   maintenance may remain possible while the normal agent profile is unable to disable or approve
   around its own boundary.
2. Refusing every write whenever the ledger is unavailable conflicts with the fixed ADR-0114
   database sleep window. ADR-0258 additionally corrects “remote cannot reach the database” to
   “remote cannot run the Cloud SQL connector”, and ADR-0259 directs every client toward an HTTP
   store front door. That front door is the eventual remote claim path, but its client half is not
   built yet.
3. The lobby needs one narrow actuator that can change shared Git metadata and install a new
   worktree without granting its generic agent tools the same authority.
4. The filesystem hazard that caused the incident is co-tenancy: many sessions could reach and
   strand one durable checkout.

The Codex review adds three load-bearing corrections.

**A Codex hook is not the whole wall.** Current Codex supports managed `PreToolUse` hooks over shell,
`apply_patch`, MCP and most local function tools, but its own contract says specialised tool paths
may opt out and hooks are a guardrail rather than a complete enforcement boundary. Project hooks
also depend on repository trust and non-managed hooks can be disabled. Codex separately supports
system-managed permission profiles on native Windows. The honest Codex boundary is therefore the
composition: managed filesystem containment prevents mutation, while the managed hook applies the
dynamic repository/worktree/claim rule and explains refusals.

**The existing leaf hook is not the interactive policy.**
`packages/agent/src/codex-scope-hook.mjs` protects one prove-it phase in a disposable replica. It
denies shell, MCP and subagents, checks phase globs rather than noticeboard authority, and relies on
the replica as its hard isolation wall. It is useful path-normalisation and patch-envelope seed
code, but extending it to an interactive caller is new machinery. The Claude SDK phase hook has the
same caller distinction.

**A receipt must be an authority artifact, not a writable note.** A plain JSON file inside an
agent-writable worktree can be forged. A timestamp without an enforced expiry does not bound stale
authority. Offline continuation is safe only when the receipt is issued by the claim authority,
cannot be forged by the writer, expires, and is read-only to the writer profile.

## Decision

1. **The authority bar is agent-inescapable, and the strongest supported composition is required.**
   Enforcement must be impossible for the agent to disable, select around, or approve its way past.
   A fail-closed pre-tool policy is mandatory on every supported interactive harness. It is
   sufficient as the semantic decision layer only where that harness proves complete coverage of
   every local write path; otherwise a filesystem boundary or broker remains part of the current
   minimum, not merely a future improvement. A human may enter a separately selected maintenance
   profile, but the agent cannot request, approve or activate it.

   *(Composition AMENDED 2026-08-02 by ADR-0284 D2/D5. The bar itself stands; the sentence "a
   fail-closed pre-tool policy is mandatory on every supported interactive harness" does not, for
   Claude Code. A `PreToolUse` hook FAILS OPEN — only exit code 2 blocks, so an absent script, a
   missing interpreter, a timeout or a crash all admit the write — and its integrity depends on a
   git branch not moving, which makes it a guardrail and not a mechanism that can satisfy this
   clause's own inescapability requirement. On Claude the composition is now the static
   `permissions.deny` block ALONE. Codex, where the hook pairs with an OS-level managed profile that
   also binds the shell, is the one surface where D2/D3's composition still reads correctly.
   ADR-0355's repository generator, trusted actuator, and administrator-owned installation are
   complete as of 2026-08-13, and the three-write attestation appears genuine; what is **NOT**
   complete is the LIFECYCLE (corrected in place 2026-08-14 per ADR-0139 — a fresh Codex desktop
   session that same day could not reach a claimed worktree from the lobby at all; see ADR-0355 §
   Delivery status for the credential circularity blocking it). Attesting a writer already inside a
   worktree does not attest how it got there. Re-attestation remains operator-owned when the managed
   payload, Codex version, or Windows sandbox changes, and a first lobby-to-write lifecycle
   attestation is still outstanding.)*

2. **Codex requires a managed permission profile and managed hooks together.** The Codex adapter is
   delivered from the system/enterprise managed layer, not only from repository `.codex` config:

   - `%ProgramData%\OpenAI\Codex\requirements.toml` on Windows pins hooks on, uses
     `allow_managed_hooks_only = true`, selects an administrator-defined Storytree permission
     profile, and permits only the explicitly named profiles. `:danger-full-access` is omitted.
   - The managed profile keeps the primary Storytree checkout read-only and grants source writes
     only to the eligible repository-minted worktree scope. It does not mix permission profiles
     with legacy `sandbox_mode` settings.
   - A managed `PreToolUse` hook with an absolute installed script path applies the dynamic
     path/worktree/branch/claim/receipt decision to every documented local tool route. A managed
     `PermissionRequest` hook records and explains attempts to widen filesystem authority or enter
     a bypass permission mode; managed requirements make those requests unsatisfiable.
   - A `SessionStart` hook may identify lobby versus worktree, derive the logical Storytree session
     id and inject the next ceremony. It is feedback; it never grants authority.

   If a static permission profile cannot express “only this currently claimed worktree”, the
   adapter must generate a claim-scoped profile through a trusted launcher or broker writes. It
   must not weaken the profile to “all Storytree checkouts are writable” and call the hook a
   substitute for containment.

   *(Amended 2026-08-12 by [ADR-0355](0355-interactive-codex-writes-only-in-its-current-claimed-worktre.md):
   the selected scope is exactly the current repository-minted claimed worktree. Repository code now
   generates and dry-runs the managed requirements, hook bundle, and launch evidence; the privileged
   machine installation remains deliberately operator-owned.)*

3. **The Codex policy resolves actual targets and fails closed.** Before a documented local tool is
   allowed, the managed hook:

   - canonicalises `cwd` and every target after Windows drive-case, junction/symlink and Git
     common-directory resolution;
   - distinguishes the canonical primary checkout from registered worktrees;
   - derives the Storytree `sessionId` from the repository-minted worktree, treating Codex
     `session_id` as provenance only;
   - verifies the current branch and live claim, or a valid offline receipt under D5;
   - inspects every patch add/update/delete/move target;
   - denies write-capable MCP/plugin/local tools whose targets cannot be extracted; and
   - denies ambiguous shell commands in the lobby instead of trying to infer that they are
     read-only.

   `PreToolUse` coverage is inventoried against the deployed Codex version. Hosted or specialised
   tools that do not traverse the hook path receive no local filesystem authority from the writer
   profile. A newly introduced write path leaves the adapter red until it is contained and proven.

   *(Stands as a Codex clause (ADR-0284 D6) with one dead dependency, annotated 2026-08-02: the
   fourth bullet's "or a valid offline receipt under D5" has no referent — D5 is retired and nothing
   mints a receipt. ADR-0355 resolves the adapter to live-claim verification and fail-closed launch;
   ledger loss does not widen authority.)*

4. **The lobby has an exact actuator, not a generic shell allowlist.** The source prohibition
   continues to cover tracked, untracked and ignored files. The trusted mint actuator alone may
   write the enumerated Git metadata needed by `worktree create` and reconstructible local tooling
   artifacts needed to run that exact ceremony. Its executable, arguments, working directory and
   target classes are validated as one operation. Allowing `git`, `pnpm`, `node_modules`, build
   caches or `.git` to generic shell/file tools is not equivalent and is refused. Provisioning
   inside the newly minted worktree occurs after the claim and is worktree-scoped.

5. **RETIRED 2026-08-02 by [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) D4
   — this clause is dead, and D5 is CLOSED rather than open.** The receipt's only consumer was the
   `PreToolUse` hook; with the hook retired the receipt is deleted from both claim ceremonies and from
   `noticeboard done`, and the signing-key custody fork below did not need resolving — it needed
   deleting. The clause is kept unedited for the record; do not implement it.

   ~~**A minted worktree receives a tamper-evident, expiring claim receipt.**~~ Extending ADR-0255 D7,
   the claim authority stamps a receipt only after the claim succeeds and before the workspace is
   handed to a writer. The receipt contains at least:

   - logical session id, branch, unit ids and grades;
   - receipt id, issuer/key id and policy version;
   - `issuedAt` and a finite `expiresAt`; and
   - an authority signature or MAC whose signing material is unavailable to the writer.

   The receipt lives at a fixed path that the writer profile can read but cannot modify. When the
   ledger is reachable it is authoritative: the adapter re-validates and may refresh the receipt,
   and a release, downgrade, branch mismatch or expiry refuses the next write. When the ledger is
   unreachable, a matching unexpired receipt admits only its recorded scope. Missing, deleted,
   malformed, forged, expired or mismatched receipts refuse. An unreachable ledger never permits a
   new mint.

   *(Build state, final — corrected in place 2026-08-02 per ADR-0139. Increment 2 built the mechanism
   PARTLY (`packages/drive/src/write-authority-receipt.ts`, stamped by `worktree create` and
   `noticeboard declare`, revoked by `noticeboard done`, finite `expiresAt`, re-validated against the
   live HEAD branch, refusing when absent/expired/malformed/branch-mismatched) and never built the
   fifth required field — the authority signature or MAC whose signing material is unavailable to the
   writer. **It is now DELETED** (ADR-0284 D4) along with the hook that read it. An earlier version of
   this note read "D5 is NOT closed" and "the receipt is now enforced and file-tool tamper-resistant";
   both are false as of ADR-0284 — nothing stamps, reads or enforces a receipt. A defect found on the
   way out, recorded because it bears on any future revival: `evaluateReceiptAuthority` built the repo
   topology FROM receipt fields and never cross-checked them, so a forged receipt naming the lobby as
   its own worktree classified the whole repository as inside it.)*

6. **The checkout wall binds shared checkouts; claim coordination still binds every writer.**
   ADR-0255 D1's lobby filesystem wall applies wherever more than one agent session can reach a
   durable checkout: the developer machine's primary checkout and any long-lived shared host.
   Single-tenant disposable containers do not need that lobby wall because they cannot strand a
   co-tenant's filesystem. This does **not** exempt them from ADR-0255 D2: a top-level repository
   writer still needs the one noticeboard claim, and its work still appears as one session/wisp.
   ADR-0259's HTTP front door is the target transport for remote claims. Until that path is built
   and proven, remote claim-bound authoring is a recorded capability gap rather than an invisible
   exception.

7. **Codex-native worktrees are not authorised by naming or convenience.** Codex Desktop currently
   creates managed worktrees under `$CODEX_HOME/worktrees` in detached HEAD state, before
   Storytree's claim-first ceremony. The interim Codex writer opens the repository-minted claimed
   worktree as its project/local checkout. Native Codex Worktree/Handoff becomes eligible only when
   an adapter proves claim-before-creation and registers the same logical identity. Child agents
   inherit the parent's filesystem profile and Storytree workspace identity; the Codex parent
   session id remains correlation metadata.

8. **Shared Git metadata stays brokered or exactly scoped.** A linked worktree's commits and refs
   touch the common `.git` directory owned by the primary checkout. The Codex profile must not grant
   that directory broadly. The mint, commit and landing paths use a broker/trusted actuator or an
   exact per-worktree metadata scope that cannot modify the primary index, HEAD, config, hooks or
   unrelated refs. Source editing may be proved before this Git lifecycle is complete, but the
   Codex adapter is not end-to-end green until the common-directory cases pass.

9. **RETIRED 2026-08-02 by [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) D7
   — the bar has no subject left.** Every item below proves the semantic layer or the receipt, both
   deleted. The proof that remains for the layer that stands is the static block's conformance test
   against the installed user-level file. ADR-0355 has since built the distinct Codex adapter, but
   this retired list did not reactivate: ADR-0355 D5 and the installed-host smoke are its governing
   proof bar, while the receipt items below remain void. Kept unedited for the record.

   ~~**The behavioural proof bar is extended, not replaced by configuration review.**~~ ADR-0255 D8
   stands in full. Codex additionally proves on the real supported Desktop/CLI boundary:

   - primary-checkout edits through `apply_patch`, shell, MCP/plugin/local tools and absolute paths
     refuse before mutation;
   - disabling or distrusting project hooks does not remove the managed wall;
   - the agent cannot select full access, another permission profile or a successful escalation;
   - a claimed repository-minted worktree accepts scoped writes;
   - stale/released/mismatched claims and malformed/forged/expired receipts refuse;
   - a valid unexpired receipt permits only its recorded scope during ledger loss;
   - an offline mint is absent after refusal;
   - child agents and junction/symlink targets cannot escape;
   - Codex-native unmanaged worktrees remain read-only; and
   - the trusted mint and Git actuators work without granting generic lobby or common-directory
     writes.

   Unit tests of hook code, receipt validation or rendered TOML are necessary but not sufficient.

## Consequences

**Good**

- The Codex recommendation is executable: managed configuration supplies non-self-selectable
  containment, while the hook supplies the live claim decision and useful refusal.
- The two surfaces keep one repository invariant without pretending their policy mechanisms have
  equal coverage.
- The existing Codex leaf contributes tested parsing ideas without being mislabeled as an
  interactive-session wall.
- ~~The claim receipt degrades an already-authorised workspace during the nightly database window
  without turning ledger loss into general write authority.~~ *(Void — D5 retired, ADR-0284 D4. The
  static block has no ledger dependency at all, so the ADR-0114 sleep window is a non-issue for the
  layer that stands, by removal rather than by design.)*
- Shared-checkout safety and cross-session claim coordination are separated, so an isolated
  filesystem is not mistaken for an uncoordinated writer exemption.

**Bad / accepted**

- The Codex managed Storytree profiles, interactive claim hook, live-claim reader, and trusted
  actuator are installed on the supported operator boundary (ADR-0355), and the individual
  writer-scope profiles were observed to admit/refuse writes as designed — lobby and sibling writes
  refused, the current claimed worktree admitted. **What is not yet behaviourally attested is the
  LIFECYCLE** (corrected in place 2026-08-14 per ADR-0139 — this bullet previously read those three
  writes as settling the matter; a fresh Codex desktop session on 2026-08-13 showed it does not,
  because the lobby bootstrap cannot yet reach a claimed worktree at all — see ADR-0355 § Delivery
  status). That proof, once obtained, is
  machine/version-specific and must be repeated when the managed payload, Codex version, or Windows
  sandbox changes; an unmanaged full-access Codex process is not the writer profile.
- Codex permission profiles are currently beta and require Codex 0.138.0 or later for managed
  profile allowlists. The managed fleet version becomes an explicit prerequisite.
- Static filesystem profiles and Git's shared common directory do not naturally express one live
  claim. A launcher-generated scope or broker is real machinery, not configuration wording.
- ~~The receipt adds a second, short-lived representation of authority. Signing, key custody,
  renewal, expiry and revocation tests become load-bearing.~~ *(Void — D5 retired, ADR-0284 D4. This
  cost was correctly foreseen and is the main thing the retirement buys back, along with the 12-hour
  TTL that would have refused long sessions mid-work.)*
- The HTTP claim client directed by ADR-0259 is unbuilt, so remote claim-bound authoring does not
  become green merely because this ADR names the route.
- The enumerated actuator allowlist requires maintenance as Git and package tooling change.

## Rejected alternatives

- **Use only a project `.codex/hooks.json`.** Rejected: project trust controls whether it loads, and
  non-managed hooks can be disabled.
- **Treat the managed Codex hook as a complete filesystem boundary.** Rejected: Codex documents
  specialised paths outside default hook coverage. The managed permission profile is mandatory.
- **Call the existing phase hook the interactive policy.** Rejected: it is replica- and
  phase-specific and validates no noticeboard authority.
- **Permit every `.claude/worktrees` directory in the static writer profile.** Rejected: a stale or
  unclaimed worktree would become writable below the semantic hook. *(This rejection is REVERSED in
  effect by ADR-0284 D1/D2 — read it as history, not as current policy. It is exactly what ships: a
  deny rule cannot carry an allow-exception, so denying `.claude/worktrees` would freeze the fleet,
  and there is no semantic hook underneath any more. Every worktree, stale or unclaimed, is writable
  by every session. The owner de-scoped that as a hazard on zero evidenced instances in five weeks.)*
- **Grant the common `.git` directory broadly.** Rejected: it reopens primary and unrelated-ref
  mutation through the metadata side door.
- **Grant a generic shell so minting works.** Rejected: the narrow trusted actuator is the bounded
  form.
- **Use an unsigned or non-expiring receipt.** Rejected: the writer could forge it or retain stale
  authority indefinitely. *(Moot since ADR-0284 D4 — there is no receipt of any kind. The judgement
  itself held up: what increment 2 actually shipped WAS the unsigned form this bullet rejects.)*
- **Treat a disposable remote checkout as claim-free.** Rejected: isolation removes co-tenant
  filesystem damage, not duplicate work or noticeboard invisibility.
- **Freeze every already-authorised workspace whenever the ledger sleeps.** Rejected: the signed,
  finite receipt preserves a past grant without permitting a new one. *(The rejection stands; its
  stated remedy does not — no receipt exists (ADR-0284 D4). The static block simply never consults
  the ledger, so nothing freezes when it sleeps.)*

## References

- [ADR-0284](0284-the-write-authority-wall-stays-static-worktree-to-worktree-i.md) — **amends this
  ADR** (2026-08-02): D1's composition, D5 and D9 change; D2/D3/D7 stand. Read it before acting on
  anything here.
- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) — the decision
  this proposes to amend.
- [ADR-0258](0258-the-inner-loop-is-separable-from-the-store-remote-sessions-l.md) — remote sessions
  lack the Cloud SQL connector, not HTTPS reach.
- [ADR-0259](0259-every-client-reaches-the-store-through-an-http-front-door-di.md) — every client
  reaches the store through HTTP; the client half remains unbuilt.
- [ADR-0114](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md) — the fixed
  01:00–07:00 Sydney sleep window.
- [ADR-0232](0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md) — the Codex disposable-replica
  phase leaf.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the one ledger
  and claim-gated workspace ceremony.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) —
  claim-before-worktree and hard refusal.
- [ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) — the **gate-time
  arm** of the same shared-primary-checkout hazard. *Curated 2026-07-28: the fold/supersession
  question this entry used to leave open is now answered — ADR-0245 is **accepted** (owner-directed,
  2026-07-26), it is **not** superseded, and ADR-0255 now carries the missing `amends: [… 245]`
  edge. Its D5.2 arm — `evaluateLobby` / `evaluateLobbyFromGit` in
  `packages/cli/src/check-declared.ts` — is **BUILT and in force**. It was the *only* live enforcement
  of this hazard through increment 2; **increment 3 ended that** (2026-08-02) by installing this ADR's
  static deny layer, which refuses a lobby write before mutation rather than at the landing gate. It
  remains the backstop this wall sits in front of rather than legacy to fold away, and it is still the
  only arm covering a SHELL, which neither layer of this wall binds.
  The two are keyed differently on purpose: ADR-0245 keys on a **dirty** checkout at the
  landing gate; ADR-0255/0257 key on an **agent write attempt** before mutation. Its D3/D4 push half
  is owner-parked and out of scope here.*
- [Codex hooks](https://learn.chatgpt.com/docs/hooks.md) — managed hook delivery, tool coverage and
  the documented boundary caveat.
- [Codex permissions](https://learn.chatgpt.com/docs/permissions.md) — managed filesystem profiles
  and path precedence.
- [Codex managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration.md)
  — `requirements.toml`, allowed profiles and non-user-overridable requirements.
- [Codex worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees.md) — Desktop-managed
  worktree location, detached HEAD and Handoff behaviour.
- `packages/agent/src/codex-scope-hook.mjs` — replica-phase seed code, not the interactive policy.
- `packages/agent/src/sdk-author.ts` — the analogous Claude SDK phase boundary.
- `packages/cli/src/worktree-create.ts` — the claim-first mint. *(It stamped a receipt from
  increment 2 until ADR-0284 D4 removed it; it mints identity and takes the claim, nothing more.)*
- `packages/cli/src/codex-session-containment.ts` — ADR-0355's managed-policy, hook, and trusted
  actuator generator; installation and installed-host attestation remain administrator-owned.
- `packages/cli/src/codex-live-claim-probe-entry.ts` — the standalone bundle entry that read claims
  through the dedicated keyless, read-only identity at the time this ADR was written; DELETED by
  ADR-0375 D8, which moved the live-claim read onto the resident claim authority instead.
- `packages/drive/src/noticeboard.ts` — `deriveIdentity()`, which the boundary validates against.
- `packages/drive/src/write-authority-rules.ts` — the generator for the static deny block, which is
  the whole of this ADR that runs. *(The hook, the receipt module and the decision core
  `write-authority.ts` are deleted — ADR-0284 D2/D4; recover them from git if a Codex adapter needs
  the canonicalisation and containment logic.)*
