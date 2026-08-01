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
 * WHY THIS LAYER EXISTS AT ALL, GIVEN THE HOOK. Three properties the `PreToolUse` hook cannot match:
 *   - It costs NOTHING. Deny rules are evaluated in-process by the harness; no subprocess is spawned,
 *     so the steady-state tax on a session is zero rather than the hook's measured ~450 ms per write.
 *   - It is harder to escape. Per the Claude Code permission docs, deny rules are evaluated
 *     REGARDLESS of what a `PreToolUse` hook returns, they block even under `bypassPermissions`, and
 *     a `settings.local.json` cannot override a project-level deny. A hook is ordinary code that can
 *     crash, be misconfigured, or be absent; this is enforced by the harness itself.
 *   - It still holds when the hook does not run at all.
 * The hook remains necessary for everything a static text rule cannot know — claim, branch, detached
 * HEAD, and junction escapes. Neither layer is the wall alone; ADR-0257 D1 asks for both.
 *
 * WHY IT IS GENERATED RATHER THAN HAND-WRITTEN. Claude Code's rules match gitignore-style, and
 * critically a broad `deny` CANNOT carry an `allow` exception — so "deny the whole checkout except
 * `.claude/worktrees`" is not expressible. The lobby surface must therefore be ENUMERATED, and a
 * hand-kept enumeration silently rots the moment someone adds a top-level directory: the new
 * directory would be writable in the lobby and nothing would say so. `repo-manifest.json` already
 * exists as the enforced allow-list of exactly that surface (`pnpm check:manifest`), so deriving the
 * deny block from it means the wall and the repo surface cannot drift apart.
 *
 * THE ONE ENTRY THAT MUST NEVER BE DENIED is `.claude/worktrees` — every session's workspace lives
 * under it, so denying it (or denying `.claude` wholesale) would freeze the entire fleet. That is
 * why `.claude` is expanded child-by-child below instead of being emitted as one rule, and why the
 * test asserts the exclusion directly rather than trusting this comment.
 */

/** The file tools the static layer binds. Bash is NOT one — shell containment is a separate,
 *  unbuilt increment (ADR-0257 D2/D3 for Codex), and this must not be read as covering it. */
export const GATED_TOOLS = ["Write", "Edit", "NotebookEdit"] as const;

/**
 * `.claude` children denied in the LOBBY. Enumerated because `.claude/worktrees` must stay writable
 * and a deny cannot carry an exception. `receipts` is here for a second reason: it is what makes the
 * unsigned claim receipt tamper-resistant to the file tools (ADR-0257 D5, partially).
 */
export const DENIED_CLAUDE_CHILDREN = ["agents", "receipts", "settings.json", "launch.json"] as const;

/** `.claude` children that must NEVER appear in a deny rule, whatever the manifest says. */
export const NEVER_DENY_CLAUDE_CHILDREN = ["worktrees"] as const;

/**
 * Additional lobby paths denied although `repo-manifest.json` does not list them: the shared Git
 * common directory. A linked worktree's commits and refs pass through it (ADR-0257 D8), so a file
 * tool that could rewrite the primary index, HEAD, config or hooks would reopen the whole hazard
 * through the metadata side door.
 */
export const EXTRA_DENIED_DIRS = [".git"] as const;

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
 * Directories become `<path>/**`; single files become an exact path. `.claude` is expanded into its
 * denied children so `.claude/worktrees` stays writable. Output is sorted and de-duplicated so the
 * generated block is byte-stable — a drifting diff on every run would make the conformance test
 * useless as a signal.
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
  for (const file of Object.keys(manifest.root.files)) targets.push(`${base}/${file}`);

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
 *   - `.claude/settings.local.json` is gitignored, therefore ABSENT in a freshly minted worktree —
 *     precisely the sessions the wall exists to bind.
 * User-level is the only file every worktree session on this machine loads. The cost is that nothing
 * in the repository records that the wall is live, which is what `installWallSettings` +
 * `storytree write-authority` exist to make reproducible rather than folklore.
 */
export const WALL_HOOK_SCRIPT = "packages/cli/write-authority-hook.mjs";

/** Matcher for the `PreToolUse` registration — the same tools the static layer denies. */
export const WALL_HOOK_MATCHER = GATED_TOOLS.join("|");

/**
 * The hook command. ABSOLUTE by design (ADR-0257 D2 asks the same of the Codex adapter): a
 * project-relative command would resolve inside whichever worktree is running, so checking out an
 * older branch there would silently swap the wall for an older one. `--root` bounds the
 * machine-scoped registration to the protected checkout so unrelated repositories are untouched.
 *
 * `scriptRoot` is SEPARATE from `protectedRoot` because the script has to come from a checkout that
 * carries the wall code AND a populated `node_modules` (the hook loads its typed decision core
 * through tsx, and a copy outside a workspace would fail to resolve it — which DENIES, fail-closed,
 * i.e. it would brick every write). The protected checkout cannot be assumed to be that host: it is
 * a read-only lobby whose branch is whatever a human last left there, and on 2026-08-02 that branch
 * predated the wall entirely. Splitting the two lets the wall be hosted by a pinned checkout while
 * still protecting the lobby.
 */
export function wallHookCommand(protectedRoot: string, scriptRoot: string = protectedRoot): string {
  const abs = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "");
  return `node ${abs(scriptRoot)}/${WALL_HOOK_SCRIPT} --root ${abs(protectedRoot)}`;
}

/**
 * A marker that only a POST-FLIP hook script contains. The installer greps for it before registering.
 *
 * The registration names an absolute script inside a real checkout, so what actually runs is whatever
 * that checkout's branch holds — and increment 2's hook is inert by default and ignores `--root`.
 * Registering it would produce the worst state available: a wall that looks installed, reports
 * success, and enforces nothing. Checking a capability marker rather than a version string keeps the
 * test about what the script can DO.
 */
export const WALL_HOOK_CAPABILITY_MARKER = "parseRootArg";

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

/** Does this registration point at our hook? Used to REPLACE rather than duplicate on re-install. */
function isWallHookEntry(entry: unknown): boolean {
  const e = entry as HookEntry | null;
  if (e === null || typeof e !== "object") return false;
  return (e.hooks ?? []).some((h) => typeof h.command === "string" && h.command.includes(WALL_HOOK_SCRIPT));
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
  opts: { readonly hookCommand?: string | null } = {},
): ClaudeSettings {
  const base = toPermissionPath(primaryRoot);
  const generated = lobbyDenyRules(manifest, primaryRoot);
  const ours = new RegExp(`^(?:${GATED_TOOLS.join("|")})\\(${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "i");

  const kept = (current.permissions?.deny ?? []).filter((r) => !ours.test(r));
  const deny = [...new Set([...kept, ...generated])].sort();

  const preTool = Array.isArray(current.hooks?.["PreToolUse"])
    ? (current.hooks["PreToolUse"] as unknown[]).filter((e) => !isWallHookEntry(e))
    : [];

  // `hookCommand: null` REMOVES the registration rather than leaving one behind. A registration
  // pointing at a script that is missing, or at a pre-flip one that is inert by default, is worse
  // than none: it reports the wall as installed while enforcing nothing.
  const command = opts.hookCommand === undefined ? wallHookCommand(primaryRoot) : opts.hookCommand;
  const registration =
    command === null
      ? []
      : [{ matcher: WALL_HOOK_MATCHER, hooks: [{ type: "command", command, timeout: 30 }] }];

  return {
    ...current,
    permissions: { ...(current.permissions ?? {}), deny },
    hooks: { ...(current.hooks ?? {}), PreToolUse: [...preTool, ...registration] },
  };
}
