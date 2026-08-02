/**
 * `write-authority-rules` — the STATIC containment layer of the session-isolation wall
 * (ADR-0255 D1 / ADR-0257 D1, D6), increment 2.
 *
 * WHAT THIS GENERATES. A `permissions.deny` block for `.claude/settings.json` that makes the PRIMARY
 * CHECKOUT unwritable by the agent's file tools. Verified empirically on the Windows dev box
 * (2026-08-01), not merely read off the docs: a `Write` into a denied path is refused with "File is
 * in a directory that is denied by your permission settings", a write to a non-denied sibling path
 * succeeds (the positive control), and the rule takes effect without restarting the session.
 *
 * THIS IS THE WHOLE WALL (ADR-0284). The claim-aware `PreToolUse` half ADR-0257 D1 paired this with
 * was RETIRED, not deferred — it was never registered, and its code is deleted. Three properties
 * this layer has that the hook structurally could not:
 *   - It costs NOTHING. Deny rules are evaluated in-process by the harness; no subprocess is spawned,
 *     so the steady-state tax on a session is zero rather than the hook's measured ~450 ms per write.
 *   - It cannot fail open. Per the Claude Code permission docs, deny rules are evaluated REGARDLESS
 *     of what a `PreToolUse` hook returns, they block even under `bypassPermissions`, and no
 *     more-local `allow` can override a deny. A hook blocks ONLY on exit code 2 — an absent script,
 *     a missing interpreter, a timeout or a crash all let the write through.
 *   - It cannot brick a session. It is a list of paths, not path arithmetic on the hot path of every
 *     write; #1076 shipped exactly that bug and refused every write in the fleet.
 * What it CANNOT know is claim, branch, detached HEAD, or a junction escape. ADR-0284 D1 de-scopes the
 * hazard that needed those: worktree-to-worktree writes had zero evidenced instances in five weeks of
 * heavy concurrent use, and are not built against until an incident is actually filed.
 *
 * WHAT IS NOT COVERED, stated so it is never implied otherwise (ADR-0284 D8): shell writes are
 * uncontained (no harness sandbox exists on native Windows, and where it exists it confines Bash
 * only), and Codex is uncontained (its worktrees live outside this checkout). Both documented
 * cross-session incidents were Codex. That gap is ADR-0257 D2/D3/D7 and remains open.
 *
 * WHY IT IS GENERATED RATHER THAN HAND-WRITTEN. Claude Code's rules match gitignore-style, and
 * critically a broad `deny` CANNOT carry an `allow` exception — so "deny the whole checkout except
 * `.claude/worktrees`" is not expressible. The lobby surface must therefore be ENUMERATED, and a
 * hand-kept enumeration silently rots the moment someone adds a top-level directory: the new
 * directory would be writable in the lobby and nothing would say so. `repo-manifest.json` already
 * exists as the enforced allow-list of exactly that surface (`pnpm check:manifest`), so deriving the
 * deny block from it means the wall and the repo surface cannot drift apart.
 *
 * TWO THINGS THE MANIFEST CANNOT ANSWER ON ITS OWN, both found by review of the installed block and
 * fixed here rather than papered over:
 *   - It sorts paths by GIT's view, so a submodule (`web`) lands in `root.files` even though it is a
 *     directory. `lobbyDenyRules` therefore emits both an exact-path and a tree rule for every
 *     `root.files` entry instead of trusting the bucket name — see the comment there.
 *   - It only ever sees TRACKED paths, so the lobby's own `node_modules` is invisible to it. That is
 *     covered by `EXTRA_DENIED_DIRS` alongside `.git`, with the reasoning stated there.
 *
 * THE ONE ENTRY THAT MUST NEVER BE DENIED is `.claude/worktrees` — every session's workspace lives
 * under it, so denying it (or denying `.claude` wholesale) would freeze the entire fleet. That is
 * why `.claude` is expanded child-by-child below instead of being emitted as one rule, and why the
 * test asserts the exclusion directly rather than trusting this comment.
 */
import path from "node:path";

/** The file tools the static layer binds. Bash is NOT one — shell containment is a separate,
 *  unbuilt increment (ADR-0257 D2/D3 for Codex), and this must not be read as covering it. */
