/**
 * `pnpm check:mirror-conformance` — the cross-surface conformance harness
 * (verification-integrity-arc inc 2). A sibling of `check:boundaries` / `check:manifest`: wired
 * into `pnpm gate` and CI's `verify` job as a ROOT step, deliberately OUTSIDE the ADR-0195
 * affected-only narrowing. That placement is load-bearing — drift here is introduced by editing
 * EITHER surface, and the affected filter would run only the edited one's suite. This check has to
 * see both on every PR or it only fences half the class.
 *
 * WHAT IT PROVES. Two surfaces are required to serve the same `/api/*` payloads and are forbidden
 * to share code: the desktop backend re-composes `apps/studio/server/apiRouter.ts`'s routes verbatim
 * over its own seam and may never import the studio (ADR-0176's one-wired-backend rule). The
 * duplication is the DECISION; the drift it invites is the defect. So each surface is run in its OWN
 * process by its own probe over ONE shared input, and the two decoded payloads are compared here by
 * a third party. No surface imports the other, at build time or at run time — the harness encodes
 * the boundary rather than punching through it.
 *
 * THE INPUTS, one set per `MirrorInputSet` (a row names the set its two probes run over):
 *
 *   `docs-trees` — `GET /api/docs`, compared over two things:
 *     1. a synthetic FIXTURE built here, exercising the branches a corpus may not currently contain
 *        (an unresolvable lineage edge, `load_bearing: false`, an unterminated frontmatter block, a
 *        doc with no H1, an over-long first sentence, a nested Decisions doc, a non-`.md` file);
 *     2. the repo's REAL `docs/` tree, which catches whatever the corpus actually exercises and the
 *        fixture author didn't think of. Content changes can't destabilise it — the assertion is
 *        equality between two implementations over the same input, not against a recorded value.
 *
 *   `activity-fixtures` — `GET /api/activity`, compared over two synthetic fixtures. There is no
 *     "real corpus" arm here and that is structural, not an omission: this payload's real input is
 *     `events.node_claim` in Cloud SQL, and CI is DB-free. So the fixtures carry RAW claim rows and
 *     a FIXED `now`, which each probe folds through its own surface's re-composed fold — the grade
 *     defect is inside the assertion rather than upstream of it — and they cover both the populated
 *     shape (every ADR-0200 grade branch, the back-compat absent/unknown grade, a stale row both
 *     folds must drop) and the ADVISORY-ABSENCE shape (`null` layers, zero rows), which is the arm
 *     that catches a route emitting `[]` where its mirror emits `null`.
 *
 *   `arc-fixtures` — `GET /api/arcs`, compared over two synthetic fixture DIRECTORIES. Each carries
 *     the three inputs the arc rollup joins over (a doc set, a `docs/decisions` tree, a `stories/`
 *     tree) plus the request list both probes replay. What is at risk here is the ENVELOPE rather
 *     than the payload — the join itself is shared code in @storytree/drive, which both surfaces
 *     call — so each probe prints the STATUS as well as the body, and the second arm wires NO
 *     document store: the only way to catch a mirror answering `{ arcs: [] }` where its reference
 *     answers `{ arcs: null }`, or 404-ing one id where its reference 503s.
 *
 *   `floor-health-fixtures` — `GET /api/floor-health`, compared over three synthetic fixture FILES,
 *     each carrying the two reads the floor-health composition makes (friction/increment docs and the
 *     raw event log) plus the request list both probes replay. The docs and events are served
 *     VERBATIM by each probe's store rather than recorded through one: the `Store` seam's
 *     `appendEvent` accepts no `at`, so a recording store would stamp the wall clock — which dates
 *     every route to today, reads every reinforcement as PRE-route (leaving `loudest` absent and the
 *     interesting half unexercised), and, because the two probes are separate processes at different
 *     moments, is nondeterminism ACROSS the payloads being compared. What is at risk here is the
 *     ENVELOPE, not the figure — the reading is shared `@storytree/drive` code both surfaces call —
 *     so each probe prints the STATUS as well as the body, and THREE arms are needed rather than two:
 *     `populated` (a loud floor), `quiet` (a store with nothing post-route — `loudest` absent), and
 *     `no-store` (the advisory-absence arm). The last two are the pair that matters most: they are
 *     the only way to catch a mirror answering a quiet READING where its reference answers
 *     `{ reading: null }`, and the compiled band renders "no instrument here" and "all clear"
 *     differently on purpose.
 *
 * FAIL-CLOSED, and never vacuous. A probe that dies, prints unparseable output, or returns an
 * EMPTY payload for a non-empty input is a FAILURE, not a skip: two silent surfaces agree
 * perfectly, and "a proof that cannot fail is not a proof" is the class this arc exists to fence.
 * The judge that owns the comparison rules is the pure {@link file://./mirror-conformance.ts}.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MIRRORS,
  compareMirrors,
  formatDivergences,
  projectActivityPayload,
  projectArcsPayload,
  projectFloorHealthPayload,
  type Divergence,
  type Entry,
  type MirrorInputSet,
  type Probe,
} from "./mirror-conformance.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// ---------- the fixtures ----------

/**
 * Build the synthetic docs tree both probes walk. Deliberately covers the branches the real corpus
 * may not: an ADR whose lineage edge names no ADR on disk, an explicit `load_bearing: false`, an
 * unterminated frontmatter block, a doc with no H1, a first sentence past the excerpt cap, a
 * Decisions doc in a nested dir, a Reference doc in a nested dir, and a non-`.md` file that must
 * be skipped by both walks.
 */
function buildDocsFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "storytree-mirror-"));
  mkdirSync(join(dir, "decisions", "nested"), { recursive: true });
  mkdirSync(join(dir, "notes", "deep"), { recursive: true });

  const write = (rel: string, body: string): void => writeFileSync(join(dir, rel), body, "utf8");

  write(
    "decisions/0001-load-bearing-with-edges.md",
    "---\nstatus: accepted\ndecided: 2026-01-02\nload_bearing: true\nsupersedes: [2]\namends: [3]\n---\n" +
      "# ADR-0001: Load bearing with edges\n\nA decision that stands and reaches back.\n",
  );
  write(
    "decisions/0002-explicitly-not-load-bearing.md",
    "---\nstatus: superseded\nload_bearing: false\nsupersedes_in_part: [1]\n---\n" +
      "# ADR-0002: Explicitly not load bearing\n\nAn explicit false must read the same as an absent tag.\n",
  );
  write(
    "decisions/0003-edge-to-nowhere.md",
    "---\nstatus: accepted\namends: [9999]\n---\n" +
      "# ADR-0003: Edge to nowhere\n\nA lineage edge naming no ADR on disk is dropped, not rendered broken.\n",
  );
  write(
    "decisions/0004-unterminated-frontmatter.md",
    "---\nstatus: accepted\nload_bearing: true\n# ADR-0004: Unterminated\n\nThe block never closes.\n",
  );
  write("decisions/0005-no-heading.md", "---\nstatus: proposed\n---\nNo H1 at all; the filename is the title.\n");
  write(
    "decisions/0006-long-first-sentence.md",
    "---\nstatus: accepted\n---\n# ADR-0006: Long\n\n" +
      `${"A very long opening clause that keeps going and going ".repeat(8)}and finally stops.\n`,
  );
  write(
    "decisions/nested/0007-nested-decision.md",
    "---\nstatus: accepted\nload_bearing: true\n---\n# ADR-0007: Nested\n\nA Decisions doc below a subdirectory.\n",
  );
  write("open-questions.md", "# Open questions\n\nA reference doc with no frontmatter at all.\n");
  write("notes/deep/handbook.md", "# Handbook\n\nA nested reference doc; groups as Reference, not Decisions.\n");
  write("decisions/not-markdown.txt", "Both walks must skip a non-.md file.\n");
  return dir;
}

