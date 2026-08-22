import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  adrCommand,
  kebabSlug,
  parseEdges,
  parallelAllocations,
  parallelAllocationNote,
  scaffold,
  extractAdrTitle,
  renderAdrList,
  type AdrListing,
  type AdrAllocatorLike,
  type AdrCommandDeps,
} from "./adr.js";
import type { AdrMeta } from "@storytree/drive";
// The `decided:` date is stamped at the COMPOSITION ROOT, so its proof drives `run` end to end —
// `adrCommand` only ever sees an already-injected `today`.
import { InMemoryStore } from "@storytree/storage-protocol";
import { run } from "./commands.js";

// ---- pure helpers --------------------------------------------------------------------------

test("kebabSlug lowercases, hyphenates, strips junk, and caps length", () => {
  assert.equal(kebabSlug("Hosted studio may wake its own DB!"), "hosted-studio-may-wake-its-own-db");
  assert.equal(kebabSlug("  ADR:  Foo/Bar  "), "adr-foo-bar");
  assert.equal(kebabSlug("***"), "");
  assert.ok(kebabSlug("x".repeat(200)).length <= 60);
});

test("parseEdges parses comma/space lists of positive ints, dropping junk", () => {
  assert.deepEqual(parseEdges("42"), [42]);
  assert.deepEqual(parseEdges("42, 43 7"), [42, 43, 7]);
  assert.deepEqual(parseEdges("0, -1, abc, 5"), [5]); // 0 and negatives and non-numbers dropped
  assert.deepEqual(parseEdges(undefined), []);
});

