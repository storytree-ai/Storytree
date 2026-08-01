/**
 * `storytree write-authority` — install / inspect the session-isolation write-authority wall
 * (ADR-0257 D1/D6, increment 3: the flip from inert to enforcing).
 *
 * WHY THIS IS A COMMAND AND NOT A ONE-OFF EDIT. The static deny block is DERIVED from
 * `repo-manifest.json` — that is what stops the wall and the repo surface drifting apart (a new
 * top-level directory would otherwise be quietly writable in the lobby, with nothing to say so). A
 * derived artifact that can only be produced by hand rots at the first manifest change. So the
 * generator gets a caller: `write-authority install --write` regenerates and re-installs, and is
 * idempotent, so "regenerate rather than hand-edit" is an instruction someone can actually follow —
 * on this machine today and on the next machine without archaeology.
 *
 * DRY RUN IS THE DEFAULT. This writes to the user's own `~/.claude/settings.json`, outside the repo
 * and shared with every other project on the machine, so `--write` is required to touch it. The bare
 * form prints exactly what would change.
 *
 * WHAT IT INSTALLS is the pair ADR-0257 D1 asks for, both halves machine-scoped (see
 * `write-authority-rules.ts` for why user-level is the only file that can carry them):
 *   - `permissions.deny` — the static containment floor. Costs nothing, holds under
 *     `bypassPermissions`, and still holds when the hook does not run at all.
 *   - the `PreToolUse` registration — the semantic layer: claim, branch, detached HEAD, and the
 *     junction/symlink escapes that a text rule cannot see.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  installWallSettings,
  lobbyDenyRules,
  locateWorktree,
  repoRoot,
  rulesDenyingWorktrees,
  wallHookCommand,
  WALL_HOOK_CAPABILITY_MARKER,
  WALL_HOOK_SCRIPT,
  type ClaudeSettings,
  type ManifestRootSlice,
} from "@storytree/drive";

import type { Envelope } from "./envelope.js";

/** File I/O, injected so the whole command is provable without touching a real home directory. */
export interface WallInstallIo {
  readonly readFile: (p: string) => string | null;
  readonly writeFile: (p: string, body: string) => void;
  readonly homeDir: () => string;
  readonly cwd: () => string;
  readonly repoRoot: () => string;
}

export const defaultWallInstallIo: WallInstallIo = {
  readFile: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  writeFile: (p, body) => writeFileSync(p, body, "utf8"),
  homeDir: () => os.homedir(),
  cwd: () => process.cwd(),
  repoRoot: () => repoRoot(),
};

/** Where the wall is installed. USER-level, for the three mechanical reasons in the rules module. */
export function userSettingsPath(homeDir: string): string {
  return path.join(homeDir, ".claude", "settings.json");
}

/**
 * The checkout this wall protects: the PRIMARY one, whether the command is run from the lobby or
 * from inside a worktree. Deriving it (rather than taking a flag) is deliberate — a mistyped root
 * would install a wall that silently protects nothing.
 */
export function protectedRoot(io: WallInstallIo): string {
  const located = locateWorktree(io.cwd());
  return located !== null ? located.primaryRoot : io.repoRoot();
}

/**
 * Can the hook at `root` actually be registered? The registration names an ABSOLUTE script inside a
 * real checkout, so what runs is whatever that checkout's branch holds — which is not necessarily
 * this one. Two ways that goes wrong, both silent:
 *   - the script is ABSENT (the checkout is on a branch predating the wall). The hook command fails,
 *     and a failing `PreToolUse` hook does not block — so every write proceeds while the settings
 *     file says a wall is installed.
 *   - the script is PRE-FLIP (increment 2): inert unless `STORYTREE_WRITE_AUTHORITY` is set, and
 *     blind to `--root`, so it would also fire in every unrelated repository on the machine.
 * Either way the honest move is to refuse the registration and say so, not to install a wall that
 * reports success and enforces nothing.
 */
export function hookHostStatus(
  io: WallInstallIo,
  root: string,
): { ok: true } | { ok: false; why: string } {
  const script = `${root.replace(/\\/g, "/").replace(/\/+$/, "")}/${WALL_HOOK_SCRIPT}`;
  const body = io.readFile(script);
  if (body === null) {
    return {
      ok: false,
      why: `the hook script is not present at ${script} — that checkout is on a branch that predates the wall`,
    };
  }
  if (!body.includes(WALL_HOOK_CAPABILITY_MARKER)) {
    return {
      ok: false,
      why:
        `the hook script at ${script} predates the flip: it is inert unless ` +
        "STORYTREE_WRITE_AUTHORITY is set, and ignores the --root scope bound",
    };
  }
  return { ok: true };
}

function readManifest(io: WallInstallIo, root: string): ManifestRootSlice | null {
  const raw = io.readFile(path.join(root, "repo-manifest.json"));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as ManifestRootSlice;
  } catch {
    return null;
  }
}

const HELP_NEXT = [
  "storytree write-authority rules",
  "storytree write-authority install",
  "storytree write-authority install --write",
];

