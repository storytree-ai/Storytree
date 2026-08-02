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
 * WHAT IT INSTALLS is `permissions.deny` — the static containment floor, machine-scoped (see
 * `write-authority-rules.ts` for why user-level is the only file that can carry it). Costs nothing,
 * holds under `bypassPermissions`, cannot be overridden by a more-local allow, and cannot brick a
 * session.
 *
 * IT NO LONGER REGISTERS A HOOK (ADR-0284 D2). The semantic half was retired rather than deferred:
 * a `PreToolUse` hook blocks only on exit code 2, so an absent script, a missing interpreter, a
 * timeout or a crash all let the write through — it cannot be the agent-inescapable boundary
 * ADR-0257 D1 asked for. Re-running this command STRIPS any registration a previous install left
 * behind. What it no longer covers is stated rather than implied: shell writes and Codex are
 * uncontained (ADR-0284 D8).
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
      "storytree write-authority — the session-isolation write-authority wall (ADR-0257/0284).",
      "",
      "  rules              print the generated permissions.deny block for this checkout",
      "  install            DRY RUN: show what would change in ~/.claude/settings.json",
      "  install --write    install/refresh the deny block",
      "",
      "The block is DERIVED from repo-manifest.json, so re-run `install --write` whenever a",
      "top-level entry is added or removed — never hand-edit it.",
      "",
      "The wall is STATIC ONLY (ADR-0284). Shell writes and Codex are uncontained; `install --write`",
      "also strips any PreToolUse registration left by an earlier version.",
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
  opts: { write?: boolean; help?: boolean },
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

  const next = installWallSettings(current, manifest, root);
  const before = current.permissions?.deny ?? [];
  const after = next.permissions?.deny ?? [];
  const added = after.filter((r) => !before.includes(r));
  const removed = before.filter((r) => !after.includes(r));

  // A registration left by a pre-ADR-0284 install is stripped, not left pointing at a deleted
  // script. Reported explicitly, because silently removing a thing called a wall would be its own
  // kind of dishonesty.
  const beforeHooks = Array.isArray(current.hooks?.["PreToolUse"])
    ? (current.hooks["PreToolUse"] as unknown[]).length
    : 0;
  const afterHooks = (next.hooks?.["PreToolUse"] as unknown[] | undefined)?.length ?? 0;

  const summary = [
    `settings file:       ${settingsPath}`,
    `protected checkout:  ${root}`,
    `deny rules:          ${before.length} → ${after.length} (+${added.length}, -${removed.length})`,
    `PreToolUse hook:     retired (ADR-0284 D2) — the wall is the static block only`,
  ];
  if (beforeHooks > afterHooks) {
    summary.push(
      "",
      `  STRIPPED ${beforeHooks - afterHooks} stale write-authority registration(s) pointing at the`,
      "  deleted hook script. A hook blocks only on exit code 2, so one naming a missing script",
      "  enforced nothing while reporting a wall.",
    );
  }
  if (added.length > 0) summary.push("", "added:", ...added.map((r) => `  + ${r}`));
  if (removed.length > 0) summary.push("", "removed (stale):", ...removed.map((r) => `  - ${r}`));

  if (opts.write !== true) {
    return {
      ok: true,
      body: [...summary, "", "DRY RUN — nothing written. Re-run with --write to install."].join("\n"),
      next: ["storytree write-authority install --write"],
    };
  }

  io.writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return {
    ok: true,
    body: [
      ...summary,
      "",
      "INSTALLED. The deny block binds IMMEDIATELY — in this session and every other, with no",
      "restart. So an install takes effect at once; so does a mistake in one.",
      "",
      "NOT covered, and not implied to be (ADR-0284 D8): shell writes (no harness sandbox exists on",
      "native Windows) and Codex (its worktrees live outside this checkout). Both documented",
      "cross-session incidents were Codex; that gap is ADR-0257 D2/D3/D7 and is still open.",
    ].join("\n"),
    next: ["storytree write-authority rules", "storytree noticeboard --pg"],
  };
}
