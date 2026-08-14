import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_AREAS } from "./cli-areas.js";
import { regionOf } from "./claude-region.js";
import {
  extractCliInvocations,
  findVerbOrderingViolations,
  type GuidanceProjection,
} from "./guidance-verb-ordering.js";

const AGENT = "session-orchestrator";

/**
 * The repo root, DERIVED and never taken from `STORYTREE_REPO_ROOT`. This suite asserts about THIS
 * repository's own committed projections, so an env override pointing the renderer at another
 * project's checkout must not silently redirect the assertion to files it knows nothing about.
 */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

// ---------------------------------------------------------------------------
// The pure rule
// ---------------------------------------------------------------------------

test("an invocation inside a code span is extracted, with its occurrence count", () => {
  const found = extractCliInvocations(
    "Declare presence (`storytree noticeboard declare --pg`) and later `pnpm storytree noticeboard done --pg`.",
  );
  assert.deepEqual([...found], [["noticeboard", 2]]);
});

test("the PROJECT NAME in prose is not an invocation (the measured false positive)", () => {
  // `corpus-investigator`'s real text. A bare `storytree <word>` scan reports `storytree corpus`
  // here; there is no such area, and there is no such command — it is a noun in a sentence.
  const prose = "checks one question about current storytree corpus state against the live sources";
  assert.equal(extractCliInvocations(prose).size, 0);
});

test("an invocation is read only inside backticks, never from surrounding prose", () => {
  assert.equal(extractCliInvocations("run storytree wibble now").size, 0);
  assert.deepEqual([...extractCliInvocations("run `storytree arc show <id> --pg` now")], [["arc", 1]]);
});

test("a hyphenated area is read whole, and a look-alike prefix does not match", () => {
  assert.deepEqual([...extractCliInvocations("`storytree session-cost`")], [["session-cost", 1]]);
  assert.equal(extractCliInvocations("`my-storytree arc show`").size, 0);
});

test("only the AREA is read — sub-verbs are deliberately not adjudicated (ADR-0154 granularity)", () => {
  assert.deepEqual(
    [...extractCliInvocations("`storytree library artifact new --file doc.json --pg`")],
    [["library", 1]],
  );
});

test("RED: a projection instructing a verb the checkout does not carry is a violation", () => {
  const projections: GuidanceProjection[] = [
    { path: "CLAUDE.md", text: "run `storytree own` before this session may call itself inert" },
  ];
  const found = findVerbOrderingViolations(projections, new Set(["library", "arc"]));
  assert.equal(found.length, 1);
  assert.equal(found[0]?.area, "own");
  assert.equal(found[0]?.occurrences, 1);
  assert.match(found[0]?.detail ?? "", /landed ahead of the code it names/);
});

test("GREEN: the SAME projection passes once the area exists — the ordering repairs itself", () => {
  const projections: GuidanceProjection[] = [
    { path: "CLAUDE.md", text: "run `storytree own` before this session may call itself inert" },
  ];
  assert.deepEqual(findVerbOrderingViolations(projections, new Set(["own"])), []);
});

test("one finding per (projection, area) — both halves of a digest pair are reported", () => {
  const text = "`storytree own` and `storytree own --help`";
  const found = findVerbOrderingViolations(
    [
      { path: "AGENTS.md", text },
      { path: "CLAUDE.md", text },
    ],
    new Set(["library"]),
  );
  assert.deepEqual(
    found.map((v) => `${v.path}:${v.area}:${v.occurrences}`),
    ["AGENTS.md:own:2", "CLAUDE.md:own:2"],
  );
});

test("FAIL-CLOSED: an aperture that observes nothing THROWS rather than reporting clean", () => {
  // The subtractive shape this arc exists to fence: no invocations extracted yields no violations,
  // which is byte-identical to what a healthy corpus yields. Silence must not read as health.
  assert.throws(
    () => findVerbOrderingViolations([{ path: "CLAUDE.md", text: "no invocations here at all" }]),
    /observed nothing/,
  );
});

// ---------------------------------------------------------------------------
// The real corpus — the binding assertion
// ---------------------------------------------------------------------------

/**
 * Every GENERATED guidance projection this checkout commits: the two `build:guidance` outputs
 * (CLAUDE.md's agent region, AGENTS.md) and the `build:agents` harness projections for both
 * harnesses. All four kinds are regenerated from the same shared live store, so all four carry the
 * same ordering race.
 */
function committedProjections(): GuidanceProjection[] {
  const projections: GuidanceProjection[] = [];

  const region = regionOf(readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8"), AGENT);
  // Fail closed on the MARKERS, independently of the aperture: a region that cannot be located is a
  // blind enumeration, and comparing an empty string would pass while checking nothing.
  assert.notEqual(region, null, "CLAUDE.md agent markers must be locatable, or nothing was compared");
  projections.push({ path: "CLAUDE.md", text: region ?? "" });
  projections.push({
    path: "AGENTS.md",
    text: readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8"),
  });

  for (const dir of [".claude/agents", ".codex/agents"]) {
    const entries = readdirSync(path.join(repoRoot, dir));
    // The second blindness guard, and it is a DIFFERENT failure from the aperture's: a directory
    // that enumerated no file contributes no text, and the total-invocation floor could still be
    // met by CLAUDE.md alone — so an empty harness directory would go unnoticed there.
    assert.ok(entries.length > 0, `${dir} enumerated no projection — the file sweep is blind`);
    for (const file of entries) {
      projections.push({
        path: `${dir}/${file}`,
        text: readFileSync(path.join(repoRoot, dir, file), "utf8"),
      });
    }
  }
  return projections;
}

test("every verb the committed guidance projections instruct is carried by this checkout's CLI", () => {
  const violations = findVerbOrderingViolations(committedProjections(), new Set<string>(CLI_AREAS));
  assert.deepEqual(
    violations.map((v) => v.detail),
    [],
    "a generated projection instructs a `storytree` area this checkout does not carry — either the " +
      "verb has not merged yet (do not land the projection ahead of it), or the projection is stale",
  );
});

test("the real-corpus sweep actually observed a substantial invocation corpus", () => {
  // The measurement this rule was tuned on: 22 projections, 460 invocations, 13 distinct areas, zero
  // unresolved. Asserted as a FLOOR rather than an equality — the corpus grows, and pinning an exact
  // count would make every honest guidance edit red this test. What it fences is the aperture
  // quietly collapsing to a handful of matches while still reporting a clean sweep.
  const projections = committedProjections();
  assert.ok(projections.length >= 12, `expected the generated projection set, saw ${projections.length}`);
  const total = projections.reduce(
    (sum, p) => sum + [...extractCliInvocations(p.text).values()].reduce((a, b) => a + b, 0),
    0,
  );
  assert.ok(total >= 100, `expected a substantial invocation corpus, observed ${total}`);
});