test("scaffold emits proposed frontmatter + H1 + sections, with optional edges", () => {
  const plain = scaffold(50, "Do the thing", { supersedes: [], amends: [] });
  assert.match(plain, /^---\nstatus: proposed\n---\n/);
  assert.match(plain, /# ADR-0050: Do the thing/);
  assert.match(plain, /## Status/);
  assert.match(plain, /## Decision/);
  assert.doesNotMatch(plain, /supersedes:/);

  const edged = scaffold(51, "Edged", { supersedes: [42], amends: [7, 8] });
  assert.match(edged, /supersedes: \[42\]/);
  assert.match(edged, /amends: \[7, 8\]/);
  assert.match(edged, /\*\*Supersedes\*\* ADR-0042/);
  assert.match(edged, /\*\*Amends\*\* ADR-0007, ADR-0008/);
});

test("scaffold owner-directed (decided date) is born accepted with decided frontmatter + Status prose (ADR-0110)", () => {
  const directed = scaffold(110, "Owner directed it", { supersedes: [], amends: [] }, "2026-06-26");
  // Frontmatter: accepted + a decided date (NOT the proposed default).
  assert.match(directed, /^---\nstatus: accepted\ndecided: 2026-06-26\n---\n/);
  assert.doesNotMatch(directed, /status: proposed/);
  // Status prose records the owner's design-time directive — the honest projection (ADR-0110).
  assert.match(directed, /## Status/);
  assert.match(directed, /accepted \(2026-06-26\) — decided\/directed by the owner in conversation on 2026-06-26/);
  assert.doesNotMatch(directed, /<one line: who decided/); // the proposed placeholder is gone

  // Owner-directed still carries edges when present (the date is orthogonal to supersession).
  const directedEdged = scaffold(111, "Directed + edged", { supersedes: [50], amends: [] }, "2026-06-26");
  assert.match(directedEdged, /status: accepted\ndecided: 2026-06-26\nsupersedes: \[50\]/);

  // Default (no date) stays born-proposed with NO decided line — the still-thinking ADR (ADR-0050).
  const proposed = scaffold(112, "Still thinking", { supersedes: [], amends: [] });
  assert.match(proposed, /^---\nstatus: proposed\n---\n/);
  assert.doesNotMatch(proposed, /decided:/);
  // An empty-string date is treated as absent (defensive) — still proposed.
  assert.match(scaffold(113, "Empty", { supersedes: [], amends: [] }, ""), /^---\nstatus: proposed\n---\n/);
});

// ---- adr list (the searchable current-state view, ADR-0086) --------------------------------

test("extractAdrTitle pulls the text after `# ADR-NNNN:`; '' when absent", () => {
  assert.equal(extractAdrTitle("---\nstatus: accepted\n---\n# ADR-0019: Library tier & defer DBOS\n"), "Library tier & defer DBOS");
  assert.equal(extractAdrTitle("no heading here"), "");
});

function listing(
  number: number,
  status: AdrMeta["status"],
  title: string,
  extra?: Partial<AdrMeta>,
): AdrListing {
  return {
    meta: {
      number,
      file: `${String(number).padStart(4, "0")}-x.md`,
      status,
      supersedes: [],
      amends: [],
      loadBearing: false,
      ...extra,
    },
    title,
  };
}

const SAMPLE: AdrListing[] = [
  listing(11, "accepted", "Own the agent loop", { loadBearing: true }),
  listing(14, "superseded", "Notice board v1"),
  listing(19, "accepted", "Library tier & defer DBOS", { loadBearing: true }),
  listing(27, "accepted", "Supersede the notice board", { supersedes: [14] }),
  listing(86, "proposed", "ADR lifecycle curation"),
  listing(142, "accepted", "Branch dies on merge", { loadBearing: true }),
  listing(271, "accepted", "Sessions end at merge", { amends: [142] }),
];

test("renderAdrList default shows every ADR, sorted by number, newest concerns last", () => {
  const lines = renderAdrList(SAMPLE, {}).join("\n");
  assert.match(lines, /0011/);
  assert.match(lines, /0086/);
  // sorted ascending: 0011 appears before 0086
  assert.ok(lines.indexOf("0011") < lines.indexOf("0086"));
});

test("renderAdrList --current keeps only accepted (drops proposed + superseded rows)", () => {
  const lines = renderAdrList(SAMPLE, { current: true }).join("\n");
  assert.match(lines, /0011 .*accepted/);
  assert.match(lines, /0019 .*accepted/);
  // the superseded + proposed ROWS are gone (0014 may still appear as 0027's `supersedes 0014` edge).
  assert.doesNotMatch(lines, /0014 .*superseded/);
  assert.doesNotMatch(lines, /0086 .*proposed/);
});

test("renderAdrList --load-bearing keeps the tagged set and what its amends edges reach", () => {
  const lines = renderAdrList(SAMPLE, { loadBearing: true }).join("\n");
  assert.match(lines, /0011/);
  assert.match(lines, /0019/);
  assert.match(lines, /0271/); // reached: accepted, amends ★0142
  // An unrelated superseder and a proposed ADR are neither tagged nor reached.
  assert.doesNotMatch(lines, /0027/);
  assert.doesNotMatch(lines, /0086/);
});

test("renderAdrList --status filters to an exact status", () => {
  const lines = renderAdrList(SAMPLE, { status: "superseded" }).join("\n");
  assert.match(lines, /0014/);
  assert.doesNotMatch(lines, /0019/);
});

test("renderAdrList shows outgoing edges and the derived superseded-by back-edge", () => {
  const lines = renderAdrList(SAMPLE, {}).join("\n");
  assert.match(lines, /supersedes 0014/); // 0027's outgoing edge
  assert.match(lines, /superseded by 0027/); // 0014's derived back-edge
});

test("renderAdrList shows the derived amended-by back-edge, even when the amender is filtered out", () => {
  const lines = renderAdrList(SAMPLE, {}).join("\n");
  assert.match(lines, /amends 0142/); // 0271's outgoing edge
  assert.match(lines, /amended by 0271/); // 0142's derived back-edge

  // Computed from the FULL set BEFORE the display filter, so a back-edge survives a cut that hides
  // the amender's own row. An ACCEPTED amender is no longer such a case (it is now pulled INTO
  // `--load-bearing` by reach — see the reach tests below); a still-undecided one is, and must
  // still leave its pointer on the amended ADR.
  const loadBearing = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.doesNotMatch(loadBearing, /0265 {2}proposed/); // the proposed amender's ROW is filtered out
  assert.match(loadBearing, /amended by .*0265 \(proposed\)/); // …its back-edge on 0142 survives
});

// ---- --load-bearing calibration reach (the-load-bearing-view-follows-amends-edges) ------------
//
// The curated ★ tag alone made `--load-bearing` CONFIDENTLY INCOMPLETE: an accepted ADR that
// amends a load-bearing one overtakes part of it, yet was absent from the exact surface CLAUDE.md
// sends every session to calibrate on — and absence is undetectable from that surface. Reach is
// now DERIVED from the `amends` edge that already exists in the frontmatter (ADR-0037), so it
// cannot drift from the files and survives ADR-0139 retiring the `load_bearing` tag.
const REACH: AdrListing[] = [
  listing(142, "accepted", "Branch dies on merge", { loadBearing: true }), // ★ the curated seed
  listing(271, "accepted", "Sessions end at merge", { amends: [142] }), // ☆ one hop
  listing(275, "accepted", "Sessions may continue past merge", { amends: [271] }), // ☆ two hops
  listing(265, "proposed", "An undecided amendment", { amends: [142] }), // undecided → not reached
  listing(177, "superseded", "A dead amendment", { amends: [142] }), // dead → not reached
  listing(500, "accepted", "Unrelated to the set", {}), // no edge → not reached
];

test("--load-bearing reaches an accepted ADR that amends the curated set", () => {
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.match(lines, /0142 {2}accepted/); // the curated seed
  assert.match(lines, /0271 {2}accepted/); // reached: it amends ★0142
});

test("--load-bearing reach is TRANSITIVE — an amender of a reached ADR is reached too", () => {
  // One hop would re-create the reported gap one level out: 0275 overtakes part of 0271, which
  // itself overtakes part of ★0142. A reader calibrating on this surface needs the whole chain.
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.match(lines, /0275 {2}accepted/);
});

test("--load-bearing reach never promotes an UNDECIDED or DEAD amendment", () => {
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  // The inverse error: a derived view that pulls in a `proposed` amender OVERSTATES the current
  // set, and a `superseded` one resurrects a dead decision. Only `accepted` edges propagate.
  assert.doesNotMatch(lines, /0265 {2}proposed/);
  assert.doesNotMatch(lines, /0177 {2}superseded/);
  // …and an accepted ADR with no edge into the set stays out.
  assert.doesNotMatch(lines, /0500 {2}accepted/);
});

test("renderAdrList marks curated ★ and edge-reached ☆ so growth in the set is attributable", () => {
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.match(lines, /★ 0142 {2}accepted/); // hand-curated
  assert.match(lines, /☆ 0271 {2}accepted/); // derived from the edge
  assert.match(lines, /☆ 0275 {2}accepted/);
});

test("back-edges label a non-accepted amender with its status (never as a live amendment)", () => {
  const lines = renderAdrList(REACH, {}).join("\n");
  // ★0142 is amended by one accepted, one proposed and one superseded ADR. Rendered bare they read
  // identically — the reader cannot tell a live amendment from an undecided or a dead one.
  assert.match(lines, /amended by 0177 \(superseded\), 0265 \(proposed\), 0271$/m);
});

test("back-edge status labels apply to superseded-by too", () => {
  const mixed: AdrListing[] = [
    listing(400, "superseded", "The target"),
    listing(410, "proposed", "An undecided superseder", { supersedes: [400] }),
  ];
  const lines = renderAdrList(mixed, {}).join("\n");
  assert.match(lines, /superseded by 0410 \(proposed\)$/m);
});

test("renderAdrList dedupes + sorts both derived back-edges (two amenders, one twice)", () => {
  const dup: AdrListing[] = [
    listing(300, "accepted", "Amended twice over"),
    listing(310, "accepted", "Later amender", { amends: [300] }),
    listing(305, "accepted", "Earlier amender", { amends: [300, 300] }),
    listing(320, "superseded", "Superseded twice over"),
    listing(330, "accepted", "Superseder", { supersedes: [320, 320] }),
  ];
  const lines = renderAdrList(dup, {}).join("\n");
  assert.match(lines, /amended by 0305, 0310/); // ascending, each amender once
  assert.match(lines, /superseded by 0330$/m);
});

// ---- adr new / next ------------------------------------------------------------------------

interface FakeAllocatorResult { allocator: AdrAllocatorLike; seen: Parameters<AdrAllocatorLike["allocate"]>[0][] }

/** A fake allocator that always returns a fixed number and records what it was asked. */
function fakeAllocator(number: number): FakeAllocatorResult {
  const seen: Parameters<AdrAllocatorLike["allocate"]>[0][] = [];
  return {
    allocator: {
      allocate: async (a) => {
        seen.push(a);
        return { number };
      },
    },
    seen,
  };
}

function withDecisionsDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "adr-new-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

/**
 * `store` is OPTIONAL because the two halves of this command now have different sources: `adr new`
 * still scaffolds a FILE (and dual-writes a row when it can), while `adr list` reads the STORE only
 * (ADR-0403 dec 1). Omitting it is therefore a real invocation shape — a read-only one — and the
 * suite asserts what each half does with it missing rather than always wiring it.
 */
const depsFor = (
  dir: string,
  allocator: AdrAllocatorLike | null,
  store?: InMemoryStore,
): AdrCommandDeps => ({
  allocator,
  branch: "claude/test",
  actor: "tester",
  today: "2026-06-26",
  ...(store === undefined ? {} : { roundTrip: { store, writable: true, actor: "tester" } }),
});

/** One decision ROW, as the store carries it since ADR-0403 dec 1. */
async function seedDecision(
  store: InMemoryStore,
  number: number,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const id = `adr-${String(number).padStart(4, "0")}`;
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title,
      description: `ADR-${String(number).padStart(4, "0")} — ${title}`,
      body: `# ADR-${String(number).padStart(4, "0")}: ${title}\n`,
      number,
      status: "accepted",
      amends: [],
      supersedes: [],
      loadBearing: false,
      references: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
      ...extra,
    },
  });
}

test("adr new --pg: reserves from the allocator, scaffolds NNNN-slug.md, no offline warning", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 46, "A prior decision");
    const { allocator, seen } = fakeAllocator(50);
    const env = await adrCommand("new", { title: "Wake the DB" }, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);
    // `localMax` is the STORE's highest decision now, not the highest filename — same role, same
    // guarantee (the allocator reserves max+1, so a stale value costs a gap, never a collision).
    assert.deepEqual(seen[0], { localMax: 46, slug: "wake-the-db", branch: "claude/test", actor: "tester" });
    const row = (await store.getDoc("adr-0050"))?.doc as Record<string, unknown>;
    assert.equal(row["title"], "Wake the DB");
    assert.equal(row["status"], "proposed");
    assert.match(String(row["body"]), /# ADR-0050: Wake the DB/);
    assert.equal(readdirSync(dir).length, 0, "no file is written any more — the row IS the decision");
    assert.match(env.body, /reserved in the DB and written as adr-0050/);
  });
});