/**
 * Build the two synthetic `/api/activity` fixtures both probes fold. Each carries RAW
 * `events.node_claim` rows plus a FIXED `now` (so the 2 h stale-reclaim window is decided by data,
 * never by wall-clock), and the two already-folded pass-through layers.
 *
 * The row set covers every branch the two re-composed folds have to agree on: each ADR-0200 grade,
 * the back-compat normalisations (grade ABSENT and grade NULL are both the work claim — the exact
 * shape a re-composed SELECT that dropped the column produces), an UNRECOGNISED grade that must
 * normalise rather than pass through, a row past the stale window that BOTH folds must drop, and
 * several sessions on one unit (the composite PK the graded ledger allows).
 */
function buildActivityFixtures() {
  const dir = mkdtempSync(join(tmpdir(), "storytree-activity-"));
  const at = (hhmm: string): string => `2026-07-29T${hhmm}:00.000Z`;
  const fixtures: { label: string; file: string; body: unknown }[] = [
    {
      label: "populated",
      file: "activity-populated.json",
      body: {
        now: at("12:00"),
        claimRows: [
          { unit_id: "cli", session_id: "s-work", branch: "claude/a", intent: "orchestrate",
            grade: "work", claimed_at: at("11:00"), heartbeat_at: at("11:59") },
          { unit_id: "cli", session_id: "s-explore", branch: "claude/b", intent: "reading",
            grade: "exploring", claimed_at: at("11:10"), heartbeat_at: at("11:58") },
          { unit_id: "cli", session_id: "s-wait", branch: "claude/c", intent: "queued",
            grade: "waiting", claimed_at: at("11:20"), heartbeat_at: at("11:57") },
          // Grade ABSENT — the pre-grade row, and the shape a SELECT that lost the column yields.
          { unit_id: "studio", session_id: "s-legacy", branch: "claude/d", intent: "pre-grade",
            claimed_at: at("11:30"), heartbeat_at: at("11:56") },
          // Grade NULL — the same fact as the DB spells it.
          { unit_id: "studio", session_id: "s-null", branch: "claude/e", intent: "null grade",
            grade: null, claimed_at: at("11:35"), heartbeat_at: at("11:55") },
          // Unrecognised — must normalise to `work`, never reach the wire verbatim.
          { unit_id: "studio", session_id: "s-bogus", branch: "claude/f", intent: "bad grade",
            grade: "sideways", claimed_at: at("11:40"), heartbeat_at: at("11:54") },
          // STALE: heartbeat 6.5 h back, past the 2 h reclaim window — both folds must DROP it.
          { unit_id: "library", session_id: "s-stale", branch: "claude/g", intent: "crashed",
            grade: "work", claimed_at: at("05:00"), heartbeat_at: at("05:30") },
        ],
        builds: [
          { unitId: "cli", tier: "story", runId: "run-1", at: at("11:58"), phase: "IMPLEMENT" },
        ],
        departures: [
          { unitId: "notice-board", sessionId: "s-gone", branch: "claude/h", at: at("11:50") },
        ],
      },
    },
    {
      // The ADVISORY-ABSENCE arm: both surfaces promise `null` (never a 503, never `[]`) when a
      // layer cannot be answered. Without this input, a route that swapped `null` for `[]` would
      // agree with its mirror on every populated fixture.
      label: "advisory-absence",
      file: "activity-absent.json",
      body: { now: at("12:00"), claimRows: [], builds: null, departures: null },
    },
  ];
  const inputs: { label: string; arg: string }[] = [];
  for (const f of fixtures) {
    const path = join(dir, f.file);
    writeFileSync(path, JSON.stringify(f.body), "utf8");
    inputs.push({ label: f.label, arg: path });
  }
  return { dir, inputs };
}

