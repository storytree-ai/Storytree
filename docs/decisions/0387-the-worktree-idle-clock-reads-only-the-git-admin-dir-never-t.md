---
status: accepted
decided: 2026-08-19
arc: worktree-reaper-eligibility-arc
---
# ADR-0387: The worktree idle clock reads only the git admin dir, never the worktree tree

## Status

accepted (2026-08-19) — decided/directed by the owner in conversation on 2026-08-19. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The worktree reaper works. Measured 2026-08-19: 233 worktrees reaped across 142 runs over 351 hours,
`worktree drain` reading DRAIN OK. And yet the farm did not drain — of 68 worktrees, **zero** were
reapable at default settings, because **56 sat in `cooling`**: merged into `origin/main`, clean, and
disqualified on exactly one criterion, not idle for 48 hours. Capacity was never the constraint; the
`HOOK_CAP = 8` per-30-minute throttle never bit, because there was nothing eligible for it to cap.

The reaper's idle test rested on the newest mtime across five signals: the worktree directory itself,
its `.git` gitfile, and the admin `HEAD` / `index` / `ORIG_HEAD`. Only 6 of 68 were older than 48 h.

**The worktree directory's own mtime was the binding constraint, and it is not an activity signal.**
A directory's mtime changes whenever any entry is created, deleted or renamed at its top level — by
anyone, for any reason. It records that something touched the worktree, not that the worktree was
used. Measured across the 17 surviving worktrees: `dir` bound 10 of them and was the **only** one of
the five whose removal changed any verdict (eligibility 6/17 → 10/17); dropping `gitfile`, `HEAD`,
`index` or `ORIG_HEAD` changed nothing at all. `gitfile` never bound: written once at `worktree add`,
it is a millisecond-duplicate of admin `HEAD` and carries no information — and `git worktree repair`
rewrites it for every worktree in one pass, which is the same repo-wide-housekeeping shape.

The proximate writer was found and is worth recording, because it shows how little it takes. Four
unrelated worktrees — `gemini-subagents-preserved`, `dreamy-colden-6536f2`, `admiring-bose-15ce17`,
`adr0178-gate` — carried a `dir` mtime of `2026-08-18T12:24:25.807/.807/.856/.866Z`, a **59 ms
window**, with no shared session, while their admin signals sat frozen in **July** (2026-07-09 through
2026-07-25). Each had gained an **empty `.codex/` directory** whose `CreationTime` equals its
`LastWriteTime` at that instant; every other worktree's `.codex/` contains `agents` and is stamped at
its own creation. A pass created a directory containing nothing in the four worktrees that predated
`.codex/agents` entering the repo, and that erased **25–40 days** of accumulated idleness. The same
signal also picks up pure **deletions** in the worktree root, which leave no other trace at all —
two worktrees were measured with a `dir` mtime newer than every child they contain.

This is the **same fault class** as the reflog defect that `worktree-reaper-integrity-arc` closed
(git's auto-gc runs `reflog expire --all`, rewriting all 76 worktrees' `logs/HEAD` in one pass;
`.claude/worktrees/` reached ~93 GB), arriving through a different door. The distinction is worth
stating because it shaped the remedy: the reflog was an **internally wrong** signal — repo
housekeeping owned it. The directory mtime is an **honest file reset from outside**. The first arc
excluded the one bad signal it had found; excluding signals one instance at a time is exactly what
let the second instance survive that fix, with the module's own header warning about the shape while
the defect sat one signal over.

A second, self-inflicted reset was found in the reaper's own code. `worktreeDirty` ran
`git status --porcelain` **without `--no-optional-locks`**. Git rewrites the index opportunistically
when the stat cache has drifted, and admin `index` is an idle signal — so the probe advanced the very
clock it was reading. It runs only on reap *candidates*, so it never touched the 56-worktree cooling
cohort, but it bit in three measured ways: a candidate deferred by `--cap` was pushed back to
`cooling` for a fresh 48 h having never been removed, and **both read-only surfaces** — the default
dry-run `prune`, and `drain`, which documents itself as removing nothing and safe to run anywhere —
reset the clock of the exact cohort they were reporting on.

Ruled out on evidence, not assumption: `git gc` / `git maintenance` config (unset), Windows scheduled
tasks (none reference the repo), git hooks (stock `.sample` files only), and the harness's
session-start `git clean -ffdx` traversal (it reads the *primary's* index, takes no lock, and had
written nothing after four hours wedged).

## Decision

**The idle clock is measured from the git admin dir, never from the worktree's own files.**

1. A **registered** worktree is judged only by admin `HEAD` / `index` / `ORIG_HEAD` — the files git
   writes for operations *in this worktree*, and which nothing else writes. Its directory mtime and
   `.git` gitfile are **not read at all**.