test("adr new --decided: owner-directed scaffold is born accepted with today's decided date (ADR-0110)", async () => {
  await withDecisionsDir(async (dir) => {
    const { allocator } = fakeAllocator(110);
    const store = new InMemoryStore();
    const env = await adrCommand(
      "new",
      { title: "Collapse the ratification ask", decided: true },
      depsFor(dir, allocator, store), // depsFor injects today = 2026-06-26
    );
    assert.equal(env.ok, true);
    const row = (await store.getDoc("adr-0110"))?.doc as Record<string, unknown>;
    assert.equal(row["status"], "accepted");
    assert.equal(row["decided"], "2026-06-26");
    assert.match(String(row["body"]), /decided\/directed by the owner in conversation on 2026-06-26/);
    // The success message reflects the born-accepted, owner-directed status (not "proposed status").
    assert.match(env.body, /ACCEPTED \(owner-directed, decided 2026-06-26 — ADR-0110\)/);
    assert.doesNotMatch(env.body, /Scaffolded with proposed status/);
  });
});

test("adr new without --decided stays born-proposed (the still-thinking default, ADR-0050)", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    const { allocator } = fakeAllocator(111);
    const env = await adrCommand("new", { title: "Still exploring" }, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);
    const row = (await store.getDoc("adr-0111"))?.doc as Record<string, unknown>;
    assert.equal(row["status"], "proposed");
    assert.equal(row["decided"], undefined);
    assert.match(env.body, /Scaffolded with proposed status/);
  });
});