/**
 * Build the two synthetic `/api/arcs` fixtures both probes replay. Each is a DIRECTORY carrying the
 * three inputs the arc rollup joins over — a doc set (`arcs.json`), a `docs/decisions` tree and a
 * `stories/` tree — plus the REQUEST LIST both probes replay against it.
 *
 * WHY THE REQUESTS RIDE THE FIXTURE. Each probe could hold its own list of what to ask, and that
 * would be two hand-kept lists of the same fact — the exact drift class this harness exists to
 * fence, one level up from the payloads. A probe replays what it is handed and decides nothing.
 *
 * WHY TWO ARMS, and why the second one is not optional. `populated` proves the join reaches the
 * wire (arcs, their increments, their questions, the ADR and story stamps) and that the id decode,
 * the unknown-id answer and the method guard all agree. `no-store` is the ADVISORY-ABSENCE arm: it
 * is the ONLY thing that catches a mirror answering `{ arcs: [] }` where its reference answers
 * `{ arcs: null }`, or 404-ing a single id where its reference 503s — and that distinction is
 * precisely what the compiled arc lens renders differently ("needs the live store" vs "no arcs").
 * Without it, both surfaces would agree on every populated request and the defect would ship.
 *
 * There is deliberately no "real corpus" arm: arcs are live-canonical (ADR-0183) and CI is DB-free,
 * so the honest input is a fixture rather than a store nobody can reach.
 */
function buildArcFixtures() {
  const root = mkdtempSync(join(tmpdir(), "storytree-arcs-"));

  // The SAME requests against both arms — the point of the second arm is that identical asks give
  // different honest answers, so asking different things would defeat it.
  const requests = [
    { label: "list", method: "GET", path: "/api/arcs" },
    { label: "one", method: "GET", path: "/api/arcs/surface-arc" },
    { label: "closed", method: "GET", path: "/api/arcs/closed-arc" },
    { label: "unknown", method: "GET", path: "/api/arcs/no-such-arc" },
    // Percent-encoded: both surfaces must DECODE before the lookup, so the miss names `needs decoding`.
    { label: "encoded", method: "GET", path: "/api/arcs/needs%20decoding" },
    { label: "write", method: "POST", path: "/api/arcs/surface-arc" },
  ];

  const doc = (id: string, kind: string, body: Record<string, unknown>) => ({
    id,
    kind,
    doc: { kind, id, references: [], createdAt: "2026-07-29", updatedAt: "2026-07-30", ...body },
    createdAt: "2026-07-29",
    updatedAt: "2026-07-30",
  } satisfies Record<string, unknown>);

  const docs = [
    doc("surface-arc", "arc", {
      title: "Arcs as the primary orientation surface",
      description: "the arc surface",
      intent: "Arcs are what the owner meets on the map.",
      endState: "The owner stops asking for a re-onboarding briefing.",
    }),
    // A CLOSED arc: `loadArcRollups` returns closed arcs too (filtering is the caller's), so both
    // surfaces must carry `lifecycle: "closed"` rather than one of them dropping the row.
    doc("closed-arc", "arc", {
      title: "A finished initiative",
      description: "closed",
      intent: "done",
      endState: "done",
      lifecycle: "closed",
    }),
    // Two increments on one arc, one LANDED and one PARKED — the status-rank ordering
    // (forward-looking first) is part of the payload, so a mirror that re-sorted would go red.
    doc("surface-arc-inc-01", "increment", {
      title: "the rollup landed",
      description: "d",
      objective: "the rollup landed",
      body: "the rollup landed",
      arcRef: "asset:surface-arc",
      status: "closed",
      outcome: { date: "2026-07-30", pr: "#1010" },
    }),
    doc("surface-arc-inc-02", "increment", {
      title: "the lanes are not built yet",
      description: "d",
      objective: "build the lanes",
      body: "build the lanes",
      arcRef: "asset:surface-arc",
      status: "proposal",
      parked: "2026-07-31",
      frictionRefs: ["friction-arc-context-reconstruction"],
    }),
    // An increment on ANOTHER arc — the `arcRef` filter must exclude it from both payloads.
    doc("other-arc-inc-01", "increment", {
      title: "belongs elsewhere",
      description: "d",
      objective: "elsewhere",
      body: "elsewhere",
      arcRef: "asset:some-other-arc",
      status: "closed",
    }),
    doc("oq-blocked-meaning", "open-question", {
      title: "What exactly qualifies as blocked?",
      description: "D7 names blocked but does not define it",
      stakes: "The surface cannot render a blocked state until this is settled.",
      statement: "s",
      context: "c",
      arcRef: "asset:surface-arc",
    }),
  ];

  const populated = join(root, "populated");
  mkdirSync(join(populated, "docs", "decisions"), { recursive: true });
  mkdirSync(join(populated, "stories", "surface-story"), { recursive: true });
  mkdirSync(join(populated, "stories", "unstamped-story"), { recursive: true });
  writeFileSync(
    join(populated, "docs", "decisions", "0267-arcs-take-the-slot.md"),
    "---\nstatus: accepted\narc: surface-arc\n---\n\n# ADR-0267: Arcs take the slot\n",
    "utf8",
  );
  // An ADR with NO `arc:` stamp — both joins must leave it out.
  writeFileSync(
    join(populated, "docs", "decisions", "0268-unstamped.md"),
    "---\nstatus: accepted\n---\n\n# ADR-0268: Unstamped\n",
    "utf8",
  );
  writeFileSync(
    join(populated, "stories", "surface-story", "story.md"),
    '---\nid: "surface-story"\ntier: story\narc: surface-arc\n---\n\n# Surface story\n',
    "utf8",
  );
  writeFileSync(
    join(populated, "stories", "unstamped-story", "story.md"),
    '---\nid: "unstamped-story"\ntier: story\n---\n\n# Unstamped story\n',
    "utf8",
  );
  writeFileSync(join(populated, "arcs.json"), JSON.stringify({ docs, requests }), "utf8");

  // The advisory-absence arm: `docs: null` tells each probe to wire NO document store at all — the
  // offline/json posture. Its trees are never read, and are absent on purpose.
  const noStore = join(root, "no-store");
  mkdirSync(noStore, { recursive: true });
  writeFileSync(join(noStore, "arcs.json"), JSON.stringify({ docs: null, requests }), "utf8");

  return {
    dir: root,
    inputs: [
      { label: "arcs-populated", arg: populated },
      { label: "arcs-no-store", arg: noStore },
    ],
  };
}

