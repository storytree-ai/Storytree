/**
 * The PURE core of `pnpm land:web-engine` — the engine mirror's LANDING CEREMONY as a decision,
 * separated from the git and `gh` calls that carry it out (ADR-0539, `the-engine-mirror-becomes-
 * machinery`).
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────────────────────────
 *
 * `packages/forest-world/src` reaches the public website by being COPIED into `web/src/lib/<pkg>/`
 * (ADR-0093, generalised by ADR-0123). ADR-0537 D2 decided that copy should END; the scoping unit
 * then found that the cost is the SECOND REPOSITORY rather than the copy — while `storytree-web` is
 * separate, ANY mechanism still costs a commit, a second pull request and a publish — and the owner,
 * shown that, chose to AUTOMATE it instead (ADR-0539). So the copy stays, the drift gate stays, and
 * what goes is the REMEMBERING.
 *
 * The chore being removed, measured 2026-09-07: a change of 23 insertions and 13 deletions in ONE
 * file, changing no rendered pixel, cost a branch in the website repo, a sync rewriting 57 files, a
 * commit and push there, a website pull request, the wait for it to merge, a submodule pin bump
 * here, and only then this repo's own pull request. Seven steps, in order, from memory, and
 * `check:web-engine` existed purely to catch someone dropping one.
 *
 * ── WHY THE DECISION IS PURE AND THE DOING IS NOT ──────────────────────────────────────────────
 *
 * Every trap in this ceremony is a JUDGEMENT about state, not an IO call: which commit to branch
 * from, whether there is anything to do at all, what to pin afterwards, and when to refuse outright.
 * Those are what the tests below pin. The shell (`web-engine.ts`) runs git and `gh`; it makes no
 * choices of its own.
 */

/** Where the mirror stands, as the shell observed it. */
export interface LandState {
  /** Is `web/` actually checked out? An uninitialised submodule leaves an EMPTY stub dir — and it
   *  resolves UP to the parent repo, so git commands against it succeed while answering about the
   *  wrong repository. */
  readonly webCheckedOut: boolean;
  /** Can we act on `storytree-web` at all? The ceremony pushes a branch and opens a pull request
   *  there, so an unauthenticated `gh` fails HALFWAY — after the sync has rewritten 57 files. */
  readonly ghAuthenticated: boolean;
  /** Is there a git identity to COMMIT the website branch with — from the submodule's own config or,
   *  failing that, the parent's? A freshly-initialised submodule inherits neither a user.name nor a
   *  user.email, and git's auto-detection from the hostname is refused rather than guessed. */
  readonly commitIdentity: { readonly name: string; readonly email: string } | null;
  /** Does the synced copy differ from this checkout's engine sources? */
  readonly drifted: boolean;
  /** The web commit the parent's gitlink RECORDS — what CI will check out, and what a fresh
   *  recursive clone gets. */
  readonly pin: string;
  /** The web commit the submodule is actually SITTING ON. It differs from the pin whenever the
   *  website side has moved and the parent has not recorded it yet — which is the state a partial
   *  run leaves behind, and the state this verb must be able to resume from. */
  readonly webHead: string;
  /** Is {@link webHead} reachable from the website's `origin/main`? Only then may the parent pin
   *  it: CI clones the submodule at the pin, so a pin on an unmerged branch tip is a pin nobody
   *  else can resolve. */
  readonly headOnWebMain: boolean;
  /** `origin/main` in the website repo. */
  readonly webMain: string;
  /** Parent-repo paths with uncommitted changes, EXCLUDING the `web` gitlink itself. */
  readonly parentDirtyPaths: readonly string[];
}

/** Why the plan is what it is — the machine-readable half, so a test can pin the DECISION without
 *  pinning the wording, and the shell can branch on it without matching prose. */
export type LandReason =
  | 'no-web-checkout'
  | 'parent-dirty'
  | 'already-current'
  | 'pin-behind-web'
  | 'web-work-not-landed'
  | 'no-gh-credential'
  | 'no-git-identity'
  | 'main-ahead-of-pin'
  | 'pin-is-main';

