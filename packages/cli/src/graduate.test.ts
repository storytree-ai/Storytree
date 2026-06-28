import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  parseMemoryFile,
  buildSnapshot,
  readSnapshot,
  projectSlug,
  harnessMemoryDir,
  graduateCommand,
  graduationNudge,
  defaultSnapshotPath,
  GRADUATION_NUDGE_TAG,
} from "./graduate.js";

// ---- pure: the memory-file frontmatter parser -----------------------------------------------

const GOOD = [
  "---",
  "name: slow-growth",
  "description: ship the minimum to green",
  "metadata:",
  "  type: feedback",
  "---",
  "",
  "Body line one.",
  "Body line two.",
  "",
].join("\n");

test("parseMemoryFile reads name/description/type and the trimmed body", () => {
  const m = parseMemoryFile("slow-growth.md", GOOD);
  assert.equal(m.name, "slow-growth");
  assert.equal(m.description, "ship the minimum to green");
  assert.equal(m.type, "feedback");
  assert.equal(m.body, "Body line one.\nBody line two.");
});

test("parseMemoryFile yields an empty body when there is none after the fence", () => {
  const m = parseMemoryFile(
    "x.md",
    ["---", "name: x", "description: d", "metadata:", "  type: user", "---", ""].join("\n"),
  );
  assert.equal(m.body, "");
});

test("parseMemoryFile throws on a missing frontmatter block", () => {
  assert.throws(() => parseMemoryFile("x.md", "just prose, no fence"), /no frontmatter block/);
});

test("parseMemoryFile throws on an unterminated frontmatter block", () => {
  assert.throws(() => parseMemoryFile("x.md", "---\nname: x\n"), /unterminated frontmatter/);
});

test("parseMemoryFile throws on an unknown memory tier", () => {
  const bad = ["---", "name: x", "description: d", "metadata:", "  type: wisdom", "---", ""].join("\n");
  assert.throws(() => parseMemoryFile("x.md", bad));
});

test("parseMemoryFile throws when name is absent", () => {
  const bad = ["---", "description: d", "metadata:", "  type: project", "---", ""].join("\n");
  assert.throws(() => parseMemoryFile("x.md", bad));
});

// ---- pure: the snapshot builder -------------------------------------------------------------

test("buildSnapshot maps kind, falls back to category, and carries the title", () => {
  const snap = buildSnapshot([
    { id: "a", kind: "principle", title: "Alpha" },
    { id: "b", category: "definition", title: "Beta" }, // assets.json carries `category`
  ]);
  assert.deepEqual(snap.docs, [
    { id: "a", kind: "principle", title: "Alpha" },
    { id: "b", kind: "definition", title: "Beta" },
  ]);
});

test("buildSnapshot skips docs without a string id and defaults a missing title/kind", () => {
  const snap = buildSnapshot([
    { kind: "principle", title: "no id" }, // dropped — unreferenceable
    { id: "c" }, // kept, blank kind + title
    "not an object",
    null,
  ]);
  assert.deepEqual(snap.docs, [{ id: "c", kind: "", title: "" }]);
});