/**
 * Build the three synthetic `GET /api/floor-health` fixtures both probes replay. Each is one JSON
 * FILE carrying `{ docs, events, requests }` — the two reads `loadFloorHealthReading` makes, plus the
 * request list. No directories: unlike the arc rollup, the floor-health reading joins no on-disk tree.
 *
 * WHY THE EVENTS ARE WRITTEN OUT WITH EXPLICIT `at` VALUES rather than recorded through a store. A
 * reinforcement is attributed to the route STANDING WHEN IT LANDED, read off the event log
 * (drive's `RECURRENCE_ATTRIBUTION_RULE`), and the `Store` seam's `appendEvent` accepts no `at` — so
 * a store that recorded these would stamp the wall clock, date every route to TODAY, and read every
 * reinforcement as pre-route. `loudest` would then be absent from every arm and the richest half of
 * the payload would never be compared. For a MIRROR comparison there is a second, sharper reason: the
 * two probes run in separate processes at different moments, so a wall-clock stamp is nondeterminism
 * between the very payloads being diffed. Verbatim input is what makes this comparison decidable.
 *
 * WHY THREE ARMS, and why the last two are not optional. `populated` proves the reading reaches the
 * wire with its loudest distinct cause, its window and its collapsing rule, and that the method guard
 * agrees. `quiet` holds a real store whose reinforcements are all PRE-route, so the reading arrives
 * with NO `loudest` — a quiet floor. `no-store` wires no document store at all, so the reading is
 * `null`. Those two are the ADVISORY-ABSENCE pair: they are the only thing that catches a mirror
 * answering `{ reading: <quiet reading> }` where its reference answers `{ reading: null }`, and
 * `apps/studio/src/lib/floorHealth.ts` renders those differently on purpose — a missing instrument
 * presented as "all clear" is the exact failure ADR-0316's band exists to avoid. Without them, both
 * surfaces would agree on every populated request and the defect would ship.
 *
 * There is deliberately no "real corpus" arm: friction is live-canonical and CI is DB-free, so the
 * honest input is a fixture rather than a store nobody can reach.
 */
