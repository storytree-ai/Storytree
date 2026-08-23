import test from "node:test";
import assert from "node:assert/strict";

import {
  adrCommand,
  kebabSlug,
  parseEdges,
  parallelAllocations,
  parallelAllocationNote,
  scaffold,
  extractAdrTitle,
  renderAdrList,
  loadBearingReach,
  loadAdrListings,
  type AdrListing,
  type AdrAllocatorLike,
  type AdrCommandDeps,
} from "./adr.js";
import { amendsObligationNote } from "./adr-amends-obligation.js";
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
  const plain = scaffold(50, "Do the thing", { supersedes: [], amends: [], dependsOn: [] });
  assert.match(plain, /^---\nstatus: proposed\n---\n/);
  assert.match(plain, /# ADR-0050: Do the thing/);
  assert.match(plain, /## Status/);
  assert.match(plain, /## Decision/);
  assert.doesNotMatch(plain, /supersedes:/);

  const edged = scaffold(51, "Edged", { supersedes: [42], amends: [7, 8], dependsOn: [] });
  assert.match(edged, /supersedes: \[42\]/);
  assert.match(edged, /amends: \[7, 8\]/);
  assert.match(edged, /\*\*Supersedes\*\* ADR-0042/);
  assert.match(edged, /\*\*Amends\*\* ADR-0007, ADR-0008/);
});

test("scaffold owner-directed (decided date) is born accepted with decided frontmatter + Status prose (ADR-0110)", () => {
  const directed = scaffold(110, "Owner directed it", { supersedes: [], amends: [], dependsOn: [] }, "2026-06-26");
  // Frontmatter: accepted + a decided date (NOT the proposed default).
  assert.match(directed, /^---\nstatus: accepted\ndecided: 2026-06-26\n---\n/);
  assert.doesNotMatch(directed, /status: proposed/);
  // Status prose records the owner's design-time directive — the honest projection (ADR-0110).
  assert.match(directed, /## Status/);
  assert.match(directed, /accepted \(2026-06-26\) — decided\/directed by the owner in conversation on 2026-06-26/);
  assert.doesNotMatch(directed, /<one line: who decided/); // the proposed placeholder is gone

  // Owner-directed still carries edges when present (the date is orthogonal to supersession).
  const directedEdged = scaffold(111, "Directed + edged", { supersedes: [50], amends: [], dependsOn: [] }, "2026-06-26");
  assert.match(directedEdged, /status: accepted\ndecided: 2026-06-26\nsupersedes: \[50\]/);

  // Default (no date) stays born-proposed with NO decided line — the still-thinking ADR (ADR-0050).
  const proposed = scaffold(112, "Still thinking", { supersedes: [], amends: [], dependsOn: [] });
  assert.match(proposed, /^---\nstatus: proposed\n---\n/);
  assert.doesNotMatch(proposed, /decided:/);
  // An empty-string date is treated as absent (defensive) — still proposed.
  assert.match(scaffold(113, "Empty", { supersedes: [], amends: [], dependsOn: [] }, ""), /^---\nstatus: proposed\n---\n/);
});

// ---- adr list (the searchable current-state view, ADR-0086) --------------------------------

test("extractAdrTitle pulls the text after `# ADR-NNNN:`; '' when absent, and ignores fenced code", () => {
  assert.equal(extractAdrTitle("---\nstatus: accepted\n---\n# ADR-0019: Library tier & defer DBOS\n"), "Library tier & defer DBOS");
  assert.equal(extractAdrTitle("no heading here"), "");

  // THE TWIN of `extractAdrTitle` in `@storytree/library/adr-doc` — the two are kept trivially
  // identical rather than shared, so the fence-stripping behaviour is asserted on BOTH or they drift.
  // Decisions cite decisions, so a fenced block quoting another decision's heading is ordinary
  // content; the title regex is line-anchored, so without the strip a quoted heading at column 0
  // matched exactly like a real H1.
  assert.equal(
    extractAdrTitle(["```", "# ADR-0050: Some other decision", "```", "", "# ADR-0019: The real one"].join("\n")),
    "The real one",
  );
  assert.equal(extractAdrTitle(["```", "# ADR-0050: Some other decision", "```"].join("\n")), "");
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
// THE HISTORY MATTERS HERE, because this fixture is now testing the OPPOSITE of what it was built
// to test, over the same rows. The curated ★ tag alone once made `--load-bearing` CONFIDENTLY
// INCOMPLETE: an accepted ADR that amended a load-bearing one overtook part of it, yet was absent
// from the exact surface CLAUDE.md sends every session to calibrate on — and absence is
// undetectable from that surface. So reach was DERIVED from the `amends` edge (ADR-0037).
//
// ADR-0431 retires that edge, and ADR-0431 D4 restores the tag as the ONLY input — having first
// frozen the derived reach INTO the tag on the live corpus, so the change could not move the real
// set (221 before, 221 after, byte-identical). The rows below therefore keep their legacy `amends`
// edges deliberately: they are the detector for a closure quietly restored over EITHER edge type.
const REACH: AdrListing[] = [
  listing(142, "accepted", "Branch dies on merge", { loadBearing: true }), // ★ the curated tag
  listing(271, "accepted", "Sessions end at merge", { amends: [142] }), // legacy edge, untagged → out
  listing(275, "accepted", "Sessions may continue past merge", { amends: [271] }), // transitive → out
  listing(265, "proposed", "An undecided amendment", { amends: [142] }), // undecided → out
  listing(177, "superseded", "A dead amendment", { amends: [142] }), // dead → out
  listing(500, "accepted", "Unrelated to the set", {}), // no edge → out
];

test("--load-bearing is the TAG, and a legacy amends edge no longer promotes its source", () => {
  // The exact inversion of what this fixture used to assert, and the reason both rows stay in it.
  // 0271 amends ★0142 and 0275 amends 0271; under the old closure both were ☆ in the set. With the
  // closure gone they are out, and a widening quietly restored over `amends` would put them back.
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.match(lines, /★ 0142 {2}accepted/, "the curated tag is the whole input");
  assert.doesNotMatch(lines, /^.0271 {2}accepted/m, "one hop no longer promotes");
  assert.doesNotMatch(lines, /^.0275 {2}accepted/m, "and neither does the transitive hop");
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

test("☆ is unreachable now, so every row in the view is attributable to a deliberate tag", () => {
  // The ★ / ☆ split existed because DERIVING reach GREW the set (96 curated → 137 on the 2026-08-03
  // corpus) and a view that lists too much is its own calibration failure — the marks kept that growth
  // attributable at a glance. Nothing is derived any more, so ☆ can no longer be emitted at all, and
  // that is the property worth pinning: a row in this view is there because somebody tagged it.
  const lines = renderAdrList(REACH, { loadBearing: true }).join("\n");
  assert.match(lines, /★ 0142 {2}accepted/);
  assert.doesNotMatch(lines, /☆/, "no row may be derived into the calibrate set");
});

// ---- support edges must NOT widen that reach (the-load-bearing-view-follows-amends-edges) --------
//
// ADR-0419 dec 1 makes a decision's `dependsOn` a SUPPORT edge that the DEPTH WALK traverses, and
// explicitly leaves this closure alone. The asymmetry IS the decision, so it is worth stating why:
// THE CALIBRATE SET IS THE CURATED TAG AND NOTHING ELSE (ADR-0431 D4), AND THIS IS ITS ONLY GUARD.
//
// `storytree adr list --load-bearing` is the exact surface CLAUDE.md sends every new session to
// calibrate on. It used to be the tag CLOSED over accepted `amends` edges; ADR-0431 retires that edge,
// and the derived reach was frozen into the tag BEFORE the closure was removed (221 members before,
// 221 after, byte-identical), so the removal could not move the live set.
//
// What is fenced here is the INVERSE error, and it is the one that survives. ADR-0419 D1 — restated by
// ADR-0431 D6 precisely so it does not die with its own decision — forbids a plain support edge
// promoting its target into the set. `dependsOn` says only "this decision rests on that one", which is
// true of most of the log, so closing over it would reproduce today's set almost exactly and then grow
// without bound as new support edges accumulate. A consumer of the view cannot detect that inflation
// FROM the view; it is the same undetectable-from-the-surface failure the closure was built to fix,
// with the sign flipped.
//
// So the assertion below is the WHOLE SET, not a bound: any widening reds it, whether it came through
// `dependsOn`, through a resurrected `amends`, or through some later edge nobody has thought of yet.
// The fixture deliberately hangs support edges — and a legacy `amends` edge — on rows that are NOT
// tagged, so a closure over either would be visible immediately.
//
// The fixture carries the REAL pointer form, and the store-backed test at the end of this section
// additionally drives both `doc:` spellings through `loadAdrListings` into `renderAdrList`, so a
// widening that learned to resolve only one spelling still reds.

/**
 * A {@link listing} whose meta ALSO carries `dependsOn`, in the POINTER form a stored decision
 * actually holds.
 *
 * It used to model the edge as NUMBERS, to red a closure widened to call `reach.has()` on it
 * directly — which is only expressible numerically. That is no longer the realistic mutation, and it
 * is no longer even runnable: since ADR-0431 the renderer RESOLVES these pointers to print the
 * support edges, so a numeric fixture throws inside `parseDecisionPointer` rather than asserting
 * anything. The mutation that matters now is a closure widened over `decisionDependsOn`, and pointers
 * are exactly what catches it.
 */
function withDependsOn(l: AdrListing, dependsOn: readonly number[]): AdrListing {
  const pointers = dependsOn.map((n) => `asset:adr-${String(n).padStart(4, "0")}`);
  return { ...l, meta: Object.assign({ ...l.meta }, { dependsOn: pointers }) };
}

const SUPPORT: AdrListing[] = [
  listing(142, "accepted", "Branch dies on merge", { loadBearing: true }), // ★ the curated tag
  // Rests on ★0142 and nothing else. Support only — so it stays OUT.
  withDependsOn(listing(419, "accepted", "A decision that merely rests on the tag"), [142]),
  // A LEGACY `amends` chain, untagged, with support edges on every link. Before ADR-0431 these two
  // were ☆ in the set; after it they are out, and a closure quietly restored over either edge type
  // would put them back — which is what makes them the mutation detector rather than dead weight.
  withDependsOn(listing(271, "accepted", "Sessions end at merge", { amends: [142] }), [419, 500]),
  withDependsOn(listing(275, "accepted", "Sessions may continue past merge", { amends: [271] }), [142]),
  // A tagged row that is NOT accepted: the tag is the only input, and it does not filter by status.
  listing(265, "proposed", "An undecided but tagged decision", { loadBearing: true }),
  withDependsOn(listing(177, "superseded", "A dead decision resting on the tag"), [142]),
  listing(500, "accepted", "Unrelated to the set"),
];

test("--load-bearing does NOT reach a decision that only DEPENDS ON the curated set", () => {
  const reach = loadBearingReach(SUPPORT);
  assert.equal(reach.has(419), false, "a support edge never promotes — ADR-0419 D1 via ADR-0431 D6");
  const lines = renderAdrList(SUPPORT, { loadBearing: true }).join("\n");
  assert.doesNotMatch(lines, /^.0419 {2}accepted/m, "and it must not render as a ROW in the view");
});

test("--load-bearing reach is EXACTLY the tagged set — no edge of any kind widens it", () => {
  // The whole-set assertion is the point: any widening pulls one more row in and reds this, whether
  // it came through `dependsOn`, through the retired `amends`, or through an edge added later.
  // ★0142 and ★0265 carry the tag. 0271 and 0275 carry a legacy `amends` chain INTO 0142 and are out.
  const reach = loadBearingReach(SUPPORT);
  assert.deepEqual([...reach].sort((a, b) => a - b), [142, 265]);
  const lines = renderAdrList(SUPPORT, { loadBearing: true }).join("\n");
  assert.match(lines, /★ 0142 {2}accepted/);
  assert.doesNotMatch(lines, /^.0271 {2}accepted/m, "a legacy amends edge no longer promotes its source");
  assert.doesNotMatch(lines, /^.0275 {2}accepted/m, "and neither does a transitive one");
});

test("the view still SHOWS a support edge it refuses to promote on", () => {
  // Excluded from the SET, never hidden from the READER — the distinction the closure's removal must
  // not blur. After ADR-0431 moved 517 edges onto `dependsOn`, a view that printed no support edge at
  // all would be the retirement's signature failure.
  const lines = renderAdrList(SUPPORT, {}).join("\n");
  assert.match(lines, /depends on 0142/, "0419's own support edge renders");
  assert.match(lines, /depended on by .*0419/, "and 0142 carries the back-edge");
});

test("the tag does NOT filter by status, and nothing else rescues a dead or undecided decision", () => {
  // A real behaviour change worth pinning, because it MOVED rather than vanished. The old computation
  // had two halves with different status rules: the curated tag never filtered by status, while the
  // closure propagated only through ACCEPTED edges. With the closure gone, the tag's rule is the only
  // rule — so a `proposed` row that carries the tag IS in the set, and that is now visible rather than
  // masked by a closure that would have refused to propagate through it.
  const reach = loadBearingReach(SUPPORT);
  assert.equal(reach.has(265), true, "tagged and proposed: the tag is the only input, and it does not read status");
  assert.equal(reach.has(177), false, "superseded and untagged: resting on the tag does not revive it");
  assert.equal(reach.has(500), false, "no tag and no edge of any kind");
  // …and every one of them is still SHOWN in the unfiltered view, with its status labelled on the
  // back-edge — excluded from the SET, never hidden from the READER.
  const lines = renderAdrList(SUPPORT, {}).join("\n");
  // 0177, 0275 and 0419 each name ★0142 in `dependsOn`; ascending, with the dead one labelled.
  assert.match(lines, /depended on by 0177 \(superseded\), 0275, 0419/, "0142's support back-edges, status-labelled");
  assert.match(lines, /amended by 0271/, "and its legacy amends back-edge still renders");
});

test("over the REAL reader path: a dependsOn pointer renders as an edge and promotes nothing", async () => {
  // Both guards at once, over `loadAdrListings` -> `renderAdrList` with the pointer forms a stored
  // decision actually carries — the `asset:adr-NNNN` row spelling AND both `doc:` file spellings, so
  // a reader that learned to resolve only one of them still reds this.
  //
  // The two halves pull in opposite directions and that is deliberate. After ADR-0431 moved 517 edges
  // onto `dependsOn`, a view that PRINTED no support edge would be the retirement's signature failure;
  // a view that PROMOTED on one would be ADR-0419 D1's. Only asserting both catches both.
  const store = new InMemoryStore();
  await seedDecision(store, 142, "Branch dies on merge", { loadBearing: true });
  await seedDecision(store, 271, "Sessions end at merge", { amends: [142] });
  await seedDecision(store, 500, "A second support target", {});
  // ONE SPELLING PER TARGET, and that is the whole point of the fixture rather than tidiness. Aimed
  // at the SAME target, a reader that resolved only `asset:` would still print `depends on 0142` and
  // this test would pass while two thirds of the corpus's pointers went unread — measured: that
  // mutation survived the first draft, which aimed all three at 0142.
  await seedDecision(store, 419, "A decision that merely rests on the tag", {
    dependsOn: [
      "asset:adr-0142",
      "doc:decisions/0271-sessions-end-at-merge.md",
      "doc:docs/decisions/0500-a-second-support-target.md",
    ],
  });

  const { listings } = await loadAdrListings(store);
  const calibrate = renderAdrList(listings, { loadBearing: true }).join("\n");
  assert.match(calibrate, /★ 0142 {2}accepted/, "the curated tag");
  assert.doesNotMatch(calibrate, /^.0271 {2}accepted/m, "amending the tag no longer promotes (ADR-0431 D4)");
  assert.doesNotMatch(calibrate, /^.0419 {2}accepted/m, "and resting on it never did (ADR-0419 D1)");

  const full = renderAdrList(listings, {}).join("\n");
  assert.match(full, /depends on 0142, 0271, 0500/, "all THREE live spellings resolve, each to its own target");
  assert.match(full, /depended on by 0419/, "and 0142 carries the back-edge");
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

/**
 * `store` is OPTIONAL because omitting it is a REAL invocation shape — the read-only one. Both
 * halves read the store now (ADR-0403 dec 1): `adr new` writes the decision as a row and `adr list`
 * reads rows, so the suite asserts what each does with no store wired rather than always wiring it.
 */
const depsFor = (allocator: AdrAllocatorLike | null, store?: InMemoryStore): AdrCommandDeps => {
  // ANNOTATED local, then one guarded assignment — the shape
  // `anti-slop/no-conditional-empty-object-spread` requires.
  const deps: AdrCommandDeps = {
    allocator,
    branch: "claude/test",
    actor: "tester",
    today: "2026-06-26",
  };
  if (store !== undefined) deps.roundTrip = { store, writable: true, actor: "tester" };
  return deps;
};

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

test("adr new --pg: reserves from the allocator and writes the ROW — no file, no offline warning", async () => {
  const store = new InMemoryStore();
  await seedDecision(store, 46, "A prior decision");
  const { allocator, seen } = fakeAllocator(50);
  const env = await adrCommand("new", { title: "Wake the DB" }, depsFor(allocator, store));
  assert.equal(env.ok, true);
  // `localMax` is the STORE's highest decision now, not the highest filename — same role, same
  // guarantee (the allocator reserves max+1, so a stale value costs a gap, never a collision).
  assert.deepEqual(seen[0], { localMax: 46, slug: "wake-the-db", branch: "claude/test", actor: "tester" });
  const row = (await store.getDoc("adr-0050"))?.doc as Record<string, unknown>;
  assert.equal(row["title"], "Wake the DB");
  assert.equal(row["status"], "proposed");
  assert.match(String(row["body"]), /# ADR-0050: Wake the DB/);
  assert.match(env.body, /reserved in the DB and written as adr-0050/);
});

test("adr new --decided: owner-directed scaffold is born accepted with today's decided date (ADR-0110)", async () => {
  const { allocator } = fakeAllocator(110);
  const store = new InMemoryStore();
  const env = await adrCommand(
    "new",
    { title: "Collapse the ratification ask", decided: true },
    depsFor(allocator, store), // depsFor injects today = 2026-06-26
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

test("adr new without --decided stays born-proposed (the still-thinking default, ADR-0050)", async () => {
  const store = new InMemoryStore();
  const { allocator } = fakeAllocator(111);
  const env = await adrCommand("new", { title: "Still exploring" }, depsFor(allocator, store));
  assert.equal(env.ok, true);
  const row = (await store.getDoc("adr-0111"))?.doc as Record<string, unknown>;
  assert.equal(row["status"], "proposed");
  assert.equal(row["decided"], undefined);
  assert.match(env.body, /Scaffolded with proposed status/);
});

test("adr new refuses without a title", async () => {
  const env = await adrCommand("new", {}, depsFor(null));
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a title/);
});

test("adr new surfaces an allocator failure as a clear error (db down)", async () => {
  const failing: AdrAllocatorLike = {
    allocate: async () => {
      throw new Error("connection terminated");
    },
  };
  const env = await adrCommand("new", { title: "X" }, depsFor(failing));
  assert.equal(env.ok, false);
  assert.match(env.body, /couldn't reserve an ADR number/);
  assert.match(env.body, /connection terminated/);
});

test("adr next --pg reserves a number; without it there is nothing left to peek AT", async () => {
  const store = new InMemoryStore();
  await seedDecision(store, 46, "A prior decision");
  const { allocator } = fakeAllocator(47);
  const reserved = await adrCommand("next", {}, depsFor(allocator, store));
  assert.equal(reserved.ok, true);
  assert.match(reserved.body, /ADR-0047 reserved/);

  // The offline `max-on-disk + 1` peek went with the directory it read (ADR-0403 dec 1), and is
  // NOT replaced: a session that cannot write the decision must not burn a number reserving one.
  const peek = await adrCommand("next", {}, depsFor(null));
  assert.equal(peek.ok, false);
  assert.match(peek.body, /needs --pg/);
  assert.match(peek.body, /reserving a number a session cannot then write would burn it/);
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
  const store = new InMemoryStore();
  await seedDecision(store, 334, "A prior decision");
  const { allocator } = fakeAllocator(337);
  const env = await adrCommand("new", { title: "Arc reopen verb" }, depsFor(allocator, store));
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

test("adr new --pg says NOTHING when the checkout is current (fail quiet)", async () => {
  const store = new InMemoryStore();
  await seedDecision(store, 338, "A prior decision");
  const { allocator } = fakeAllocator(339);
  const env = await adrCommand("new", { title: "Next in line" }, depsFor(allocator, store));
  assert.equal(env.ok, true);
  assert.doesNotMatch(env.body, /allocated by other sessions/);
  assert.doesNotMatch((env.next ?? []).join("\n"), /library artifact adr-/);
});

test("adr next --pg carries the same heads-up (its author writes prose too)", async () => {
  const store = new InMemoryStore();
  await seedDecision(store, 334, "A prior decision");
  const { allocator } = fakeAllocator(337);
  const env = await adrCommand("next", {}, depsFor(allocator, store));
  assert.equal(env.ok, true);
  assert.match(env.body, /ADR-0337 reserved/);
  assert.match(env.body, /ADR-0335, 0336 were allocated by other sessions/);
  assert.match((env.next ?? []).join("\n"), /storytree library artifact adr-0335/);
});

test("adr list reads the decision ROWS and renders them (ADR-0403 dec 1)", async () => {
  const store = new InMemoryStore();
  await seedDecision(store, 19, "Library tier", { loadBearing: true });
  await seedDecision(store, 86, "Lifecycle", { status: "proposed" });

  const all = await adrCommand("list", {}, depsFor(null, store));
  assert.equal(all.ok, true);
  assert.match(all.body, /0019/);
  assert.match(all.body, /Library tier/);
  assert.match(all.body, /0086/);

  const lb = await adrCommand("list", { loadBearing: true }, depsFor(null, store));
  assert.match(lb.body, /0019/);
  assert.doesNotMatch(lb.body, /0086/); // proposed, not load-bearing
});

test("adr list REFUSES without a store rather than reporting an empty decision log", async () => {
  // The offline read is the named accepted cost of ADR-0403, and the refusal has to SAY so: a
  // command that answered "no decisions" when it simply had nowhere to look would report the corpus
  // as empty — a confident wrong answer about the surface every session orients on.
  const env = await adrCommand("list", {}, depsFor(null));
  assert.equal(env.ok, false);
  assert.match(env.body, /store/);
});

test("adr list says the store is EMPTY rather than pretending the log is missing", async () => {
  const env = await adrCommand("list", {}, depsFor(null, new InMemoryStore()));
  assert.equal(env.ok, false);
  assert.match(env.body, /no decisions in the store/);
  assert.match(env.body, /is the DB up/);
});

test("adr new DUAL-WRITES the row, so the scaffold is visible to `adr list`", async () => {
  // The dual-source window (`decision-log-home-arc` inc 03→05): `adr new` writes a FILE and `adr
  // list` reads ROWS, so a scaffold that wrote only the file would exist and not appear.
  const store = new InMemoryStore();
  const { allocator } = fakeAllocator(77);
  const env = await adrCommand("new", { title: "A dual written decision" }, depsFor(allocator, store));
  assert.equal(env.ok, true);
  assert.match(env.body, /reserved in the DB and written as adr-0077/);

  const row = (await store.getDoc("adr-0077"))?.doc as Record<string, unknown>;
  assert.equal(row["number"], 77);
  assert.equal(row["status"], "proposed");
  assert.equal(row["title"], "A dual written decision");

  const listed = await adrCommand("list", {}, depsFor(null, store));
  assert.match(listed.body, /0077/);
  assert.match(listed.body, /A dual written decision/);
});

test("adr help (no sub) and an unknown sub both return guidance", async () => {
  const help = await adrCommand(undefined, {}, depsFor(null));
  assert.equal(help.ok, true);
  assert.match(help.body, /storytree adr/);
  const unknown = await adrCommand("frobnicate", {}, depsFor(null));
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown adr command/);
});

test("scaffold stamps arc provenance (ADR-0183 D3) only when given", () => {
  const stamped = scaffold(183, "Arc-born decision", { supersedes: [], amends: [], dependsOn: [] }, undefined, "map-pathways-arc");
  assert.match(stamped, /^---\nstatus: proposed\narc: map-pathways-arc\n---\n/);

  // Composes with --decided: the stamp rides after the edges, inside the frontmatter block.
  const directed = scaffold(184, "Directed + arc", { supersedes: [], amends: [7], dependsOn: [] }, "2026-07-11", "map-pathways-arc");
  assert.match(directed, /status: accepted\ndecided: 2026-07-11\namends: \[7\]\narc: map-pathways-arc\n---\n/);

  // Unstamped stays exactly as before — no arc key at all.
  assert.doesNotMatch(scaffold(185, "Arc-less", { supersedes: [], amends: [], dependsOn: [] }), /arc:/);
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
  number: number,
  extraArgv: string[],
  now: Date,
): Promise<{ env: Awaited<ReturnType<typeof run>>; decided: string; body: string }> {
  const { allocator } = fakeAllocator(number);
  const store = new InMemoryStore();
  const env = await run(["adr", "new", "--title", "A decided thing", "--decided", ...extraArgv], {
    store,
    adr: allocator,
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
  const { decided, body } = await adrNewThroughRun(300, [], ACROSS_THE_DATE_LINE);
  // The typed field.
  assert.equal(decided, "2026-07-11", "the `decided` field");
  // AND the Status prose — the defect surfaced in two places, so a fix correcting one is a half-fix.
  assert.match(body, /decided\/directed by the owner in conversation on 2026-07-11/, "## Status prose");
  assert.doesNotMatch(body, /2026-07-10/, "the UTC date appears nowhere in the decision");
});

test("adr new --decided-date <YYYY-MM-DD> overrides the derived date", async () => {
  const { decided, body } = await adrNewThroughRun(
    301,
    ["--decided-date", "2026-06-01"],
    ACROSS_THE_DATE_LINE,
  );
  assert.equal(decided, "2026-06-01");
  assert.match(body, /decided\/directed by the owner in conversation on 2026-06-01/);
});

test("adr new --decided-date refuses a value that is not YYYY-MM-DD", async () => {
  const { allocator } = fakeAllocator(302);
  const env = await run(
    ["adr", "new", "--title", "Bad date", "--decided", "--decided-date", "1 June 2026"],
    { store: new InMemoryStore(), adr: allocator },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /YYYY-MM-DD/);
});

test("adr new REFUSES rather than overwriting a decision the allocator handed out twice", async () => {
  // The shape that made this reachable: the allocator's `MAX` reads the number LEDGER, while the
  // decision it is about to write lives in the ARTIFACT table, and nothing backfilled the ledger
  // for the migrated decisions. Any row minted without reserving (`library artifact new --file`
  // takes kind `adr` with a hand-chosen id) leaves the two disagreeing. Modelled here by an
  // allocator that hands back a number the store already holds.
  const store = new InMemoryStore();
  await seedDecision(store, 403, "The decision log leaves the filesystem", {
    status: "accepted",
    loadBearing: true,
    body: "# ADR-0403: The decision log leaves the filesystem\n\nThe real prose.\n",
  });
  const { allocator } = fakeAllocator(403);

  const env = await adrCommand("new", { title: "Something new" }, depsFor(allocator, store));

  assert.equal(env.ok, false, "an occupied id must refuse, not upsert");
  assert.match(env.body, /adr-0403 ALREADY EXISTS and was not overwritten/);
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(row["title"], "The decision log leaves the filesystem", "the decision survives");
  assert.equal(row["status"], "accepted");
  assert.equal(row["loadBearing"], true);
  assert.match(String(row["body"]), /The real prose\./, "the body is not the blank scaffold");
});

test("adr new REFUSES when the decision log could not be READ, rather than allocating on a false zero", async () => {
  // `loadTitledAdrMetasFromStore` reports `unreadable` precisely so a caller does not flatten an
  // outage into "the log holds nothing". Flattened, `localMax` reads 0 and the allocator is free
  // to hand back a number some existing row already occupies.
  const store = new InMemoryStore();
  await seedDecision(store, 403, "A real decision");
  store.queryDocs = () => Promise.reject(new Error("connection terminated"));
  const { allocator, seen } = fakeAllocator(1);

  const env = await adrCommand("new", { title: "Something new" }, depsFor(allocator, store));

  assert.equal(env.ok, false, "an unreadable log must refuse");
  assert.match(env.body, /the decision log could not be READ/);
  assert.equal(seen.length, 0, "and must not reserve a number before refusing");
});

test("adr new --arc is validated BEFORE the number is reserved — a typo must not burn a decision number", async () => {
  // The ordering IS the defect. `--arc` went into the scaffold's frontmatter as a bare `arc: <id>`
  // scalar and the first thing that validated it was the YAML parse inside `scaffoldRow` — by which
  // point `allocate` had already run. The old output was accurate and too late:
  //   "ADR-0404 was RESERVED but the decision was not written: Nested mappings are not allowed…"
  // Reservation is transactional and does not roll back, so that number is spent on a typo forever.
  // `--decided-date` has always been checked in `commands.ts` before dispatch, for this reason.
  const { allocator, seen } = fakeAllocator(404);
  const env = await run(
    ["adr", "new", "--title", "A thing", "--arc", "oops: not a scalar", "--pg"],
    { store: new InMemoryStore(), adr: allocator, writable: true },
  );

  assert.equal(env.ok, false);
  assert.match(env.body, /--arc must be a bare arc id/);
  assert.match(env.body, /BEFORE any ADR number was reserved/);
  // THE ASSERTION THAT MATTERS: the allocator was never asked, so no number was spent.
  assert.equal(seen.length, 0, "no number may be reserved for an invocation that cannot be written");
  assert.doesNotMatch(env.body, /RESERVED/, "and the refusal must not claim one was");
});

test("adr new --arc accepts a real arc id: the pre-flight guard is a guard, not a wall", async () => {
  const { allocator, seen } = fakeAllocator(405);
  const store = new InMemoryStore();
  const env = await run(
    ["adr", "new", "--title", "A thing", "--arc", "decision-log-readers-arc", "--pg"],
    { store, adr: allocator, writable: true },
  );

  assert.equal(env.ok, true, env.body);
  assert.equal(seen.length, 1, "a valid arc id still reserves");
  const row = (await store.getDoc("adr-0405"))?.doc as Record<string, unknown>;
  assert.equal(row["arcRef"], "asset:decision-log-readers-arc", "and the stamp lands on the row");
});

// ---- ADR-0419 D2: the authoring surface steers support to `depends_on` -----------------------

test("scaffold records plain support as depends_on pointers, alongside amends (ADR-0419 D1/D2)", () => {
  // The whole reason this flag exists: until 2026-08-23 the surface offered `--amends` and nothing
  // else for support, so an author whose decision merely RESTED on another either overstated the
  // claim or wrote no edge at all — zero of 412 decision rows carried `dependsOn` while every
  // `process`, `guardrail` and `agent` did.
  const supported = scaffold(419, "Support", { supersedes: [], amends: [], dependsOn: [403, 139] });
  // POINTERS on the row, numbers on the flag — `dependsOn` is the ordinary Library edge and may name
  // any artifact, where `amends` is a list of decision numbers on the `adr` schema alone.
  assert.match(supported, /depends_on: \["asset:adr-0403", "asset:adr-0139"\]/);
  assert.match(supported, /\*\*Depends on\*\* ADR-0403, ADR-0139/);
  assert.doesNotMatch(supported, /amends:/, "plain support never writes the amends edge");

  // Both edges on one decision are recorded APART, never summed (ADR-0403 dec 6, untouched by 0419).
  const both = scaffold(420, "Both", { supersedes: [], amends: [7], dependsOn: [403] });
  assert.match(both, /depends_on: \["asset:adr-0403"\]\namends: \[7\]/);

  // Absent by default: a decision with no support edge carries no key, which is what
  // `decisionsCarryingDependsOn` distinguishes from an authored empty one.
  assert.doesNotMatch(scaffold(421, "None", { supersedes: [], amends: [], dependsOn: [] }), /depends_on/);
});

test("scaffold's amends placeholder asks for the CLAUSE and names the depends_on alternative", () => {
  // The placeholder is the moment the author chooses the edge. The old wording ("what this
  // extends/narrows") described the body text and never asked whether the edge was warranted at all,
  // which is how `amends` became a general-purpose support edge.
  const amended = scaffold(419, "Amender", { supersedes: [], amends: [139], dependsOn: [] });
  assert.match(amended, /\*\*Amends\*\* ADR-0139 — <WHICH CLAUSE this narrows, retires or extends/);
  assert.match(amended, /use `depends_on` instead \(ADR-0419 D2\)/);
  assert.match(amended, /in-place annotation in the SAME landing \(ADR-0139 D4\)/);
});

test("amendsObligationNote fires only on an amends edge, and names both what is owed and the alternative", () => {
  // Empty is SILENT: an author who wrote no `amends` edge owes nothing, and a note that always fired
  // would be noise the next author learns to skip.
  assert.deepEqual(amendsObligationNote([]), []);

  const note = amendsObligationNote([139, 403]).join("\n");
  assert.match(note, /ADR-0139, ADR-0403/);
  // (1) the obligation, with the command for EACH target — annotation is partitioned by target.
  assert.match(note, /ANNOTATE EACH TARGET IN PLACE, in THIS landing/);
  assert.match(note, /storytree adr pull 139 --out adr-0139\.md/);
  assert.match(note, /storytree adr pull 403 --out adr-0403\.md/);
  // (2) the alternative — telling an author the edge is wrong without saying where the right one
  // lives reproduces the silence that left the support graph undercounted in the first place.
  assert.match(note, /record\s+it as `depends_on` instead/);
  // It is a NOTE, not a refusal: ADR-0419 D4's presence rung is deliberately unwired while 174
  // pre-existing edges would red it, so nothing here may read as a gate.
  assert.doesNotMatch(note, /refus|REFUS|cannot|not allowed/);
});

test("adr new --depends-on lands a VALIDATED pointer on the row, all the way through the CLI", async () => {
  // The end-to-end leg, and it is not ceremony. The scaffold emits frontmatter and the first thing
  // that VALIDATES it is `upcastAndValidate` inside `scaffoldRow` — which runs AFTER `allocate`. A
  // pointer the `adr` schema refuses therefore reports "ADR-NNNN was RESERVED but the decision was
  // not written", and reservation is transactional and does not roll back: the number is spent
  // forever. A unit test over `scaffold` alone cannot see that, because it never reaches the schema.
  // This test caught exactly that shape — a bare `adr-0403` where `DependsOnRef` wants `asset:`.
  const { allocator, seen } = fakeAllocator(419);
  const store = new InMemoryStore();
  const env = await run(
    ["adr", "new", "--title", "Rests on others", "--depends-on", "403,139", "--pg"],
    { store, adr: allocator, writable: true },
  );

  assert.equal(env.ok, true, env.body);
  assert.doesNotMatch(env.body, /RESERVED but the decision was not written/);
  assert.equal(seen.length, 1);
  const row = (await store.getDoc("adr-0419"))?.doc as Record<string, unknown>;
  assert.deepEqual(row["dependsOn"], ["asset:adr-0403", "asset:adr-0139"]);
  assert.deepEqual(row["amends"], [], "plain support never becomes an amends edge");
  // No `amends` edge was written, so the author is owed no annotation note.
  assert.doesNotMatch(env.body, /ANNOTATE EACH TARGET/);
});

test("adr new --amends prints the annotation obligation at the moment the edge is written", async () => {
  const { allocator } = fakeAllocator(420);
  const store = new InMemoryStore();
  const env = await run(
    ["adr", "new", "--title", "Narrows a clause", "--amends", "139", "--pg"],
    { store, adr: allocator, writable: true },
  );

  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /ANNOTATE EACH TARGET IN PLACE, in THIS landing/);
  assert.match(env.body, /storytree adr pull 139 --out adr-0139\.md/);
  assert.match(env.body, /record\s+it as `depends_on` instead/);
  // It steers; it does not gate. The decision was written either way.
  assert.deepEqual(((await store.getDoc("adr-0420"))?.doc as Record<string, unknown>)["amends"], [139]);
});