test("readSnapshot rejects a non-array JSON file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "grad-snap-"));
  try {
    const f = path.join(dir, "knowledge.json");
    writeFileSync(f, JSON.stringify({ not: "an array" }));
    assert.throws(() => readSnapshot(f), /expected a JSON array/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- pure: the default harness-store memory dir ---------------------------------------------

test("projectSlug replaces every non-alphanumeric char (so :\\ becomes --)", () => {
  assert.equal(projectSlug("C:\\code\\storytree"), "C--code-storytree");
  assert.equal(projectSlug("/home/u/proj"), "-home-u-proj");
});

test("harnessMemoryDir lands under ~/.claude/projects/<slug>/memory", () => {
  const d = harnessMemoryDir("/home/u", "C:\\code\\storytree");
  assert.ok(d.includes(path.join(".claude", "projects", "C--code-storytree", "memory")), d);
});

// ---- the command (integration over a temp memory dir + temp snapshot) -----------------------

interface Mem {
  readonly name: string;
  readonly type: string;
  readonly body?: string;
}

function mem(m: Mem): string {
  return [
    "---",
    `name: ${m.name}`,
    `description: ${m.name} summary`,
    "metadata:",
    `  type: ${m.type}`,
    "---",
    "",
    m.body ?? `${m.name} body.`,
    "",
  ].join("\n");
}

/** Stand up a temp memory dir + a temp seed snapshot, run graduate, and clean up. */
function withFixture(
  run: (deps: { memoryDir: string; snapshotPath: string; now: string }) => void,
): void {
  const dir = mkdtempSync(path.join(tmpdir(), "grad-"));
  try {
    const memoryDir = path.join(dir, "memory");
    const snapDir = path.join(dir, "seed");
    mkdirSync(memoryDir);
    mkdirSync(snapDir);
    writeFileSync(path.join(memoryDir, "MEMORY.md"), "- index, excluded\n");
    writeFileSync(path.join(memoryDir, "a-reference.md"), mem({ name: "a-reference", type: "reference", body: "see [[An Existing Thing]] for more." }));
    writeFileSync(path.join(memoryDir, "feedback-rule.md"), mem({ name: "feedback-rule", type: "feedback" }));
    writeFileSync(path.join(memoryDir, "existing-thing.md"), mem({ name: "existing-thing", type: "project" }));
    writeFileSync(path.join(memoryDir, "user-pref.md"), mem({ name: "user-pref", type: "user" }));
    writeFileSync(path.join(memoryDir, "broken.md"), "no fence here\n");

    const snapshotPath = path.join(snapDir, "knowledge.json");
    writeFileSync(
      snapshotPath,
      JSON.stringify([
        { id: "existing-thing", kind: "process", title: "An Existing Thing" },
        { id: "another-doc", kind: "principle", title: "Another Doc" },
      ]),
    );
    run({ memoryDir, snapshotPath, now: "2026-06-22" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("graduate (summary) lists novel candidates and surfaces every suppression", () => {
  withFixture((deps) => {
    const env = graduateCommand({ review: false }, deps);
    assert.equal(env.ok, true);
    // The always-visible tally — counts can never be silently hidden (ADR-0095).
    assert.match(env.body, /tally: 2 novel, 1 duplicate suppressed, 1 user-tier deferred, 1 unparseable\./);
    // Novel: the reference (→ definition, with a resolved wiki-link) and the feedback (→ principle).
    assert.match(env.body, /NOVEL candidates \(2\)/);
    assert.match(env.body, /a-reference {2}→ definition {3}refs: asset:existing-thing/);
    assert.match(env.body, /feedback-rule {2}→ principle {3}refs: —/);
    // Suppressed: existing-thing dedupes by name against the snapshot doc id.
    assert.match(env.body, /SUPPRESSED as duplicates \(1\)/);
    assert.match(env.body, /existing-thing {2}→ covered by existing-thing {2}"An Existing Thing"/);
    // Deferred user tier + the unparseable file, both surfaced.
    assert.match(env.body, /DEFERRED user-tier \(1\)/);
    assert.match(env.body, /user-pref/);
    assert.match(env.body, /UNPARSEABLE \(1\)/);
    assert.match(env.body, /broken\.md/);
    // MEMORY.md is excluded from the count; the other 5 *.md are seen, 4 of them parse.
    assert.match(env.body, /5 files, 4 parsed/);
  });
});

test("graduate --review expands each candidate with provenance + body", () => {
  withFixture((deps) => {
    const env = graduateCommand({ review: true }, deps);
    assert.equal(env.ok, true);
    assert.match(env.body, /\[1\] a-reference/);
    assert.match(env.body, /provenance: Graduated from agent-memory 'a-reference' on 2026-06-22\./);
    assert.match(env.body, /body:/);
    assert.match(env.body, /see \[\[An Existing Thing\]\] for more\./);
  });
});

test("graduate returns ok:false with guidance when the memory dir is unreadable", () => {
  const env = graduateCommand(
    { review: false },
    { memoryDir: path.join(tmpdir(), "definitely-not-here-grad"), snapshotPath: "x", now: "2026-06-22" },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /could not read memory dir/);
  assert.ok((env.next ?? []).some((n) => n.includes("--memory-dir")));
});

// ---- the pre-merge nudge (the `check:graduation-worklist` gate surface) -----------------------

test("graduationNudge: zero candidates reports OK with no WARN noise", () => {
  const n = graduationNudge(0);
  assert.equal(n.level, "OK");
  assert.equal(n.lines.length, 1);
  assert.match(n.lines[0] ?? "", /OK — no agent-memory candidates await graduation/);
  // Every line is tagged so the gate output stays greppable.
  assert.ok(n.lines.every((l) => l.startsWith(GRADUATION_NUDGE_TAG)));
});

test("graduationNudge: N>0 WARNs with the count and the actionable next step", () => {
  const n = graduationNudge(3);
  assert.equal(n.level, "WARN");
  // The count is named so the orchestrator sees the backlog at the pre-merge moment (ADR-0095 D7).
  assert.match(n.lines[0] ?? "", /WARN — 3 agent-memory candidate\(s\) await a librarian graduation pass/);
  // The pointer routes to the review command AND names who applies the durability bar (D8).
  const joined = n.lines.join("\n");
  assert.match(joined, /storytree library graduate --review/);
  assert.match(joined, /librarian-curator/);
  assert.ok(n.lines.every((l) => l.startsWith(GRADUATION_NUDGE_TAG)));
});

test("graduationNudge: a negative count is treated as empty (defensive), not a WARN", () => {
  assert.equal(graduationNudge(-1).level, "OK");
});

test("defaultSnapshotPath resolves to the seed corpus under apps/studio/data", () => {
  assert.ok(
    defaultSnapshotPath().endsWith(path.join("apps", "studio", "data", "knowledge.json")),
    defaultSnapshotPath(),
  );
});