function buildFloorHealthFixtures() {
  const dir = mkdtempSync(join(tmpdir(), "storytree-floor-health-"));

  // The SAME requests against every arm — the point of the absence arms is that identical asks give
  // different honest answers, so asking different things would defeat them.
  const requests = [
    { label: "read", method: "GET", path: "/api/floor-health" },
    // Report-only is a DECISION (ADR-0316 D4), and it is expressed as a status — so it is replayed.
    { label: "write", method: "POST", path: "/api/floor-health" },
  ];

  const friction = (
    id: string,
    body: Record<string, unknown>,
  ) => ({
    id,
    kind: "friction",
    doc: { title: id, ...body },
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  } satisfies Record<string, unknown>);

  /** One route-setting event — the timestamp IS the fixture (see the header). */
  const routeEvent = (seq: number, id: string, route: string, at: string) => ({
    seq,
    id,
    kind: "friction",
    type: "updated",
    doc: { route },
    actor: "cli",
    at,
  } satisfies Record<string, unknown>);

  const reinforcedBy = (...dates: string[]): Array<Record<string, unknown>> =>
    dates.map((date) => ({ branch: "claude/x", date, evidence: "`e`" }));

  // A LOUD floor. Two filings an author joined with one increment's `frictionRefs` (so they collapse
  // into ONE distinct cause with two members — the collapsing rule reaching the wire), a third filing
  // on a NON-tripwire route that stands alone (so `distinctCauses` > 1 and `unjoined` > 0), and a
  // discharged filing that must leave the live population entirely.
  const populatedDocs = [
    friction("a-live-guardrail-that-keeps-firing", {
      route: "guardrail",
      // 07-11 is the day the route was set: SAME-DAY, never post-route, because day-granular dates
      // cannot prove ordering. Only the three later ones count.
      reinforcedBy: reinforcedBy("2026-07-11", "2026-07-12", "2026-07-16", "2026-07-28"),
    }),
    friction("a-second-filing-one-remedy-covers", {
      route: "guardrail",
      reinforcedBy: reinforcedBy("2026-07-20"),
    }),
    friction("an-unjoined-tool-gap", {
      // `tool` is deliberately NOT a tripwire route — a parked capability gap keeps firing until the
      // capability is built — so this contributes a distinct cause with zero tripwire recurrence.
      route: "tool",
      reinforcedBy: reinforcedBy("2026-07-22"),
    }),
    friction("a-discharged-filing", {
      route: "guardrail",
      dischargedBy: "asset:some-landed-remedy",
      reinforcedBy: reinforcedBy("2026-07-25"),
    }),
    {
      id: "one-remedy-for-both",
      kind: "increment",
      doc: {
        title: "one remedy declared to cover both filings",
        arcRef: "asset:some-arc",
        status: "closed",
        frictionRefs: ["a-live-guardrail-that-keeps-firing", "a-second-filing-one-remedy-covers"],
      },
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    },
  ];
  const populatedEvents = [
    routeEvent(1, "a-live-guardrail-that-keeps-firing", "guardrail", "2026-07-11T13:54:04.888Z"),
    routeEvent(2, "a-second-filing-one-remedy-covers", "guardrail", "2026-07-14T09:00:00.000Z"),
    routeEvent(3, "an-unjoined-tool-gap", "tool", "2026-07-15T09:00:00.000Z"),
    routeEvent(4, "a-discharged-filing", "guardrail", "2026-07-16T09:00:00.000Z"),
  ];

  // A QUIET floor: a real store, a routed live filing, but every reinforcement PREDATES the route
  // event — pre-route evidence gathered at capture, never recurrence. So the reading arrives with no
  // `loudest` at all. This is what `{ reading: null }` must not be confused with.
  const quietDocs = [
    friction("a-routed-filing-that-never-recurred", {
      route: "guardrail",
      reinforcedBy: reinforcedBy("2026-07-01", "2026-07-02"),
    }),
  ];
  const quietEvents = [
    routeEvent(1, "a-routed-filing-that-never-recurred", "guardrail", "2026-07-10T09:00:00.000Z"),
  ];

  const arms: { label: string; file: string; body: unknown }[] = [
    {
      label: "floor-health-populated",
      file: "floor-health-populated.json",
      body: { docs: populatedDocs, events: populatedEvents, requests },
    },
    {
      label: "floor-health-quiet",
      file: "floor-health-quiet.json",
      body: { docs: quietDocs, events: quietEvents, requests },
    },
    {
      // `docs: null` tells each probe to wire NO document store at all — the offline/json posture.
      label: "floor-health-no-store",
      file: "floor-health-no-store.json",
      body: { docs: null, events: [], requests },
    },
  ];

  const inputs: { label: string; arg: string }[] = [];
  for (const arm of arms) {
    const path = join(dir, arm.file);
    writeFileSync(path, JSON.stringify(arm.body), "utf8");
    inputs.push({ label: arm.label, arg: path });
  }
  return { dir, inputs };
}