test("adr new refuses without a title", async () => {
  await withDecisionsDir(async (dir) => {
    const env = await adrCommand("new", {}, depsFor(dir, null));
    assert.equal(env.ok, false);
    assert.match(env.body, /needs a title/);
    assert.equal(readdirSync(dir).length, 0, "no file written");
  });
});

test("adr new surfaces an allocator failure as a clear error (db down)", async () => {
  await withDecisionsDir(async (dir) => {
    const failing: AdrAllocatorLike = {
      allocate: async () => {
        throw new Error("connection terminated");
      },
    };
    const env = await adrCommand("new", { title: "X" }, depsFor(dir, failing));
    assert.equal(env.ok, false);
    assert.match(env.body, /couldn't reserve an ADR number/);
    assert.match(env.body, /connection terminated/);
    assert.equal(readdirSync(dir).length, 0, "no file written when reservation failed");
  });
});

test("adr next --pg reserves a number; without it there is nothing left to peek AT", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 46, "A prior decision");
    const { allocator } = fakeAllocator(47);
    const reserved = await adrCommand("next", {}, depsFor(dir, allocator, store));
    assert.equal(reserved.ok, true);
    assert.match(reserved.body, /ADR-0047 reserved/);

    // The offline `max-on-disk + 1` peek went with the directory it read (ADR-0403 dec 1), and is
    // NOT replaced: a session that cannot write the decision must not burn a number reserving one.
    const peek = await adrCommand("next", {}, depsFor(dir, null));
    assert.equal(peek.ok, false);
    assert.match(peek.body, /needs --pg/);
    assert.match(peek.body, /reserving a number a session cannot then write would burn it/);
  });
});

