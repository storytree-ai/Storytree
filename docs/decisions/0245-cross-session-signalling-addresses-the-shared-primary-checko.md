---
status: accepted
decided: 2026-07-26
amends: [200]
---
# ADR-0245: Cross-session signalling addresses the shared primary checkout, not a session

## Status

accepted (2026-07-26) — born `proposed` from agent research after the incident below, then
**ratified by the owner with an explicit scope split** (ADR-0110: design-time alignment is
ratification):

> "yes build D5.2. If theres no current push surface from the db due to harness constraints then
> thats fine we can leave this until anthropic and codex provide us with a solution"

So this ADR is accepted **in two speeds**, and the distinction is load-bearing — do not read the
green status as "all six decisions are built":

- **D1, D2, D5, D6 are accepted AND D5.2 is BUILT** (`check:declared`'s lobby arm). The reasoning
  that the addressable entity is the *checkout* rather than a session (D2) is what D5.2 rests on,
  so it is ratified with it.
- **D3 and D4 — the push/delivery half — are accepted as ANALYSIS but deliberately PARKED, not
  built.** The owner's call is that a genuine push surface is a harness capability we do not have:
  no hook, gate, or CLI can invoke an MCP tool, `send_message` cannot see a Codex session
  (ADR-0232), and nothing interrupts a running session mid-turn. Rather than ship hook-based
  nudges that would be the weakest part of the design, we wait for Anthropic and/or Codex to
  provide a real channel. **This is a deferral, not a rejection** — D3's evaluation table stands as
  the record of what was ruled out and why, so a future revisit starts from the finding, not from
  scratch. Re-opening it needs no new ADR unless the conclusion changes.

The `amends: [200]` edge is now BINDING, and only for what shipped: ADR-0200 D3's `check:declared`
SKIP arm no longer returns silently for a dirty primary checkout. ADR-0200 D4's cursor-once
principle is untouched (nothing was added to the ledger, and no scheduled notification exists).

**Reconciled with ADR-0255 / ADR-0257 by the librarian pass, 2026-07-28 — this ADR is NOT
superseded.** [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md)
(accepted 2026-07-27, owner-directed) decided the same hazard independently and without citing this
ADR; that missing edge is now recorded there as `amends: [… 245]`, and
[ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) hardens it further
(**accepted 2026-07-28**, owner-ratified — it amends ADR-0255, not this ADR, and does not touch this
ADR's machinery). The honest relationship is **complementary defence in depth, differently keyed**,
not duplication:

- **This ADR is the GATE-TIME arm** — keyed on **dirty**, it refuses the *landing* once the shared
  checkout already carries uncommitted work. It is BUILT (D5.2) and is the only enforcement of this
  hazard that exists today.
- **ADR-0255 is the WRITE-TIME arm** — keyed on an *agent write attempt*, it aims to stop the
  checkout becoming dirty at all, via a claim-bound authority boundary. It is **not built**: no
  pre-tool write policy or filesystem/broker wall exists in this repo yet, and ADR-0257 §Context
  records the same.

What ADR-0255 amends here is **D5's ranking, not D5's machinery**: the merge gate is no longer "the
boundary that matters" (this ADR's D5.2 wording) but the late backstop behind a write-time wall.
D5.2 itself stands and stays built — ADR-0255 D4 names `check:declared` as part of its feedback
layer and its Consequences keep "the late gate ... as defence in depth", and its Rejected
alternatives reject the gate only as *the authority boundary*. Two reasons the gate arm remains
load-bearing even once the wall lands: ADR-0255 D7 preserves an explicit **human** recovery path (a
human editing the primary checkout directly is not an agent harness, so no pre-tool policy observes
it), and ADR-0255 D8's proof bar is behavioural and unmet, so until it is met this arm is the whole
ratchet. **Removing or disabling D5.2 would be an owner decision, not a curator one.**

D1/D2's reasoning — the fault is a *condition of the checkout*, never an accusable session — is
adopted by ADR-0255 D1 (which addresses the checkout, not an identity) and survives intact. D3/D4
remain owner-parked as above; ADR-0255/0257 do not revive them.

## Context

**The incident (2026-07-26).** A session about to land an ADR found the primary checkout dirty with
398 uncommitted lines it did not own — a concurrent session had built `storytree arc close` and the
ADR-0239 lifecycle guards directly in the primary checkout, unstaged. `HEAD` had also been
fast-forwarded mid-session (`56fa6b9e` to `47be4211`) and the reflog showed a
`codex/story-detail-panel-polish` checkout. The landing session had to halt and escalate; a `git add -A`
would have swept a stranger's work into an unrelated PR.

**It is still happening, and the reproduction sharpens the diagnosis.** While researching this ADR
the primary checkout was dirty again — 13 files, 500 insertions, 99 deletions — with the same reflog
shape (`56fa6b9e` to `47be4211`, the `codex/story-detail-panel-polish` checkout). Crucially it sat on
branch **`codex/adr-library-cleanup`**, a working branch, *not* on `main`. At that same moment
`storytree noticeboard --pg` listed five sessions and **none of them was the one holding those 500
lines.**

**Two sessions independently filed this as friction, and their evidence sharpens it further.**
`friction-concurrent-session-writes-main-checkout-reds-the-gate` (2026-07-25) records a *second-order*
harm this ADR must cover: a docs-only branch got a **false red gate** from a stranger's half-written
`TreeView.tsx` (mtime 25 s old, the file growing 4899 to 4928 lines between two reads in one session)
— and worse, "the shared checkout had been switched to this session's branch by `git checkout -b`, so
the other session's uncommitted work was riding a stranger's branch until it was switched back."
`friction-mutating-session-primary-checkout-not-refused` (2026-07-25) independently confirms the
enforcement hole: a Codex session ran `git switch -c` in the primary checkout, built, and "completed
a full gate before the owner asked whether it was in a worktree" — and only once moved into a real
worktree did `check:declared` FAIL, because "the primary-path run had not surfaced that boundary."
That is Context fact 2 below, observed by another session before this ADR was written.

That reframes the ask. The provable fault is not "a session is working on branch `main`" — it is
**uncommitted work in the shared primary checkout**. The primary checkout is infrastructure every
other session depends on: it holds the common git dir (`git rev-parse --git-common-dir` resolves
there from every worktree), the harness transiently checks branches out there while creating
worktrees (ADR-0033), and ADR-0220's auto-repair performs git surgery on it. Dirt there is what
breaks siblings, whatever branch is checked out.

**Three structural facts make this class invisible rather than merely unlucky.**

1. `deriveIdentity()` (`packages/drive/src/noticeboard.ts`) keys the session id on the
   `.claude/worktrees/<name>` path and returns `null` for a plain checkout. A session in the primary
   checkout therefore **cannot hold a claim at all** — it is absent from `events.node_claim` by
   construction, not by neglect. ADR-0200 D3 names the primary checkout the "lobby" and expects
   sessions to *pass through* it; the failure mode is a session that **stays and starts working**.
2. `check:declared` (ADR-0200 D3) opens with `if (identity === null) return;` — it **SKIPs silently**
   for exactly the session that is misbehaving. The one fail-closed claim gate we have fails **open**
   against this fault.
3. The ADR-0200 D4 delta footer rides `--pg` envelopes keyed on `events.claim_cursor.session_id`, and
   `attachDeltaFooter` returns unchanged when identity is null. The existing push channel
   **structurally cannot reach a lobby session** — it has no cursor row and no claim set to intersect.

So the offending session is simultaneously unnameable, ungated, and undeliverable-to by every
mechanism the repo has. Any design keyed on a *session identity* inherits all three holes.

## Decision

### D1 — Detection is a local git probe of the primary checkout; attribution is not attempted

Detection needs no DB, no harness, and no network. From any worktree the primary checkout is
derivable (`git rev-parse --path-format=absolute --git-common-dir`, take the parent), and these facts
are then **mechanically provable**:

- the primary working tree is dirty, and by how much — `git -C <primary> status --porcelain`;
- which branch it sits on and at which sha — `rev-parse --abbrev-ref HEAD` / `rev-parse HEAD`;
- that **no claim names it** — a lobby session cannot appear in `events.node_claim` (Context fact 1),
  so "dirty primary, unrepresented on the ledger" is a provable conjunction, not an inference;
- that HEAD moved under a running session — stamp the primary's sha at session start and re-read it.
  This is the same technique the studio already uses for its own checkout-moved banner (the `code`
  git-HEAD stamp in `/api/health`); reuse it rather than inventing a watcher.

**What is not provable, and must not be guessed: whose work it is.** An uncommitted working tree
records no session identity. The reflog hints (checkout/rebase entries, branch names) but never
names a session. Therefore the signal describes a *condition of the checkout* and never accuses a
named session. This is the difference between a useful nudge and a false accusation, and it is the
reason D2 addresses a place.

### D2 — The addressable entity is the checkout, because the offender has no session identity

Two session-id namespaces exist and they do not join:

- the **ledger** id — the worktree basename (ADR-0033/0200), which the offender does not have;
- the **harness** id — `local_<uuid>` from this harness's session tools, which the offender may or
  may not have (see D3).

A message table keyed on `session_id` — the obvious design, and the first option in the ask —
therefore **provably cannot address this fault**. There is no id to send to. That is the decisive
constraint, and it rules the DB inbox out as the primary transport rather than merely deprioritising
it.

The signal is instead addressed to **the primary checkout**: a condition any session can evaluate
about a shared resource, that any session entering or working in that checkout can read. Addressing
a place, not a session, is what makes the signal deliverable at all.

### D3 — The channel is the existing hook family; the ledger is untouched

> **PARKED by the owner (2026-07-26) — analysis accepted, nothing built.** The evaluation below
> stands as the record of what was ruled out and why; the hook wiring it recommends is deliberately
> NOT implemented, pending a real push surface from the harness. See Status.

Honest evaluation of the four candidates:

| Option | Reaches the offender? | Verdict |
| --- | --- | --- |
| DB message/inbox table beside `events.*` | **No** — no session id to key on (D2) | **Rejected as transport.** It would also duplicate `claim_event` + `claim_cursor`, which already implement cursor-once delivery. If session-to-session messaging is ever wanted for *claimed* sessions, add a typed `claim_event` row, never a parallel table. |
| `SessionStart` / `UserPromptSubmit` hooks | **Yes**, offline, no DB, no identity needed | **Adopted.** |
| Harness `send_message` / `list_sessions` | **Partially** | **Adopted as an escalation affordance only — not as machinery.** |
| Filesystem drop-box under `.claude/` | Yes, but only if something reads it | **Adopted only as optional state for the hook**, deliberately minimal. |

**Why hooks, when ADR-0200 D4 explicitly ruled `SessionStart` out as a delta surface.** D4's
correction is sound *for claim deltas*: an unclaimed session's claim set is empty, so a claim-delta
line at SessionStart would carry nothing. This signal is different in kind — it is **claim-independent
and git-derived**. "The checkout you are sitting in is dirty and you hold no claim" is fully
answerable at session birth, offline, from git alone, with no claim set and no story. That is a
genuine gap in D4's surface enumeration, not a reversal of its principle: delivery stays **cursor-once,
riding outputs the agent already reads, never a schedule** — which is also the owner's recorded
constraint in ADR-0200 ("no scheduled notifications ... and then never reports that again").

Two hook surfaces, both already in `.claude/settings.json`:

- **`SessionStart`** — catches the session at birth in the lobby, before it starts editing. This is
  the highest-value moment and the cheapest fix.
- **`UserPromptSubmit`** — the honest **mid-session** channel, and the answer to "is there a
  mid-session equivalent?". It already runs `definition-injection.mjs` on every human turn, so the
  precedent, the budget, and the fail-silent contract exist. A lobby session that has been working
  for an hour gets the signal on its **next human turn**, without any harness change.

Both must honour ADR-0033 D3's never-blocking-hooks contract: bounded, fail-silent, always exit 0.
Cursor-once applies here too — a one-line marker under `.claude/` (the drop-box, scoped to the
checkout and self-expiring on the observed HEAD sha + dirty fingerprint) keeps the hook from
repeating a warning the session has already been shown. The drop-box is **state for dedup, not a
message queue**; it must not grow into a parallel ledger.

**On the harness tools, honestly.** `list_sessions` is genuinely strong for *detection*: it returns
`cwd`, `branch`, `isRunning` and `lastActivityAt`, and a session in the primary checkout shows up as
`cwd: C:\code\storytree` with **no branch** — the fault, directly observable, without any git probe.
`send_message` is the only mechanism in this whole design that can **push to an already-running
sibling**. But three limits stop it being the transport:

1. **It is Claude-Code-only.** This repo deliberately runs a second agent runtime (Codex, ADR-0232),
   and the observed offender was on `codex/*` branches with a `.codex/` config present. A Codex
   session is not a CCD session: `list_sessions` cannot see it and `send_message` cannot reach it.
   The very incident that motivates this ADR is one the harness channel would likely have missed.
2. **Only an agent can call it.** It is an MCP tool. No hook, no gate, no CLI command can invoke it,
   so it can never be machinery — only a judgment call by an orchestrator that has already noticed.
3. It is a harness dependency the repo does not otherwise take, and it is unavailable in unattended
   sessions in both directions.

So: **use it, do not build on it.** When a session detects the fault *and* `list_sessions` shows a
running CCD session in that checkout, sending one message is the right move and is now sanctioned.
That is an affordance for the orchestrator, not a component.

### D4 — Delivery: what actually arrives, and when

> **PARKED by the owner (2026-07-26) — analysis accepted, nothing built.** This section is the
> honest statement of the limitation that caused the park: without harness support there is no
> push. The one row that DID ship is the last one — `pnpm gate`, via D5.2. See Status.

A running session reads only what enters its context. **Without harness changes there is no way to
interrupt a session mid-turn.** Ranked by latency, honestly:

| Surface | Latency | Reaches a lobby session? |
| --- | --- | --- |
| `send_message` (harness) | Next turn boundary of the target — **not** mid-tool-call | Only if it is a CCD session |
| `UserPromptSubmit` hook | The target's next **human turn** | Yes, offline |
| `SessionStart` hook | The next session opened in that checkout | Yes, offline |
| `--pg` CLI delta footer (ADR-0200 D4) | Next `--pg` command | **No** — no cursor row (Context fact 3) |
| `pnpm gate` | Before landing — the latest possible moment | Yes (via D5) |

The honest summary: **the offending session learns of this at its next human turn, or at its gate.**
Not instantly. That is acceptable for this signal — the ask is "move to a worktree", not "abort now" —
and it should not be oversold as a real-time channel. The *other* half of the value is immediate and
needs no delivery at all: the **landing** session detects the condition itself (D1) and halts before
committing, which is the harm that actually cost time in the incident.

### D5 — Advice in the lobby, refusal at the gate

The lobby is a legitimate place: ADR-0200 D3 has sessions *open* there, and reads, `db:status` and
`worktree create` all belong there; ADR-0220's auto-repair does git surgery there. A hard block on
working in the primary checkout would break the documented entry ceremony and the repair path — a
wrong-headed hard block would be worse than the problem. So the ratchet is graduated, matching the
existing WARN-then-FAIL precedents:

1. **WARN (hooks, D3)** — advisory, offline, fail-silent, cursor-once. Never blocks.
   **PARKED — not built** (see Status). The ratchet therefore currently has one rung, not two: a
   dirty lobby is silent until the gate. That is the accepted cost of the park.
2. **FAIL (`check:declared`)** — close the SKIP that fails open (Context fact 2). When
   `deriveIdentity()` is null **and** the cwd is the primary checkout of a repo that has a
   `.claude/worktrees/` directory **and** the tree is dirty, FAIL with the `worktree create` ceremony
   instead of returning silently. CI and plain clones keep their SKIP (CI is DB-free and must stay
   green, and this arm needs no DB at all — it is pure git, so it can run before the DB probe).
   This is the single highest-value change in the ADR: it reuses an existing fail-closed gate,
   needs no new machinery, and lands the refusal at the boundary that matters — before the merge
   ceremony, where ADR-0200 D3 already put the wall.

   > **BUILT (2026-07-26).** `evaluateLobby` + `evaluateLobbyFromGit` in
   > `packages/cli/src/check-declared.ts`, with the fingerprint as a strict conjunction
   > (primary checkout AND `.claude/worktrees/` present AND tree dirty) and six offline table-tests
   > in `check-declared.test.ts`. Proven end-to-end on a synthetic fixture: dirty+managed → exit 1
   > with the guidance; dirty without `.claude/worktrees/` (the CI/plain-clone shape) → silent
   > exit 0; managed but clean → silent exit 0. `.claude/worktrees/` is untracked, which is what
   > makes it a safe CI discriminator.
3. **Never automatic remediation.** No auto-stash, no auto-move, no auto-commit of another session's
   work. Attribution is unprovable (D1) and the action is destructive; the fix is always the
   ceremony, run by whoever owns the work.

Enforcement stays keyed on **dirty**, never on **present**. A session reading, orienting, or running
`worktree create` in the lobby is behaving correctly and must see nothing.

### D6 — Explicitly not doing

- No new `events.*` table, and no change to `node_claim` / `claim_event` / `claim_cursor`.
- No scheduled or polled notification of any kind (ADR-0200 D4; the owner's recorded constraint).
- No blocking hook, and no hook that needs the DB.
- No dependency on harness session tools in any hook, gate, or CLI path.
- No attempt to attribute uncommitted work to a named session.

## Consequences

**Good.** The highest-value fix (D5.2) is a few lines in an existing gate and closes a fail-open hole
in the one claim gate we have. Detection is pure git — offline, CI-safe, DB-free, and works
identically for Claude, Codex, and a human at a terminal, which no session-id-keyed design can
claim. The landing session gains a provable halt condition, which addresses the actual cost of the
incident. Nothing is added to the ledger, so ADR-0200's one-machinery property survives intact.

**Bad / accepted.** Delivery to a running session is best-effort and bounded by its next human turn;
this is a real limitation, not a temporary one, and it is inherent to the harness. Sessions that
never take another human turn and never gate are unreachable — the backstop is that they also never
land. The `.claude/` dedup marker is new checkout-local state that must be kept trivial or it will
drift toward the parallel ledger this ADR refuses. And the hooks add work to `UserPromptSubmit`,
which is already on the per-turn budget path (ADR-0162) — the probe must stay a couple of git calls,
not a status walk of every worktree.

**Open / follow-on.** Joining the two id namespaces (D2) is deferred: `STORYTREE_SESSION_ID` already
exists as an identity-override seam in `packages/cli/src/main.ts`, so recording a harness session id
on the claim row would make ledger-addressed messaging possible later — worth doing only if a second
signal appears that needs it. Whether the Codex runtime should be taught the same SessionStart
ceremony (`.codex/` config exists) is a separate question this ADR does not settle. This ADR designs
the seam; the story/capability decomposition to build it is the `story-author`'s call, not made here.

## References

- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — the claim ledger,
  the lobby, `check:declared` FAIL, and D4's cursor-once delivery principle (amended in surface
  enumeration only).
- [ADR-0033](0033-session-presence-notice-board.md) — worktree-derived identity; D3's
  never-blocking-hooks contract, which this design honours.
- [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md) /
  [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md) — the fail-closed
  claim-refusal precedents this ratchet is modelled on.
- [ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md) — the SessionStart
  nudge precedent.
- [ADR-0220](0220-self-healing-session-worktrees-sessionstart-repairs-the-empt.md) — SessionStart
  git surgery on the primary checkout; why a hard lobby block is unsafe.
- [ADR-0232](0232-add-a-chatgpt-subscription-codex-prove-it-leaf.md) — the second agent runtime the
  harness transport cannot see.
- [ADR-0255](0255-the-primary-checkout-is-a-read-only-agent-lobby-write-author.md) — the write-time
  arm of the same hazard: the primary checkout as a read-only lobby with claim-bound write
  authority. It amends this ADR's D5 ranking, not its machinery (see Status).
- [ADR-0257](0257-the-write-authority-wall-is-agent-inescapable-and-binds-shar.md) — accepted
  2026-07-28; hardens ADR-0255's wall to agent-inescapable and binds it to shared checkouts.
  **Accepted, still unbuilt** — its D9 proof bar is behavioural, so D5.2 below remains the only live
  enforcement of this hazard.
- [ADR-0162](0162-manage-session-onboarding-cost-optimize-the-cost-centers-the.md) — the per-turn startup budget the `UserPromptSubmit` probe
  must respect.
- Friction (the adjudicated inputs, routed to this ADR):
  `friction-concurrent-session-writes-main-checkout-reds-the-gate` (the false-red gate and the
  branch-hijack harm) and `friction-mutating-session-primary-checkout-not-refused` (the missing
  fail-fast boundary and the observed `check:declared` SKIP). Read them with
  `storytree library artifact <id> --pg`.
- Code: `packages/drive/src/noticeboard.ts` (`deriveIdentity`), `packages/cli/src/check-declared.ts`
  (the SKIP arm D5.2 closes), `packages/cli/src/main.ts` (`attachDeltaFooter`),
  `packages/notice-board/src/store/claim-store.ts` (`pullOverlapDeltas`), `.claude/settings.json`.