export const GATED_TOOLS = ["Write", "Edit", "NotebookEdit"] as const;

/**
 * `.claude` children denied in the LOBBY. Enumerated because `.claude/worktrees` must stay writable
 * and a deny cannot carry an exception. (`receipts` was here until ADR-0284 D4 retired the claim
 * receipt along with the hook that was its only consumer — nothing writes that directory now.)
 */
export const DENIED_CLAUDE_CHILDREN = ["agents", "settings.json", "launch.json"] as const;

/** `.claude` children that must NEVER appear in a deny rule, whatever the manifest says. */
export const NEVER_DENY_CLAUDE_CHILDREN = ["worktrees"] as const;

/**
 * Additional lobby paths denied although `repo-manifest.json` does not list them. The manifest is an
 * allow-list over the TRACKED surface (`git ls-files`), so anything untracked is invisible to it by
 * design — which means these have to be named here or nothing denies them at all.
 *
 *   - `.git` — the shared Git common directory. A linked worktree's commits and refs pass through it
 *     (ADR-0257 D8), so a file tool that could rewrite the primary index, HEAD, config or hooks would
 *     reopen the whole hazard through the metadata side door.
 *   - `node_modules` — the lobby's installed dependency tree, and a cross-session hazard in its own
 *     right rather than mere tidiness. Every worktree resolves the workspace through its OWN
 *     `node_modules`, but the lobby's copy is what the primary checkout's gate, scripts and hooks run
 *     against; a session that edited a package in it would corrupt a tree nobody is watching. The
 *     failure mode is already documented in this repo's agent memory as the post-merge relink trap:
 *     a `node_modules` out of step with the lockfile surfaces as `TS2307` on a package you never
 *     touched, `ERR_MODULE_NOT_FOUND`, or `'tsc' is not recognized` — errors that never name the real
 *     cause, in a session that did not cause it. It is also the one lobby directory an agent has a
 *     standing reason to reach into (chasing a dependency's source), which is exactly the combination
 *     the wall exists to refuse.
 *
 * Neither can collide with `.claude/worktrees`: both rules are anchored at the primary root, and a
 * worktree's own `node_modules` lives under `.claude/worktrees/<session>/`, a different prefix.
 */
export const EXTRA_DENIED_DIRS = [".git", "node_modules"] as const;

/**
 * Convert an absolute filesystem path to Claude Code's permission-rule path form.
 *
 * Two traps, both load-bearing on Windows:
 *   - A single leading slash anchors at the SETTINGS SOURCE, not the filesystem root. An absolute
 *     path needs a DOUBLE slash, so `/c/...` would silently mean `<project>/c/...`.
 *   - Windows paths are normalised to POSIX form with a lower-cased drive letter (`C:\x` → `/c/x`).
 */
export function toPermissionPath(absPath: string): string {
  let p = absPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const drive = /^([A-Za-z]):\//.exec(p);
  if (drive !== null && drive[1] !== undefined) {
    p = `/${drive[1].toLowerCase()}/${p.slice(drive[0].length)}`;
  }
  if (!p.startsWith("/")) p = `/${p}`;
  return `/${p}`;
}

/** The manifest slice this generator reads — structurally typed so the test needs no fixture file. */
export interface ManifestRootSlice {
  readonly root: {
    readonly files: Readonly<Record<string, unknown>>;
    readonly dirs: Readonly<Record<string, unknown>>;
  };
}