2. An **orphan / husk** — a directory with no resolvable admin dir — falls back to its own mtime,
   because nothing better exists. The same fallback covers a registered worktree whose admin dir is
   unreadable: returning 0 there would read as infinitely old and reap on a failed stat, the one
   direction that destroys work.
3. `worktreeDirty` passes **`--no-optional-locks`**, so the probe cannot rewrite the index of the
   worktree it is judging. This is load-bearing, not tidiness.
4. The rule is stated **positively and generally**: a signal qualifies only if it is written
   exclusively by operations in this worktree. The reflog exclusion is now one instance of that rule
   rather than a standalone carve-out.
5. A new read-only verb, **`storytree worktree idle`**, prints each worktree's age and *which* signal
   binds it, and raises a **BULK SWEEP** alarm when 3 or more worktrees share an idle stamp to the
   second — unrelated worktrees cannot be used at the same instant, so a shared stamp is the
   fingerprint of an externally reset clock. Second granularity is deliberate: the measured sweep
   spanned 59 ms, and exact-equality matching would have missed it.

Explicitly **not** done: retuning the 48 h threshold or `HOOK_CAP`. Both were measured non-binding,
and changing either would have manufactured a green census while the clock stayed poisoned.

## Consequences

**Eligibility is restored, not redefined.** Measured immediately after the change, on the same farm:
the four sweep victims report their true ages — 587.7 h, 623.5 h, 784.6 h, 925.5 h — where the old
clock read 14.0 h for all four. Worktrees past the threshold went from 6/20 to 10/20.

**The safety envelope is unchanged, and this is why dropping the directory signal is not reckless.**
To be reaped a worktree must be merged into `origin/main`, clean, not the primary, not the current
worktree, not `git worktree lock`ed, and hold no live claim. `dirty` is checked *before* idle, so a
worktree someone is editing is kept whether or not its clock moved. A merged, clean, unclaimed
worktree with no git operation in 48 h is genuinely dead. The residual risk is a session that edits
nothing and runs no git command for two days while holding a worktree it has not claimed — kept
before by an accident, and the honest fix for which is the claim ledger, not a directory mtime.

**The reaper will now drain faster, and that is the point** — but it is worth saying plainly, because
the failure direction of an over-eager clock is deleting someone's work, while the failure direction
of the poisoned clock was a ~93 GB farm that wedges the harness's session-start traversal for hours
and starves the box. Both are real; the guards above are what make the trade sound.

**A third instance of this fault class should announce itself.** `worktree idle`'s cluster detector is
generic: it would have caught the reflog sweep (76 worktrees, one identical stamp) and the `.codex`
sweep (4 worktrees, 59 ms) without either investigation. Both previous instances cost a bespoke hunt
because the reaper reported a verdict — `merged but active < 48h ago` — and never the evidence behind
it.

**The `--cap` order is alphabetical, not oldest-first**, and the comment claiming otherwise has been
corrected rather than the behaviour changed: `WorktreeVerdict` drops `mtimeMs`, so age is not
available to sort on. A capped run therefore always defers the same tail of the alphabet. With the
index reset fixed, that tail no longer has its clock pushed forward each run, so the consequence is
bounded to ordering. If the cap is ever observed to strand a specific tail, carry `mtimeMs` onto the
verdict and sort by it.

**Known and deliberately out of scope:** the reaper's universe is `.claude/worktrees/*` only, so
worktrees elsewhere (`C:\code\storytree-*`, `~/.codex/worktrees/*`, `%TEMP%/storytree-real-*` build
husks) are reaped by nothing at all. That is a separate initiative, not a defect in this clock.

## References

- `packages/cli/src/worktree.ts` — `readIdleSignals`, `ADMIN_ACTIVITY_SIGNALS`,
  `WORKTREE_FALLBACK_SIGNALS`, `detectIdleStampClusters`, `worktreeIdleReport`, `worktreeDirty`.
- `packages/cli/src/worktree-idle-signal.test.ts` — the reflog regressions, the re-aimed counterweight
  (a fresh directory mtime no longer keeps a registered worktree; a fresh husk mtime still keeps an
  orphan), and the bulk-sweep regressions.
- `packages/cli/src/worktree-io-default.test.ts` — the real-git fence proving the dirty probe leaves
  every idle signal unmoved. Verified red without `--no-optional-locks`: the index advanced ~314 ms.
- ADR-0142 (a branch dies on merge — why worktrees accumulate), ADR-0033 (worktree basename IS the
  session id), ADR-0200 D3 (the claim ledger is the authoritative live-session signal).
- `worktree-reaper-integrity-arc` (closed, PR #1303) — the reflog strand: the *internally wrong*
  clock. This ADR's arc is the externally reset one.
