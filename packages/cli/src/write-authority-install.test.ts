/**
 * Contract for `storytree write-authority` (ADR-0257 D1/D6, increment 3 — the flip).
 *
 * Every case runs against an INJECTED filesystem. This command's target is the user's own
 * `~/.claude/settings.json`, outside the repository and shared with every other project on the
 * machine, so a suite that touched the real one would be rewriting the developer's configuration to
 * test itself — and `HOME` is not a sandbox on Windows.
 *
 * The composition rules (idempotence, pruning, preservation) are proved in
 * `@storytree/drive`'s `write-authority-rules.test.ts`, next to the generator. What is pinned HERE
 * is the command's own contract: that a dry run writes NOTHING, that a corrupt settings file is
 * refused rather than clobbered, and that the protected checkout is derived rather than guessed.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  defaultWallInstallIo,
  protectedRoot,
  userSettingsPath,
  writeAuthorityCommand,
  type WallInstallIo,
} from "./write-authority-install.js";

const MANIFEST = JSON.stringify({
  root: { dirs: { packages: "", docs: "", ".claude": "" }, files: { "README.md": "" } },
});

/**
 * The fixture checkout root, PLATFORM-APPROPRIATE rather than hard-coded Windows.
 *
 * `protectedRoot` runs the target through `locateWorktree`, which calls `path.resolve` — and on
 * POSIX a `C:/…` string is a RELATIVE path, so it silently became
 * `/home/runner/work/storytree/storytree/packages/cli/c:/code/storytree` and the assertion failed in
 * CI while passing on the Windows dev box. Any fixture that reaches real path resolution has to be
 * absolute on the platform actually running it.
 */
const PRIMARY = process.platform === "win32" ? "C:\\code\\storytree" : "/code/storytree";
/** The same root in the forward-slashed form every one of these APIs emits. */
const PRIMARY_SLASH = PRIMARY.replace(/\\/g, "/");

interface Harness {
  io: WallInstallIo;
  files: Map<string, string>;
  writes: string[];
}

function harness(
  over: {
    cwd?: string;
    settings?: string | null;
    manifest?: string | null;
  } = {},
): Harness {
  const files = new Map<string, string>();
  const writes: string[] = [];
  const manifest = over.manifest === undefined ? MANIFEST : over.manifest;
  if (manifest !== null) files.set(path.join(PRIMARY, "repo-manifest.json"), manifest);
  const settings = over.settings === undefined ? null : over.settings;
  if (settings !== null) files.set(userSettingsPath("C:\\Users\\dev"), settings);
  return {
    files,
    writes,
    io: {
      readFile: (p) => files.get(p) ?? null,
      writeFile: (p, body) => {
        writes.push(p);
        files.set(p, body);
      },
      homeDir: () => "C:\\Users\\dev",
      cwd: () => over.cwd ?? PRIMARY,
      repoRoot: () => PRIMARY,
    },
  };
}

// ---------------------------------------------------------------------------
// The protected checkout is DERIVED
// ---------------------------------------------------------------------------

test("run from inside a worktree, the wall protects the PRIMARY checkout, not the worktree", () => {
  // The common case — every session runs in a worktree. Installing a wall keyed to the worktree
  // would protect a directory that is about to be reaped and leave the lobby wide open.
  const h = harness({ cwd: path.join(PRIMARY, ".claude", "worktrees", "alpha-1a2b3c", "packages") });
  assert.equal(protectedRoot(h.io).toLowerCase(), PRIMARY.replace(/\\/g, "/").toLowerCase());
});

test("run from the lobby, the wall protects the checkout it was run in", () => {
  assert.equal(protectedRoot(harness().io), PRIMARY);
});

// ---------------------------------------------------------------------------
// Dry run is the default
// ---------------------------------------------------------------------------

test("`install` without --write touches NOTHING and says so", () => {
  const h = harness();
  const got = writeAuthorityCommand("install", {}, h.io);
  assert.equal(got.ok, true);
  assert.match(got.body, /DRY RUN/);
  assert.deepEqual(h.writes, []);
});

test("`install --write` writes the settings file once, with the deny block and NO hook", () => {
  // ADR-0284 D2: the semantic half is retired. An install that quietly registered one would put a
  // fail-open hook back on the write path — the exact state this ADR removed.
  const h = harness();
  const got = writeAuthorityCommand("install", { write: true }, h.io);
  assert.equal(got.ok, true);
  assert.deepEqual(h.writes, [userSettingsPath("C:\\Users\\dev")]);

  const written = JSON.parse(h.files.get(userSettingsPath("C:\\Users\\dev")) ?? "{}") as {
    permissions?: { deny?: string[] };
    hooks?: { PreToolUse?: unknown[] };
  };
  assert.ok((written.permissions?.deny ?? []).some((r) => r.startsWith("Write(")));
  assert.deepEqual(written.hooks?.PreToolUse, []);
});