function help(): Envelope {
  return {
    ok: true,
    body: [
      "storytree write-authority — the session-isolation write-authority wall (ADR-0257).",
      "",
      "  rules              print the generated permissions.deny block for this checkout",
      "  install            DRY RUN: show what would change in ~/.claude/settings.json",
      "  install --write    install/refresh the deny block + the PreToolUse registration",
      "",
      "  --hook-from <checkout>   source the hook script from another checkout — use when the",
      "                           protected lobby sits on a branch that predates the wall.",
      "",
      "The block is DERIVED from repo-manifest.json, so re-run `install --write` whenever a",
      "top-level entry is added or removed — never hand-edit it.",
      "",
      "Kill switch (human maintenance only): STORYTREE_WRITE_AUTHORITY=off.",
    ].join("\n"),
    next: HELP_NEXT,
  };
}

/**
 * The command. Returns an envelope; the only side effect is the settings write, and only under
 * `--write`.
 */
export function writeAuthorityCommand(
  sub: string | undefined,
  opts: { write?: boolean; help?: boolean; hookFrom?: string },
  io: WallInstallIo = defaultWallInstallIo,
): Envelope {
  if (opts.help === true || sub === undefined) return help();
  if (sub !== "rules" && sub !== "install") {
    return {
      ok: false,
      body: `unknown write-authority command "${sub}". try: rules | install`,
      next: HELP_NEXT,
    };
  }

  const root = protectedRoot(io);
  const manifest = readManifest(io, io.repoRoot());
  if (manifest === null) {
    return {
      ok: false,
      body:
        `could not read repo-manifest.json under ${io.repoRoot()} — the deny block is DERIVED from ` +
        "it and must never be hand-written, so nothing was generated.",
      next: HELP_NEXT,
    };
  }

  const rules = lobbyDenyRules(manifest, root);

  // The guard that must never trip: a rule covering `.claude/worktrees` would freeze every session
  // in the fleet. Checked here as well as in the generator's own suite, because this is the path
  // that actually writes the file.
  const offenders = rulesDenyingWorktrees(rules);
  if (offenders.length > 0) {
    return {
      ok: false,
      body:
        "REFUSED — the generated block would deny `.claude/worktrees`, which would make every " +
        `session in the fleet unable to write anything:\n  ${offenders.join("\n  ")}`,
      next: HELP_NEXT,
    };
  }

  if (sub === "rules") {
    return {
      ok: true,
      body: [`protected checkout: ${root}`, `${rules.length} deny rules:`, "", ...rules].join("\n"),
      next: HELP_NEXT,
    };
  }

  const settingsPath = userSettingsPath(io.homeDir());
  const raw = io.readFile(settingsPath);
  let current: ClaudeSettings = {};
  if (raw !== null && raw.trim() !== "") {
    try {
      current = JSON.parse(raw) as ClaudeSettings;
    } catch {
      // Refuse rather than overwrite: this file holds the user's own configuration, and clobbering
      // it to install a security wall would be its own incident.
      return {
        ok: false,
        body: `REFUSED — ${settingsPath} is not valid JSON, so it was left untouched. Fix it and re-run.`,
        next: HELP_NEXT,
      };
    }
  }

  // `--hook-from` names the checkout that HOSTS the hook script, when that is not the protected one.
  // The lobby is a read-only checkout sitting on whatever branch a human last left there, so it is
  // the worst possible place to source a security boundary from; a pinned checkout is the better
  // host. Absent the flag, host and protected checkout are the same, which is the simple case.
  const scriptRoot = opts.hookFrom !== undefined && opts.hookFrom !== "" ? opts.hookFrom : root;
  const host = hookHostStatus(io, scriptRoot);
  const hookCommand = host.ok ? wallHookCommand(root, scriptRoot) : null;
  const next = installWallSettings(current, manifest, root, { hookCommand });
  const before = current.permissions?.deny ?? [];
  const after = next.permissions?.deny ?? [];
  const added = after.filter((r) => !before.includes(r));
  const removed = before.filter((r) => !after.includes(r));

  const summary = [
    `settings file:       ${settingsPath}`,
    `protected checkout:  ${root}`,
    `deny rules:          ${before.length} → ${after.length} (+${added.length}, -${removed.length})`,
    `PreToolUse hook:     ${hookCommand ?? "NOT REGISTERED"}`,
  ];
  if (!host.ok) {
    summary.push(
      "",
      "The SEMANTIC half cannot be installed:",
      `  ${host.why}.`,
      "",
      "  The static deny block below still installs and is the containment floor — the lobby is",
      "  unwritable by the file tools. What is missing is the claim / branch / detached-HEAD /",
      "  symlink-escape decision. Point the protected checkout at a commit carrying the wall and",
      "  re-run this command; any stale registration has been REMOVED rather than left falling open.",
    );
  }
  if (added.length > 0) summary.push("", "added:", ...added.map((r) => `  + ${r}`));
  if (removed.length > 0) summary.push("", "removed (stale):", ...removed.map((r) => `  - ${r}`));

  if (opts.write !== true) {
    return {
      ok: host.ok,
      body: [...summary, "", "DRY RUN — nothing written. Re-run with --write to install."].join("\n"),
      next: ["storytree write-authority install --write"],
    };
  }

  io.writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return {
    ok: host.ok,
    body: [
      ...summary,
      "",
      host.ok
        ? "INSTALLED (both halves)."
        : "PARTIALLY INSTALLED (static half only).",
      "Both layers bind IMMEDIATELY — in this session and every other, with no restart. Measured",
      "2026-08-02: a PreToolUse registration added mid-session fired on the very next tool call.",
      "So an install takes effect at once; so does a mistake in one.",
    ].join("\n"),
    next: ["storytree write-authority rules", "storytree noticeboard --pg"],
  };
}