/**
 * PURE: the `permissions.deny` entries that make `primaryRoot` a read-only lobby for the file tools.
 *
 * Directories become `<path>/**`; entries in `root.files` get BOTH an exact path AND a `/**` tree
 * rule. `.claude` is expanded into its denied children so `.claude/worktrees` stays writable. Output
 * is sorted and de-duplicated so the generated block is byte-stable — a drifting diff on every run
 * would make the conformance test useless as a signal.
 *
 * WHY `root.files` GETS THE TREE RULE TOO, when the bucket is named "files". Because the bucket does
 * not mean what its name says, and the manifest is not wrong to do it. `check-manifest.mjs` sorts a
 * tracked path into `root.files` vs `root.dirs` by `git ls-files` output — `parts.length === 1` is a
 * file — and git reports a SUBMODULE as one gitlink entry, not as the tree beneath it. So `web` (the
 * storytree-web submodule) is correctly listed under `root.files` for the gate that owns the manifest,
 * and moving it to `root.dirs` to satisfy this generator would make `pnpm check:manifest` block. The
 * manifest stays the single source of truth for WHICH paths make up the lobby surface; resolving what
 * each one is SHAPED like is this generator's job.
 *
 * Emitting both forms, rather than probing the filesystem for a directory, is deliberate: an
 * uninitialised submodule is an empty directory or absent entirely, so a probe would answer "file" on
 * exactly the machines whose working tree is bare — reopening the hole the moment someone ran
 * `git submodule update`. Both-forms keeps the generator pure and correct in every checkout state.
 * The cost is the inert half: `<a-real-file>/**` matches nothing, because a file has no children.
 *
 * The hole this closes was real and verified against the installed block (2026-08-02): the generated
 * rule was `Write(//c/code/storytree/web)`, which matches only the literal path `web` — leaving the
 * entire `web/` tree file-tool-writable in the primary checkout.
 */
export function lobbyDenyRules(manifest: ManifestRootSlice, primaryRoot: string): string[] {
  const base = toPermissionPath(primaryRoot);
  const targets: string[] = [];

  for (const dir of Object.keys(manifest.root.dirs)) {
    if (dir === ".claude") {
      for (const child of DENIED_CLAUDE_CHILDREN) {
        targets.push(child.includes(".") ? `${base}/.claude/${child}` : `${base}/.claude/${child}/**`);
      }
      continue;
    }
    targets.push(`${base}/${dir}/**`);
  }
  for (const dir of EXTRA_DENIED_DIRS) targets.push(`${base}/${dir}/**`);
  for (const file of Object.keys(manifest.root.files)) {
    targets.push(`${base}/${file}`);
    targets.push(`${base}/${file}/**`);
  }

  const rules = new Set<string>();
  for (const target of targets) {
    for (const tool of GATED_TOOLS) rules.add(`${tool}(${target})`);
  }
  return [...rules].sort();
}

/**
 * Guard: no generated rule may deny a path under `.claude/worktrees`. Returned rather than thrown so
 * the caller (the conformance test, and any future generator command) reports every offender at once
 * instead of only the first. A non-empty result is a BUG in the generator, not a config choice —
 * denying that prefix would make every session in the fleet unable to write anything.
 */
export function rulesDenyingWorktrees(rules: readonly string[]): string[] {
  return rules.filter((rule) =>
    NEVER_DENY_CLAUDE_CHILDREN.some((child) => rule.toLowerCase().includes(`/.claude/${child}`)),
  );
}

// ---------------------------------------------------------------------------
// Installation (increment 3 — the flip)
// ---------------------------------------------------------------------------

/**
 * WHERE THE WALL IS INSTALLED, AND WHY IT IS NOT IN THE REPO (owner call, 2026-08-02).
 *
 * Both halves go in the USER-level `~/.claude/settings.json`, not the committed project settings.
 * Three mechanics force it, none of them preference:
 *   - The deny rules are unavoidably ABSOLUTE. A single-leading-slash rule anchors at the settings
 *     file's own directory, so a "relative" block in `.claude/settings.json` would resolve against
 *     each WORKTREE's root and deny every session its own `packages/**`.
 *   - A committed absolute block is keyed to one machine, and the conformance test below computes
 *     its expectation from wherever the checkout happens to be — so it would fail in every worktree
 *     and in CI.
 *   - `.claude/settings.local.json` cannot carry it either. Claude Code resolves that file THROUGH
 *     worktrees to the main checkout, so it is one shared file for the whole fleet, not a per-worktree
 *     one. (ADR-0257 gave a different reason — "gitignored, therefore absent in a fresh worktree" —
 *     which is wrong: it is shared, not absent. Corrected in place per ADR-0139; the conclusion the
 *     wrong reason supported is unaffected. Verified behaviourally 2026-08-02: a deny rule written
 *     into a worktree's own `settings.local.json` does not bind that session, while the user-level
 *     block demonstrably does.)
 * User-level is the only file every worktree session on this machine loads. The cost is that nothing
 * in the repository records that the wall is live, which is what `installWallSettings` +
 * `storytree write-authority` exist to make reproducible rather than folklore.
 */