// ---- the parallel-allocation heads-up ------------------------------------------------------
//
// The 2026-08-09 near-miss: ADR-0335 and ADR-0337 were decided the same day in parallel sessions and
// partially contradicted each other. The 0337 session's `git fetch && git merge origin/main` said
// "Already up to date" — 0335's PR had not merged — so the ceremony saw nothing, and CI would have
// shown it only as a merge conflict, after both designs were settled. The allocator already knew:
// handing out 0337 means 0335/0336 exist. These tests hold that signal to being emitted, exact, and
// QUIET whenever it has nothing to say.

test("parallelAllocations is the exact gap between the local max and the reserved number", () => {
  // The real shape: checkout is at 0334, the store hands out 0337 → two sessions took 0335/0336.
  assert.deepEqual(parallelAllocations(334, 337), [335, 336]);
  // Contiguous — nobody allocated in parallel. The silent case, and the common one.
  assert.deepEqual(parallelAllocations(338, 339), []);
  // Never negative/backwards: an offline-authored ADR can leave the checkout AHEAD of the store.
  assert.deepEqual(parallelAllocations(340, 339), []);
  assert.deepEqual(parallelAllocations(339, 339), []);
  // No ADRs on disk = a missing/unreadable decisions dir, not a parallel-allocation signal.
  assert.deepEqual(parallelAllocations(0, 50), []);
});

test("parallelAllocationNote is empty for an empty gap and caps a very stale checkout", () => {
  assert.deepEqual(parallelAllocationNote([]), { lines: [], next: [] });

  // Singular reads as singular — one number is "another session", not "other sessions".
  const one = parallelAllocationNote([335]).lines.join("\n");
  assert.match(one, /ADR-0335 was allocated by another session/);
  assert.match(one, /If it touches your area/);

  const many = parallelAllocationNote([301, 302, 303, 304, 305, 306, 307, 308, 309, 310]);
  const body = many.lines.join("\n");
  assert.match(body, /ADR-0301, 0302, 0303, 0304, 0305, 0306, 0307, 0308, \+2 more were allocated/);
  assert.doesNotMatch(body, /0309/, "the tail is a count, not a wall of numbers");
});

test("adr new --pg names the numbers other sessions allocated, and points across ALL refs", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 334, "A prior decision");
    const { allocator } = fakeAllocator(337);
    const env = await adrCommand("new", { title: "Arc reopen verb" }, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);

    // It is a HEADS-UP, not a gate: the decision was still written and the envelope is still ok.
    assert.ok(await store.getDoc("adr-0337"), "the decision was still scaffolded");
    assert.match(env.body, /ADR-0335, 0336 were allocated by other sessions/);
    assert.match(env.body, /can CONTRADICT yours/);

    // The offered step is a READ of the row, not git archaeology across every fetched ref: a
    // sibling's decision is visible the moment they write it now (ADR-0403 dec 1). What survives is
    // the GAP the note is really about — a number reserved and not yet written.
    const next = (env.next ?? []).join("\n");
    assert.match(next, /storytree library artifact adr-0335/);
    assert.doesNotMatch(next, /git fetch/);
  });
});