/**
 * Assemble every input set, and the cleanup that removes what was written to disk. Each
 * {@link MirrorInputSet} is built ONCE and shared by every row that names it, so two mirrors over
 * the same input are compared over the identical bytes.
 */
function buildInputSets() {
  const docsFixture = buildDocsFixture();
  const activity = buildActivityFixtures();
  const arcs = buildArcFixtures();
  const floorHealth = buildFloorHealthFixtures();
  return {
    sets: {
      "docs-trees": [
        { label: "fixture", arg: docsFixture },
        { label: "docs/", arg: join(repoRoot, "docs") },
      ],
      "activity-fixtures": activity.inputs,
      "arc-fixtures": arcs.inputs,
      "floor-health-fixtures": floorHealth.inputs,
    },
    cleanup: () => {
      rmSync(docsFixture, { recursive: true, force: true });
      rmSync(activity.dir, { recursive: true, force: true });
      rmSync(arcs.dir, { recursive: true, force: true });
      rmSync(floorHealth.dir, { recursive: true, force: true });
    },
  };
}

// ---------- probing ----------

/** A probe failure — reported as a conformance FAILURE, never as a skip. */
class ProbeError extends Error {}

/**
 * Decode one probe's payload for one input into comparable entries — the shape half of the
 * {@link MirrorInputSet} protocol.
 *
 * `activity-fixtures` probes print the route's response body VERBATIM and the projection happens
 * HERE, on the third party, so the two probes cannot drift in how they reshape what they measured.
 * A payload this cannot decode is a ProbeError — fail-closed, exactly like a probe that died.
 */
function decodePayload(probe: Probe, inputs: MirrorInputSet, payload: unknown, arg: string): Entry[] {
  switch (inputs) {
    case "docs-trees":
      if (!Array.isArray(payload)) throw new ProbeError(`${probe.file} returned no array for ${arg}`);
      return payload as Entry[];
    case "activity-fixtures":
      try {
        return projectActivityPayload(payload);
      } catch (err) {
        throw new ProbeError(`${probe.file} returned an unusable payload for ${arg}: ${(err as Error).message}`);
      }
    case "arc-fixtures":
      try {
        return projectArcsPayload(payload);
      } catch (err) {
        throw new ProbeError(`${probe.file} returned an unusable payload for ${arg}: ${(err as Error).message}`);
      }
    case "floor-health-fixtures":
      try {
        return projectFloorHealthPayload(payload);
      } catch (err) {
        throw new ProbeError(`${probe.file} returned an unusable payload for ${arg}: ${(err as Error).message}`);
      }
  }
}