/**
 * The retired `PreToolUse` script (ADR-0284 D2). Kept ONLY as the fingerprint for stripping a legacy
 * registration out of a settings file that still carries one — the script itself is deleted, and a
 * registration pointing at a missing script is worse than none: it reports a wall that enforces
 * nothing.
 */
const LEGACY_WALL_HOOK_SCRIPT = "packages/cli/write-authority-hook.mjs";

/** The worktree a path belongs to, derived by path SHAPE alone. */
export interface LocatedWorktree {
  readonly primaryRoot: string;
  readonly sessionId: string;
  readonly worktreeRoot: string;
}

/**
 * PURE: locate the session worktree containing `cwd` — `<primaryRoot>/.claude/worktrees/<sessionId>`
 * — with no `git` spawn (a spawn measured ~500 ms; this is string work). Returns null when `cwd` is
 * not inside a managed worktree.
 *
 * Its one remaining caller is `protectedRoot()` in the installer, which needs to find the PRIMARY
 * checkout whether the command is run from the lobby or from inside a worktree. It moved here from
 * the receipt module when ADR-0284 D2/D4 deleted that module.
 */
export function locateWorktree(cwd: string): LocatedWorktree | null {
  const norm = path.resolve(cwd).replace(/\\/g, "/");
  const marker = "/.claude/worktrees/";
  const at = norm.toLowerCase().lastIndexOf(marker);
  if (at === -1) return null;
  const primaryRoot = norm.slice(0, at);
  const sessionId = norm.slice(at + marker.length).split("/")[0] ?? "";
  if (primaryRoot === "" || sessionId === "") return null;
  return { primaryRoot, sessionId, worktreeRoot: `${primaryRoot}${marker}${sessionId}` };
}

/** The shape of the settings file this installer touches. Everything else is preserved verbatim. */
export interface ClaudeSettings {
  permissions?: { deny?: string[]; [k: string]: unknown };
  hooks?: Record<string, unknown>;
  [k: string]: unknown;
}

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

/** Does this registration point at the retired hook? Used to STRIP it (ADR-0284 D2). */
function isWallHookEntry(entry: unknown): boolean {
  const e = entry as HookEntry | null;
  if (e === null || typeof e !== "object") return false;
  return (e.hooks ?? []).some(
    (h) => typeof h.command === "string" && h.command.includes(LEGACY_WALL_HOOK_SCRIPT),
  );
}

/**
 * PURE: fold the wall into an existing settings object, returning a NEW one.
 *
 * IDEMPOTENT AND SELF-PRUNING, which is the whole point of having a command rather than a hand-edit.
 * Re-running after `repo-manifest.json` changes must converge on exactly the generated set — so
 * previously-installed rules for THIS checkout are dropped before the fresh ones are added (a
 * removed top-level directory leaves no orphan rule behind), while deny rules for anything else and
 * every unrelated setting the user holds are preserved untouched.
 */
export function installWallSettings(
  current: ClaudeSettings,
  manifest: ManifestRootSlice,
  primaryRoot: string,
): ClaudeSettings {
  const base = toPermissionPath(primaryRoot);
  const generated = lobbyDenyRules(manifest, primaryRoot);
  const ours = new RegExp(`^(?:${GATED_TOOLS.join("|")})\\(${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "i");

  const kept = (current.permissions?.deny ?? []).filter((r) => !ours.test(r));
  const deny = [...new Set([...kept, ...generated])].sort();

  // ADR-0284 D2: the semantic half is retired, so this only ever STRIPS. A machine that ran an
  // earlier install still carries the registration; re-running the command removes it rather than
  // leaving a hook pointing at a deleted script. Every unrelated PreToolUse entry is preserved.
  const preTool = Array.isArray(current.hooks?.["PreToolUse"])
    ? (current.hooks["PreToolUse"] as unknown[]).filter((e) => !isWallHookEntry(e))
    : [];

  return {
    ...current,
    permissions: { ...(current.permissions ?? {}), deny },
    hooks: { ...(current.hooks ?? {}), PreToolUse: preTool },
  };
}
