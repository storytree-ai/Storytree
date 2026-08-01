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

**Accepted is not built — and as of 2026-08-02 it is PARTLY built, on Claude only, shipped OFF.**
What went green on 2026-07-28 was *what the wall must be*, not that any of it existed. Increment 1
(2026-07-29, #1001) added the pure decision — `packages/drive/src/write-authority.ts` — installed
nowhere. Increment 2 installs it for the Claude surface:

- **The Claude `PreToolUse` adapter EXISTS** (`packages/cli/write-authority-hook.mjs`) and is proven
  behaviourally: it spawns against real sibling worktrees and refuses the cross-session write, the
  lobby write, the `..` escape, a detached HEAD, a rewound branch, and an absent/expired/malformed
  receipt. The transport fork the arc recorded is settled — the hook loads the typed decision through
  tsx (MEASURED ~450 ms per write, against ~20 s for a ledger dial and ~2.3 s for the full CLI graph),
  so there is ONE implementation rather than a hand-rolled `.mjs` copy of the path logic.
- **The receipt of D5 is PARTLY built.** It is stamped by both claim ceremonies — `worktree create`
  (correcting the Codex reviewer's "does not stamp one today") and `noticeboard declare` — carries a
  finite `expiresAt`, is revoked by `noticeboard done`, and is re-validated on every write against the
  LIVE HEAD branch. It is **NOT SIGNED**, and today it has **no tamper-resistance at all**: the only
  thing that would give it any is the static deny block below, which is generated but not installed —
  and even once installed that binds the file tools, not a shell, so a shell could still forge one.
  **D5 is therefore OPEN**, and a green status here must not be read as closing it — the signing-key
  custody fork this ADR names is still unresolved.
- **The static containment of D1 is GENERATED but NOT INSTALLED** (`write-authority-rules.ts`, from
  `repo-manifest.json` so the lobby surface cannot drift from the wall). What was verified empirically
  on Windows is the harness DENY MECHANISM the generator targets — with a rule installed by hand, a
  denied `Write` is refused, a non-denied sibling path succeeds, and the rule binds without a session
  restart. The generated block itself has never been in force: it is emitted by a tested function and
  written nowhere.

**Nothing is enforced yet.** The hook ships behind `STORYTREE_WRITE_AUTHORITY`, defaulting OFF, and no
deny block is in `.claude/settings.json` — because static rules cannot be env-gated and, measured on
2026-08-01, 38 of the 39 registered worktrees held no live claim and 14 were on detached HEAD. Turning
it on before those are drained would refuse writes fleet-wide. The flip is a separate, deliberate PR.

**Still absent entirely:** the whole Codex adapter (D2/D3/D7), the lobby's trusted mint actuator (D4),
brokered common-directory access (D8), and Bash/shell containment on either surface. **D9's bar is NOT
met** — it demands proof under real concurrent load on both supported desktop surfaces, and this
increment's evidence is a spawned-hook suite on one. Until the flip lands, the only live enforcement
of this hazard remains
[ADR-0245](0245-cross-session-signalling-addresses-the-shared-primary-checko.md) D5.2's gate-time
lobby arm, which this ADR sits in front of rather than replaces.

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

4. **The lobby has an exact actuator, not a generic shell allowlist.** The source prohibition
   continues to cover tracked, untracked and ignored files. The trusted mint actuator alone may
   write the enumerated Git metadata needed by `worktree create` and reconstructible local tooling
   artifacts needed to run that exact ceremony. Its executable, arguments, working directory and
   target classes are validated as one operation. Allowing `git`, `pnpm`, `node_modules`, build
   caches or `.git` to generic shell/file tools is not equivalent and is refused. Provisioning
   inside the newly minted worktree occurs after the claim and is worktree-scoped.

5. **A minted worktree receives a tamper-evident, expiring claim receipt.** Extending ADR-0255 D7,
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

   *(Build state, corrected in place 2026-08-02 — the DECISION above is unchanged. This clause used
   to read "the receipt mechanism is unbuilt; `worktree create` does not stamp one today". Increment 2
   built the mechanism PARTLY: `packages/drive/src/write-authority-receipt.ts`, stamped by both
   `worktree create` and `noticeboard declare`, revoked by `noticeboard done`, carrying a finite
   `expiresAt`, re-validated against the live HEAD branch on every gated write, and refusing when
   absent, expired, malformed or branch-mismatched. The fifth required field — **the authority
   signature or MAC whose signing material is unavailable to the writer — does not exist**, so the
   receipt is not yet the tamper-evident authority artifact this decision requires and D5 is NOT
   closed. It is also inert: the hook that reads it ships behind `STORYTREE_WRITE_AUTHORITY`,
   default off.)*

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

9. **The behavioural proof bar is extended, not replaced by configuration review.** ADR-0255 D8
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
- The claim receipt degrades an already-authorised workspace during the nightly database window
  without turning ledger loss into general write authority.
- Shared-checkout safety and cross-session claim coordination are separated, so an isolated
  filesystem is not mistaken for an uncoordinated writer exemption.

**Bad / accepted**

- No Codex managed Storytree profile or interactive claim hook is installed today. Until they are
  built and behaviourally proved, a full-access Codex Local task remains outside the writer profile.
- Codex permission profiles are currently beta and require Codex 0.138.0 or later for managed
  profile allowlists. The managed fleet version becomes an explicit prerequisite.
- Static filesystem profiles and Git's shared common directory do not naturally express one live
  claim. A launcher-generated scope or broker is real machinery, not configuration wording.
- The receipt adds a second, short-lived representation of authority. Signing, key custody,
  renewal, expiry and revocation tests become load-bearing.
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
  unclaimed worktree would become writable below the semantic hook.
- **Grant the common `.git` directory broadly.** Rejected: it reopens primary and unrelated-ref
  mutation through the metadata side door.
- **Grant a generic shell so minting works.** Rejected: the narrow trusted actuator is the bounded
  form.
- **Use an unsigned or non-expiring receipt.** Rejected: the writer could forge it or retain stale
  authority indefinitely.
- **Treat a disposable remote checkout as claim-free.** Rejected: isolation removes co-tenant
  filesystem damage, not duplicate work or noticeboard invisibility.
- **Freeze every already-authorised workspace whenever the ledger sleeps.** Rejected: the signed,
  finite receipt preserves a past grant without permitting a new one.

## References

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
  `packages/cli/src/check-declared.ts` — is **BUILT and is the only LIVE enforcement of this hazard**
  (re-checked 2026-08-02: still true after increment 2, because this ADR's wall ships switched off and
  its static layer is written nowhere — "only live" is a statement about what is IN FORCE, not about
  what exists in the tree, and it stops being true the moment the flip PR lands), so it is the live
  backstop this ADR's wall would sit in front of, not legacy to fold away. The two are keyed differently on purpose: ADR-0245 keys on a **dirty** checkout at the
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
- `packages/cli/src/worktree-create.ts` — the claim-first mint to extend with a receipt.
- `packages/drive/src/noticeboard.ts` — `deriveIdentity()`, which the boundary validates against.
