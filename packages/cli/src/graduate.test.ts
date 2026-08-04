import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseParkLedger } from "@storytree/library";

import {
  parseMemoryFile,
  buildSnapshot,
  readSnapshot,
  projectSlug,
  harnessMemoryDir,
  graduateCommand,
  graduationNudge,
  defaultLedgerPath,
  defaultSnapshotPath,
  parkCommand,
  parseParkFile,
  readParkLedger,
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

test("parseMemoryFile carries `metadata.branch` through as provenance (ADR-0301)", () => {
  const m = parseMemoryFile(
    "stamped.md",
    ["---", "name: x", "description: d", "metadata:", "  type: user", "  branch: claude/foo-1a2b", "---", "b"].join("\n"),
  );
  assert.equal(m.branch, "claude/foo-1a2b");
});

test("parseMemoryFile leaves `branch` ABSENT — not undefined-valued — on an unstamped memory", () => {
  // Absence is what the drain ceiling reads as UNATTRIBUTED, and it must charge rather than excuse. It
  // is also the only shape every pre-ADR-0301 memory has, so this is the common case, not the edge.
  const m = parseMemoryFile(
    "unstamped.md",
    ["---", "name: x", "description: d", "metadata:", "  type: user", "---", "b"].join("\n"),
  );
  assert.equal(m.branch, undefined);
  assert.equal(Object.hasOwn(m, "branch"), false);
});

test("parseMemoryFile does NOT reject an unknown metadata key — the harness owns this file format", () => {
  // Making the metadata object strict would turn a harness-added key into an unparseable memory, which
  // DROPS it from the worklist and makes the backlog look smaller. Under-counting is the wrong way to
  // fail for a check whose whole job is to bound a backlog.
  const m = parseMemoryFile(
    "extra.md",
    ["---", "name: x", "description: d", "metadata:", "  type: user", "  future: yes", "---", "b"].join("\n"),
  );
  assert.equal(m.name, "x");
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

/** Stand up a temp memory dir + a temp seed snapshot + a ledger path, run graduate, and clean up. */
function withFixture(
  run: (deps: { memoryDir: string; snapshotPath: string; ledgerPath: string; now: string }) => void,
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
    run({ memoryDir, snapshotPath, ledgerPath: defaultLedgerPath(memoryDir), now: "2026-06-22" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("graduate (summary) lists novel candidates and surfaces every suppression", () => {
  withFixture((deps) => {
    const env = graduateCommand({ review: false }, deps);
    assert.equal(env.ok, true);
    // The always-visible tally — counts can never be silently hidden (ADR-0095 / ADR-0202).
    assert.match(
      env.body,
      /tally: 2 live \(2 new, 0 changed, 0 lease-expired\), 0 parked, 1 duplicate suppressed, 1 user-tier deferred, 1 unparseable\./,
    );
    // Live: the reference (→ definition, with a resolved wiki-link) and the feedback (→ principle),
    // both `[new]` under an empty park ledger.
    assert.match(env.body, /LIVE candidates \(2\)/);
    assert.match(env.body, /a-reference {2}→ definition {3}refs: asset:existing-thing {3}\[new\]/);
    assert.match(env.body, /feedback-rule {2}→ principle {3}refs: — {3}\[new\]/);
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
  const missing = path.join(tmpdir(), "definitely-not-here-grad");
  const env = graduateCommand(
    { review: false },
    { memoryDir: missing, snapshotPath: "x", ledgerPath: defaultLedgerPath(missing), now: "2026-06-22" },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /could not read memory dir/);
  assert.ok((env.next ?? []).some((n) => n.includes("--memory-dir")));
});

// ---- the pre-merge nudge (the `check:graduation-worklist` gate surface) -----------------------

test("graduationNudge: zero live candidates reports OK, naming the parked suppression (ADR-0202)", () => {
  const quiet = graduationNudge({ new: 0, changed: 0, expired: 0, parked: 0 });
  assert.equal(quiet.level, "OK");
  assert.equal(quiet.lines.length, 1);
  assert.match(quiet.lines[0] ?? "", /OK — no live agent-memory candidates await graduation\./);

  // Parked-but-quiet: the suppression is visible on the OK line, never silent (ADR-0095).
  const parked = graduationNudge({ new: 0, changed: 0, expired: 0, parked: 70 });
  assert.equal(parked.level, "OK");
  assert.match(parked.lines[0] ?? "", /\(70 parked under lease, ADR-0202\)/);
  // Every line is tagged so the gate output stays greppable.
  assert.ok(parked.lines.every((l) => l.startsWith(GRADUATION_NUDGE_TAG)));
});

test("graduationNudge: live candidates WARN with the new/changed/expired breakdown", () => {
  const n = graduationNudge({ new: 2, changed: 1, expired: 0, parked: 67 });
  assert.equal(n.level, "WARN");
  // The count + breakdown are named so the orchestrator sees the backlog pre-merge (ADR-0095 D7).
  assert.match(n.lines[0] ?? "", /WARN — 3 live agent-memory candidate\(s\)/);
  assert.match(n.lines[0] ?? "", /2 new, 1 changed since review/);
  // The pointer routes to the review command, the librarian, AND the park verdict (ADR-0202).
  const joined = n.lines.join("\n");
  assert.match(joined, /storytree library graduate --review/);
  assert.match(joined, /librarian-curator/);
  assert.match(joined, /graduate park <name> --reason/);
  assert.ok(n.lines.every((l) => l.startsWith(GRADUATION_NUDGE_TAG)));
});

test("graduationNudge: lease-expired candidates surface the inverted re-review question", () => {
  const n = graduationNudge({ new: 0, changed: 0, expired: 2, parked: 68 });
  assert.equal(n.level, "WARN");
  assert.match(n.lines[0] ?? "", /2 lease-expired/);
  const joined = n.lines.join("\n");
  // The expiry inverts the question (ADR-0202 D3): alive-check, three honest outcomes.
  assert.match(joined, /is this still alive\?/);
  assert.match(joined, /re-park \/ delete \/ graduate-then-delete/);
});

test("graduationNudge: negative counts are treated as empty (defensive), not a WARN", () => {
  assert.equal(graduationNudge({ new: -1, changed: 0, expired: 0, parked: 0 }).level, "OK");
});

test("defaultSnapshotPath resolves to the seed corpus under apps/studio/data", () => {
  assert.ok(
    defaultSnapshotPath().endsWith(path.join("apps", "studio", "data", "knowledge.json")),
    defaultSnapshotPath(),
  );
});

// ---- ADR-0202: the park verdict (ledger seam + `graduate park` + the lease-filtered worklist) --

test("defaultLedgerPath sits BESIDE the memory dir (machine-local, carried by --memory-dir)", () => {
  const d = defaultLedgerPath(path.join("home", ".claude", "projects", "C--code-storytree", "memory"));
  assert.equal(d, path.join("home", ".claude", "projects", "C--code-storytree", "graduation-park.json"));
});

test("readParkLedger: a missing file is the normal empty state, not a problem", () => {
  const r = readParkLedger(path.join(tmpdir(), "no-such-ledger-here.json"));
  assert.deepEqual(r.ledger, { version: 1, parks: {} });
  assert.equal(r.problem, undefined);
});

test("park records the verdict, silences the candidate, and an edit re-enters it (ADR-0202 D1/D2)", () => {
  withFixture((deps) => {
    // Park one of the two live candidates with a reason.
    const parked = parkCommand(
      [{ name: "a-reference", reason: "machine-specific ops trap — saves re-discovery" }],
      deps,
    );
    assert.equal(parked.ok, true, parked.body);
    assert.match(parked.body, /a-reference {2}parked — lease expires 2026-08-21 \(60d, hash [0-9a-f]{8}\)/);

    // The ledger persisted the full record.
    const ledger = parseParkLedger(JSON.parse(readFileSync(deps.ledgerPath, "utf8")));
    const rec = ledger.parks["a-reference"];
    assert.ok(rec !== undefined);
    assert.equal(rec.verdict, "wont-graduate");
    assert.equal(rec.reason, "machine-specific ops trap — saves re-discovery");
    assert.equal(rec.reviewedAt, "2026-06-22");
    assert.equal(rec.leaseDays, 60);

    // The worklist now shows 1 live / 1 parked, with the parked reason + expiry surfaced.
    const env = graduateCommand({ review: false }, deps);
    assert.match(env.body, /tally: 1 live \(1 new, 0 changed, 0 lease-expired\), 1 parked/);
    assert.match(env.body, /PARKED \(1\)/);
    assert.match(env.body, /a-reference {2}— machine-specific ops trap — saves re-discovery {2}\(lease expires 2026-08-21\)/);

    // Edit the parked memory — the hash breaks and it re-enters the worklist immediately (D2).
    writeFileSync(
      path.join(deps.memoryDir, "a-reference.md"),
      mem({ name: "a-reference", type: "reference", body: "EDITED body — see [[An Existing Thing]]." }),
    );
    const after = graduateCommand({ review: false }, deps);
    assert.match(after.body, /tally: 2 live \(1 new, 1 changed, 0 lease-expired\), 0 parked/);
    assert.match(after.body, /a-reference {2}→ definition.*\[changed\]/);
  });
});

test("park refuses an unknown memory all-or-nothing (nothing written)", () => {
  withFixture((deps) => {
    const env = parkCommand(
      [
        { name: "a-reference", reason: "valid" },
        { name: "no-such-memory", reason: "typo" },
      ],
      deps,
    );
    assert.equal(env.ok, false);
    assert.match(env.body, /park refused — 1 of 2 item\(s\) failed validation/);
    assert.match(env.body, /no-such-memory: no such memory/);
    // All-or-nothing: the valid item was NOT written either.
    assert.equal(readParkLedger(deps.ledgerPath).ledger.parks["a-reference"], undefined);
  });
});

test("park --file batch parses, applies a lease override, and re-park refreshes (ADR-0202 D3)", () => {
  withFixture((deps) => {
    const items = parseParkFile(
      JSON.stringify([
        { name: "a-reference", reason: "keeper", leaseDays: 10 },
        { name: "feedback-rule", reason: "un-graduated preference" },
      ]),
    );
    const env = parkCommand(items, deps);
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /parked 2 memories/);
    // The 10-day override: 2026-06-22 + 10 = 2026-07-02.
    assert.match(env.body, /a-reference {2}parked — lease expires 2026-07-02 \(10d/);

    // Everything live is now parked → the worklist is quiet.
    const quiet = graduateCommand({ review: false }, deps);
    assert.match(quiet.body, /tally: 0 live \(0 new, 0 changed, 0 lease-expired\), 2 parked/);
    assert.match(quiet.body, /LIVE candidates \(0\)/);

    // Past the short lease the candidate returns as lease-expired (inclusive boundary).
    const expired = graduateCommand({ review: false }, { ...deps, now: "2026-07-02" });
    assert.match(expired.body, /tally: 1 live \(0 new, 0 changed, 1 lease-expired\), 1 parked/);
    assert.match(expired.body, /a-reference {2}→ definition.*\[lease-expired\]/);

    // Re-park (the re-park outcome of the expiry re-review) refreshes the record in place.
    const reparked = parkCommand([{ name: "a-reference", reason: "still alive" }], { ...deps, now: "2026-07-02" });
    assert.equal(reparked.ok, true, reparked.body);
    assert.match(reparked.body, /a-reference {2}parked \(refreshed\) — lease expires 2026-08-31 \(60d/);
  });
});

test("park fails CLOSED on a corrupt ledger; the read paths treat it as empty and SURFACE it", () => {
  withFixture((deps) => {
    writeFileSync(deps.ledgerPath, "{ not json");
    // The write refuses — recorded verdicts are never silently clobbered.
    const env = parkCommand([{ name: "a-reference", reason: "r" }], deps);
    assert.equal(env.ok, false);
    assert.match(env.body, /park refused — the existing ledger file does not parse/);
    // The read path stays advisory: worklist shows everything live + surfaces the problem.
    const read = graduateCommand({ review: false }, deps);
    assert.equal(read.ok, true);
    assert.match(read.body, /tally: 2 live/);
    assert.match(read.body, /PARK LEDGER unreadable — treated as EMPTY/);
  });
});

test("park prunes an orphaned record (memory deleted) on write, surfaced by name", () => {
  withFixture((deps) => {
    parkCommand([{ name: "a-reference", reason: "keeper" }], deps);
    rmSync(path.join(deps.memoryDir, "a-reference.md"));
    const env = parkCommand([{ name: "feedback-rule", reason: "also keeper" }], deps);
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /pruned 1 orphaned record\(s\) \(memory deleted\): a-reference/);
    const ledger = readParkLedger(deps.ledgerPath).ledger;
    assert.equal(ledger.parks["a-reference"], undefined);
    assert.ok(ledger.parks["feedback-rule"] !== undefined);
  });
});

test("parseParkFile rejects an empty array, a missing reason, and a non-positive lease", () => {
  assert.throws(() => parseParkFile("[]"));
  assert.throws(() => parseParkFile(JSON.stringify([{ name: "x" }])));
  assert.throws(() => parseParkFile(JSON.stringify([{ name: "x", reason: "r", leaseDays: 0 }])));
});