/** What the shell should do next. Every variant carries BOTH a code and the sentence a human
 *  reads — the code is what the tests and the shell branch on, the prose is the product. */
export type LandPlan =
  | { readonly kind: 'refuse'; readonly reason: LandReason; readonly message: string }
  | { readonly kind: 'nothing-to-do'; readonly reason: LandReason; readonly message: string }
  | {
      /** The website side is DONE and merged; only the parent's gitlink is behind. Stage it. */
      readonly kind: 'bump-only';
      readonly reason: LandReason;
      readonly pinTo: string;
      readonly message: string;
    }
  | {
      readonly kind: 'sync-and-open';
      readonly reason: LandReason;
      /** The web commit to cut the branch FROM. */
      readonly base: string;
      /** Who to commit the website branch as — carried on the PLAN so the shell cannot reach for a
       *  different answer than the one the refusal above was decided against. Never null here: the
       *  absent case is a refusal, which is the whole point of checking it before the sync runs. */
      readonly identity: { readonly name: string; readonly email: string };
      /** Why that base and not the other — printed, because the answer is not obvious. */
      readonly message: string;
    };

/**
 * ⚠ THE MERGE METHOD IS NOT A PREFERENCE. The parent pins an EXACT commit of the website repo, so a
 * squash or a rebase rewrites the branch's commits into new ones and the pinned commit stops
 * existing there — the pin dangles the moment the old branch is tidied away, and a fresh
 * `git clone --recurse-submodules` of the parent then fails outright. A merge commit keeps every
 * branch commit reachable, which is what the pin needs. Exported so the shell cannot spell it
 * differently from the value the test pins.
 */
export const WEB_MERGE_METHOD = '--merge' as const;

/** How many dirty paths a refusal lists before it starts counting instead. */
export const DIRTY_PATHS_SHOWN = 5;

/**
 * Decide the next step of the landing ceremony.
 *
 * ⚠ THE BRANCH BASE IS ALWAYS THE PIN, NEVER `origin/main`, and that is the trap this function
 * exists to remove. When web `main` is AHEAD of the pin it is carrying a sibling session's already-
 * published sync; a branch cut from `main` and then re-synced from THIS checkout's engine rewrites
 * the sibling's files too, which is a silent revert of published work (measured 2026-09-06: 12 files
 * rewritten where six were the author's). Cutting from the pin means the sync touches only the files
 * this change actually moves, and the parent can pin the branch TIP — a commit whose only delta from
 * the old pin is this change. When the pin and `main` are the same commit the rule costs nothing,
 * which is why it is stated as an invariant rather than as a special case: a special case only fires
 * when somebody remembers it is a special case.
 */