test("adr new --pg says NOTHING when the checkout is current (fail quiet)", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 338, "A prior decision");
    const { allocator } = fakeAllocator(339);
    const env = await adrCommand("new", { title: "Next in line" }, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);
    assert.doesNotMatch(env.body, /allocated by other sessions/);
    assert.doesNotMatch((env.next ?? []).join("\n"), /library artifact adr-/);
  });
});

test("adr next --pg carries the same heads-up (its author writes prose too)", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 334, "A prior decision");
    const { allocator } = fakeAllocator(337);
    const env = await adrCommand("next", {}, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);
    assert.match(env.body, /ADR-0337 reserved/);
    assert.match(env.body, /ADR-0335, 0336 were allocated by other sessions/);
    assert.match((env.next ?? []).join("\n"), /storytree library artifact adr-0335/);
  });
});

test("adr list reads the decision ROWS and renders them (ADR-0403 dec 1)", async () => {
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    await seedDecision(store, 19, "Library tier", { loadBearing: true });
    await seedDecision(store, 86, "Lifecycle", { status: "proposed" });

    const all = await adrCommand("list", {}, depsFor(dir, null, store));
    assert.equal(all.ok, true);
    assert.match(all.body, /0019/);
    assert.match(all.body, /Library tier/);
    assert.match(all.body, /0086/);

    const lb = await adrCommand("list", { loadBearing: true }, depsFor(dir, null, store));
    assert.match(lb.body, /0019/);
    assert.doesNotMatch(lb.body, /0086/); // proposed, not load-bearing
  });
});

test("adr list REFUSES without a store rather than reporting an empty decision log", async () => {
  // The offline read is the named accepted cost of ADR-0403, and the refusal has to SAY so: a
  // command that answered "no decisions" when it simply had nowhere to look would report the corpus
  // as empty — a confident wrong answer about the surface every session orients on.
  await withDecisionsDir(async (dir) => {
    const env = await adrCommand("list", {}, depsFor(dir, null));
    assert.equal(env.ok, false);
    assert.match(env.body, /store/);
  });
});

test("adr list says the store is EMPTY rather than pretending the log is missing", async () => {
  await withDecisionsDir(async (dir) => {
    const env = await adrCommand("list", {}, depsFor(dir, null, new InMemoryStore()));
    assert.equal(env.ok, false);
    assert.match(env.body, /no decisions in the store/);
    assert.match(env.body, /is the DB up/);
  });
});

test("adr new DUAL-WRITES the row, so the scaffold is visible to `adr list`", async () => {
  // The dual-source window (`decision-log-home-arc` inc 03→05): `adr new` writes a FILE and `adr
  // list` reads ROWS, so a scaffold that wrote only the file would exist and not appear.
  await withDecisionsDir(async (dir) => {
    const store = new InMemoryStore();
    const { allocator } = fakeAllocator(77);
    const env = await adrCommand("new", { title: "A dual written decision" }, depsFor(dir, allocator, store));
    assert.equal(env.ok, true);
    assert.match(env.body, /reserved in the DB and written as adr-0077/);

    const row = (await store.getDoc("adr-0077"))?.doc as Record<string, unknown>;
    assert.equal(row["number"], 77);
    assert.equal(row["status"], "proposed");
    assert.equal(row["title"], "A dual written decision");

    const listed = await adrCommand("list", {}, depsFor(dir, null, store));
    assert.match(listed.body, /0077/);
    assert.match(listed.body, /A dual written decision/);
  });
});

test("adr help (no sub) and an unknown sub both return guidance", async () => {
  await withDecisionsDir(async (dir) => {
    const help = await adrCommand(undefined, {}, depsFor(dir, null));
    assert.equal(help.ok, true);
    assert.match(help.body, /storytree adr/);
    const unknown = await adrCommand("frobnicate", {}, depsFor(dir, null));
    assert.equal(unknown.ok, false);
    assert.match(unknown.body, /unknown adr command/);
  });
});