/**
 * Run one surface's probe over every input, in that surface's own app dir so its bare
 * specifiers resolve through its own `node_modules`. Returns the decoded `{ input: Entry[] }` map.
 */
function runProbe(probe: Probe, inputs: MirrorInputSet, args: string[]) {
  const file = join(repoRoot, probe.file);
  if (!existsSync(file)) throw new ProbeError(`probe module not found: ${probe.file}`);

  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...args], {
    cwd: join(repoRoot, probe.appDir),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined) throw new ProbeError(`${probe.file} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new ProbeError(
      `${probe.file} exited ${result.status ?? "(signal " + String(result.signal) + ")"}\n${result.stderr?.trim() ?? ""}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ProbeError(`${probe.file} printed unparseable output:\n${result.stdout.slice(0, 500)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProbeError(`${probe.file} must print an object keyed by input`);
  }

  const out: Record<string, Entry[]> = {};
  for (const arg of args) {
    if (!(arg in (parsed as Record<string, unknown>))) {
      throw new ProbeError(`${probe.file} returned nothing for ${arg}`);
    }
    out[arg] = decodePayload(probe, inputs, (parsed as Record<string, unknown>)[arg], arg);
  }
  return out satisfies Record<string, Entry[]>;
}

// ---------- the check ----------

function main(): void {
  const { sets, cleanup } = buildInputSets();

  const failures: string[] = [];
  try {
    for (const target of MIRRORS) {
      const { spec } = target;
      const inputs = sets[target.inputs];
      const args = inputs.map((i) => i.arg);
      let reference: Record<string, Entry[]>;
      let mirror: Record<string, Entry[]>;
      try {
        reference = runProbe(target.reference, target.inputs, args);
        mirror = runProbe(target.mirror, target.inputs, args);
      } catch (err) {
        // Fail CLOSED: a probe that cannot run proves nothing, and reporting it as a pass would
        // make this gate exactly the kind of check that can never go red.
        failures.push(`✗ ${spec.surface}: probe failure — ${(err as Error).message}`);
        continue;
      }

      for (const { label, arg } of inputs) {
        const ref = reference[arg] ?? [];
        const mir = mirror[arg] ?? [];
        // Never vacuous: two empty payloads agree perfectly. Every input here is known non-empty,
        // so an empty reference means the probe read the wrong thing, not that the input is empty.
        // The advisory-absence activity fixture still projects its three `layer:` markers, so even
        // the all-null arm cannot pass by measuring nothing.
        if (ref.length === 0) {
          failures.push(
            `✗ ${spec.surface}: ${spec.reference} returned an EMPTY payload for ${label} (${arg}) — ` +
              "a vacuous comparison is not a pass",
          );
          continue;
        }
        const divergences: Divergence[] = compareMirrors(ref, mir, spec, label);
        if (divergences.length > 0) failures.push(formatDivergences(spec, divergences));
        else {
          console.log(
            `✓ ${spec.surface}: ${spec.mirror} matches ${spec.reference} over ${label} (${ref.length} entries)`,
          );
        }
      }
    }
  } finally {
    cleanup();
  }

  if (failures.length > 0) {
    console.error(`\n✗ cross-surface mirror conformance: ${failures.length} failing comparison(s)\n`);
    for (const f of failures) console.error(`${f}\n`);
    console.error(
      "A surface that re-composes another's route must serve the SAME payload. Re-compose the\n" +
        "missing logic verbatim into the mirror (never import the reference — ADR-0176), or, if the\n" +
        "difference is deliberate, declare it in that mirror's `referenceOnlyFields` allowlist in\n" +
        "packages/cli/src/mirror-conformance.ts.",
    );
    process.exit(1);
  }
  console.log("✓ cross-surface mirror conformance: every mirrored payload matches its reference");
}

main();