export function planLanding(state: LandState): LandPlan {
  if (!state.webCheckedOut) {
    return {
      kind: 'refuse',
      reason: 'no-web-checkout',
      message: `web/ is not checked out — run \`git submodule update --init web\` first. ⚠ An EMPTY web/ stub resolves UP to the parent repo, so git commands against it succeed while answering about the wrong repository; that is why this refuses instead of proceeding.`,
    };
  }
  if (state.parentDirtyPaths.length > 0) {
    const shown = state.parentDirtyPaths.slice(0, DIRTY_PATHS_SHOWN);
    const rest = state.parentDirtyPaths.length - shown.length;
    return {
      kind: 'refuse',
      reason: 'parent-dirty',
      message: `this repository has uncommitted changes outside the web gitlink, and the mirror must not be landed from them: the pin would record a public copy of sources that may never land here. Commit or set aside first — ${shown.join(', ')}${rest > 0 ? `, and ${rest} more` : ''}.`,
    };
  }
  if (!state.drifted) {
    // ⚠ "NO DRIFT" IS NOT "NOTHING TO DO", and reading it as one is how a partial run strands a
    // landing. Drift is measured against the submodule's WORKING TREE; the parent's gitlink is a
    // separate fact. A run that synced and pushed but died before recording the bump leaves exactly
    // this state — no drift, stale pin — and answering "nothing to do" there would report success
    // over a mirror the parent has not landed. It is not even caught locally, because
    // `check:web-engine` reads the same working tree: CI clones the submodule AT THE PIN and is the
    // first thing to notice.
    if (state.webHead !== state.pin) {
      if (!state.headOnWebMain) {
        return {
          kind: 'refuse',
          reason: 'web-work-not-landed',
          message: `the submodule sits on ${short(state.webHead)} but the parent still records ${short(state.pin)}, and that commit is NOT reachable from the website's origin/main — so it is work that has not landed there yet. Pinning it would record a commit nobody else can resolve: CI clones the submodule at the pin, and a fresh recursive clone of this repo would fail outright. Land the website pull request first, then run this again.`,
        };
      }
      return {
        kind: 'bump-only',
        reason: 'pin-behind-web',
        pinTo: state.webHead,
        message: `the website side is already done and merged — the sources match and ${short(state.webHead)} is on its main. Only this repository's gitlink is behind, at ${short(state.pin)}, so all that is left is to record the bump.`,
      };
    }
    return {
      kind: 'nothing-to-do',
      reason: 'already-current',
      message: `the website already carries this checkout's engine sources and the gitlink records the commit the submodule is on — nothing to sync, and no pin to bump. The comparison is against the copy at the PIN, which is what CI checks too, so this is the same answer check:web-engine gives.`,
    };
  }
  // Checked AFTER the work-detecting branches on purpose: a session with no credential should still
  // be told plainly that there is nothing to do, rather than being refused for a capability the
  // ceremony was never going to use.
  if (!state.ghAuthenticated) {
    return {
      kind: 'refuse',
      reason: 'no-gh-credential',
      message: `the mirror needs re-syncing, but \`gh\` is not authenticated for storytree-web — and this ceremony pushes a branch and opens a pull request there. Refusing UP FRONT rather than failing halfway, which would leave the submodule holding rewritten files with nothing pushed and nothing opened.`,
    };
  }
  if (state.commitIdentity === null) {
    return {
      kind: 'refuse',
      reason: 'no-git-identity',
      message: `there is no git identity to commit the website branch with — set \`user.name\` and \`user.email\`, in this repository or globally. ⚠ A freshly-initialised submodule inherits NEITHER from its parent, and git refuses to auto-detect one from the hostname rather than guessing. Checked here rather than discovered at the commit, which is three steps in: the branch cut, the sync run, 57 files rewritten and nothing recoverable by re-running.`,
    };
  }
  if (state.pin !== state.webMain) {
    return {
      kind: 'sync-and-open',
      reason: 'main-ahead-of-pin',
      base: state.pin,
      identity: state.commitIdentity,
      message: `web main (${short(state.webMain)}) is AHEAD of the pin (${short(state.pin)}), so it is carrying work this checkout has not seen. Branching from the PIN means the sync rewrites only the files this change moves; from main it would rewrite the sibling's files back to this checkout's engine, which is a silent revert of published work.`,
    };
  }
  return {
    kind: 'sync-and-open',
    reason: 'pin-is-main',
    base: state.pin,
    identity: state.commitIdentity,
    message: `the pin and web main are the same commit (${short(state.pin)}), so the base is unambiguous. Stated as the pin regardless, because the rule that matters is "always the pin" — a base chosen from main only bites on the day main has moved.`,
  };
}

/** What the parent should pin once the website pull request has merged.
 *
 *  ⚠ THE BRANCH TIP, NOT THE MERGE COMMIT AND NOT `origin/main`. The pin must equal this
 *  checkout's engine byte for byte. Web `main` may not — it can carry a sibling's engine files —
 *  whereas the tip's only delta from the old pin is this change. `--merge` keeps the tip reachable
 *  from main, so the lineage probe (`merge-base --is-ancestor <pin> origin/main`) still flips true. */
export function pinAfterMerge(branchTip: string): string {
  return branchTip;
}

function short(sha: string): string {
  return sha.slice(0, 8);
}