test("`rules` prints the block and never writes", () => {
  const h = harness();
  const got = writeAuthorityCommand("rules", {}, h.io);
  assert.equal(got.ok, true);
  assert.match(got.body, /deny rules:/);
  assert.deepEqual(h.writes, []);
});

// ---------------------------------------------------------------------------
// Fail-closed on anything it cannot do honestly
// ---------------------------------------------------------------------------

test("a corrupt settings file is REFUSED, not overwritten", () => {
  // Clobbering the user's own configuration in order to install a security wall would be its own
  // incident. Their file, their fix.
  const h = harness({ settings: "{ this is not json" });
  const got = writeAuthorityCommand("install", { write: true }, h.io);
  assert.equal(got.ok, false);
  assert.match(got.body, /not valid JSON/);
  assert.deepEqual(h.writes, []);
});

test("a missing repo-manifest.json refuses rather than emitting an empty block", () => {
  // An empty deny block is the most dangerous possible output: it installs cleanly, reports success,
  // and protects nothing.
  const h = harness({ manifest: null });
  const got = writeAuthorityCommand("install", { write: true }, h.io);
  assert.equal(got.ok, false);
  assert.match(got.body, /repo-manifest\.json/);
  assert.deepEqual(h.writes, []);
});

// ---------------------------------------------------------------------------
// The retired semantic half (ADR-0284 D2)
// ---------------------------------------------------------------------------

test("a legacy registration is STRIPPED, and the strip is reported rather than silent", () => {
  // A machine that ran a pre-0284 install still carries a registration naming the now DELETED hook
  // script. A PreToolUse hook blocks only on exit code 2, so one pointing at a missing script
  // enforces nothing while the settings file reads as though a wall is installed — strictly worse
  // than no registration. Unrelated hooks must survive untouched.
  const legacy = JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
        {
          matcher: "Write|Edit|NotebookEdit",
          hooks: [
            {
              type: "command",
              command: `node ${PRIMARY_SLASH}/packages/cli/write-authority-hook.mjs --root ${PRIMARY_SLASH}`,
            },
          ],
        },
      ],
    },
  });
  const h = harness({ settings: legacy });
  const got = writeAuthorityCommand("install", { write: true }, h.io);
  assert.equal(got.ok, true);
  assert.match(got.body, /STRIPPED 1 stale write-authority registration/);

  const written = JSON.parse(h.files.get(userSettingsPath("C:\\Users\\dev")) ?? "{}") as {
    permissions?: { deny?: string[] };
    hooks?: { PreToolUse?: Array<{ matcher?: string }> };
  };
  assert.ok((written.permissions?.deny ?? []).length > 0, "the static floor still lands");
  assert.deepEqual(
    written.hooks?.PreToolUse?.map((e) => e.matcher),
    ["Bash"],
    "only the wall's own registration is removed",
  );
});

test("an unknown subcommand is refused with the usable ones named", () => {
  const got = writeAuthorityCommand("enable", {}, harness().io);
  assert.equal(got.ok, false);
  assert.match(got.body, /rules \| install/);
});

test("no subcommand prints help, and help never writes", () => {
  const h = harness();
  const got = writeAuthorityCommand(undefined, {}, h.io);
  assert.equal(got.ok, true);
  // The help must state the gap rather than let a reader infer coverage from the word "wall"
  // (ADR-0284 D8). The old `STORYTREE_WRITE_AUTHORITY=off` kill switch is gone with the hook it
  // gated — deny rules cannot be env-gated, so advertising it would have been a false remedy.
  assert.match(got.body, /STATIC ONLY/);
  assert.match(got.body, /Shell writes and Codex are uncontained/);
  assert.doesNotMatch(got.body, /STORYTREE_WRITE_AUTHORITY/);
  // The help is read as a wrapped column, so it is matched flat — a phrase that spans a line break
  // is still one sentence to the reader, and pinning it per-line would pin the WRAPPING instead.
  const flat = got.body.replace(/\s+/g, " ");
  assert.match(flat, /also strips any PreToolUse registration left by an earlier version/);
  // WHAT THE CODEX SENTENCE HAS TO SAY, and why it is asserted rather than left as prose: it used to
  // read "ADR-0355's separate Codex generator never installs its administrator-owned
  // requirements/profile/hooks", describing machinery that ADR-0390 withdrew and that was deleted on
  // 2026-08-20 — a live-sounding account of something that is not there
  // (codex-onboarding-journey-arc). A superseded ADR number in a help surface is worse than silence,
  // because a reader who looks it up finds a real decision and believes it is the current one.
  assert.match(flat, /There is no Codex generator to run: ADR-0390 withdrew the managed containment boundary/);
  assert.match(flat, /deleted on 2026-08-20, so Codex now runs at Claude parity/);
  assert.match(flat, /this command has nothing to say about it/);
  assert.doesNotMatch(flat, /ADR-0355/, "the superseded decision must not be cited as live");
  assert.deepEqual(h.writes, []);
});