test("scaffold stamps arc provenance (ADR-0183 D3) only when given", () => {
  const stamped = scaffold(183, "Arc-born decision", { supersedes: [], amends: [] }, undefined, "map-pathways-arc");
  assert.match(stamped, /^---\nstatus: proposed\narc: map-pathways-arc\n---\n/);

  // Composes with --decided: the stamp rides after the edges, inside the frontmatter block.
  const directed = scaffold(184, "Directed + arc", { supersedes: [], amends: [7] }, "2026-07-11", "map-pathways-arc");
  assert.match(directed, /status: accepted\ndecided: 2026-07-11\namends: \[7\]\narc: map-pathways-arc\n---\n/);

  // Unstamped stays exactly as before — no arc key at all.
  assert.doesNotMatch(scaffold(185, "Arc-less", { supersedes: [], amends: [] }), /arc:/);
});

// ---- the `decided:` stamp is the OWNER's local date (proposal
// `adr-new-decided-stamps-the-owners-local-date`) ------------------------------------------------
//
// `adr.ts` already treats `today` as injected data — the defect was upstream, at the composition
// root, which computed it from the UTC clock. Any session running before ~10:00 Australia/Sydney
// therefore recorded the decision as the PREVIOUS day, in BOTH the `decided:` frontmatter and the
// `## Status` prose, and both had to be hand-corrected on every owner-directed ADR.

/** 23:30 UTC on the 10th is already 09:30 on the 11th in Sydney — the exact off-by-one window. */
const ACROSS_THE_DATE_LINE = new Date("2026-07-10T23:30:00Z");

async function adrNewThroughRun(
  dir: string,
  number: number,
  extraArgv: string[],
  now: Date,
): Promise<{ env: Awaited<ReturnType<typeof run>>; decided: string; body: string }> {
  const { allocator } = fakeAllocator(number);
  const store = new InMemoryStore();
  const env = await run(["adr", "new", "--title", "A decided thing", "--decided", ...extraArgv], {
    store,
    adr: allocator,
    adrDecisionsDir: dir,
    writable: true,
    now: () => now,
  });
  // The ROW is the only copy now (ADR-0403 dec 1), so the pair this test exists for — the typed
  // `decided` field and the `## Status` prose — is read from one document rather than one file.
  const row = (await store.getDoc(`adr-${String(number).padStart(4, "0")}`))?.doc as
    | Record<string, unknown>
    | undefined;
  return {
    env,
    decided: typeof row?.["decided"] === "string" ? (row["decided"] as string) : "",
    body: typeof row?.["body"] === "string" ? (row["body"] as string) : "",
  };
}

test("adr new --decided stamps the OWNER-LOCAL date, not the UTC one — in BOTH places", async () => {
  await withDecisionsDir(async (dir) => {
    const { decided, body } = await adrNewThroughRun(dir, 300, [], ACROSS_THE_DATE_LINE);
    // The typed field.
    assert.equal(decided, "2026-07-11", "the `decided` field");
    // AND the Status prose — the defect surfaced in two places, so a fix correcting one is a half-fix.
    assert.match(body, /decided\/directed by the owner in conversation on 2026-07-11/, "## Status prose");
    assert.doesNotMatch(body, /2026-07-10/, "the UTC date appears nowhere in the decision");
  });
});

test("adr new --decided-date <YYYY-MM-DD> overrides the derived date", async () => {
  await withDecisionsDir(async (dir) => {
    const { decided, body } = await adrNewThroughRun(
      dir,
      301,
      ["--decided-date", "2026-06-01"],
      ACROSS_THE_DATE_LINE,
    );
    assert.equal(decided, "2026-06-01");
    assert.match(body, /decided\/directed by the owner in conversation on 2026-06-01/);
  });
});

test("adr new --decided-date refuses a value that is not YYYY-MM-DD", async () => {
  await withDecisionsDir(async (dir) => {
    const { allocator } = fakeAllocator(302);
    const env = await run(
      ["adr", "new", "--title", "Bad date", "--decided", "--decided-date", "1 June 2026"],
      { store: new InMemoryStore(), adr: allocator, adrDecisionsDir: dir },
    );
    assert.equal(env.ok, false);
    assert.match(env.body, /YYYY-MM-DD/);
    assert.equal(readdirSync(dir).length, 0, "nothing is scaffolded on a bad date");
  });
});