test("every verb the help and the `next:` offers advertise is one the command actually accepts", () => {
  // THE CLASS, not the instance. The help and `HELP_NEXT` used to offer `write-authority codex --pg`
  // — the Codex containment generator — for two days after ADR-0390 withdrew the boundary and its
  // machinery was deleted. Running it was refused with `unknown write-authority command "codex"`,
  // and the refusal RE-PRINTED the dead verb in its own `next:` offers, so a reader following the
  // printed offer went in a circle. The remedy is not deleting one line; it is asking the command
  // whether it means what it advertises, so no future retirement can leave an offer behind
  // (codex-onboarding-journey-arc).
  const helped = writeAuthorityCommand(undefined, {}, harness().io);
  const offered = new Set<string>();
  for (const line of helped.next ?? []) {
    const verb = line.split(/\s+/)[2];
    if (verb !== undefined) offered.add(verb);
  }
  // The help BODY lists verbs in its own two-space-indented column; both surfaces are read, because
  // the stale entry lived in both and either alone would have kept passing.
  for (const line of helped.body.split("\n")) {
    const m = /^ {2}(\S+)\s{2,}\S/.exec(line);
    if (m?.[1] !== undefined) offered.add(m[1]);
  }
  assert.ok(offered.size >= 2, `the help must offer some verbs, got ${[...offered].join(", ")}`);
  for (const verb of offered) {
    assert.notEqual(
      writeAuthorityCommand(verb, {}, harness().io).body.startsWith(`unknown write-authority command`),
      true,
      `the help offers \`${verb}\`, but the command refuses it as unknown`,
    );
  }
  assert.ok(!offered.has("codex"), "the Codex containment generator was deleted 2026-08-20 (ADR-0390)");
});

test("re-installing is a no-op diff — the command is safe to re-run after any manifest change", () => {
  const h = harness();
  writeAuthorityCommand("install", { write: true }, h.io);
  const second = writeAuthorityCommand("install", {}, h.io);
  assert.match(second.body, /\+0, -0/);
});

/**
 * The DEFAULT `WallInstallIo` — the implementation every case above replaces, and therefore the one
 * the binary actually runs. Everything above is evidence about the injected fake; without this it is
 * evidence about nothing that ships (ADR-0278's unproven-seam-default class).
 *
 * Driven against a real temp directory, never the home directory: the header's reason stands, and
 * `homeDir()` is only READ here, never written through. The load-bearing behaviour is `readFile`'s
 * swallow-to-`null` — every caller distinguishes "absent" from "corrupt" by that `null`, and a
 * throw-instead-of-null would turn a first-time install into a crash.
 */
test("defaultWallInstallIo: real file IO round-trips, and a missing file reads as null not a throw", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "storytree-wall-io-"));
  try {
    const target = path.join(dir, "settings.json");

    // The first-install case: nothing there yet, and that must be `null`, not an exception.
    assert.equal(defaultWallInstallIo.readFile(target), null);

    defaultWallInstallIo.writeFile(target, '{"permissions":{"deny":[]}}');
    assert.equal(defaultWallInstallIo.readFile(target), '{"permissions":{"deny":[]}}');

    // A directory is unreadable-as-a-file on every platform — the same `null`, not a throw.
    assert.equal(defaultWallInstallIo.readFile(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("defaultWallInstallIo: homeDir, cwd and repoRoot are wired to real absolute paths", () => {
  for (const got of [
    defaultWallInstallIo.homeDir(),
    defaultWallInstallIo.cwd(),
    defaultWallInstallIo.repoRoot(),
  ]) {
    assert.equal(typeof got, "string");
    assert.ok(got.length > 0);
    assert.ok(path.isAbsolute(got), `expected an absolute path, got ${got}`);
  }
});
