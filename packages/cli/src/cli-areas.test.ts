import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";

import { CLI_AREAS } from "./cli-areas.js";
import { run } from "./commands.js";

/**
 * `CLI_AREAS` ↔ the dispatch — the binding that makes `cli-areas.ts`'s header TRUE rather than
 * aspirational.
 *
 * THE PROMISE THAT WAS NOT KEPT. That header asserted the enumerated CLI surface "can never drift
 * from what the dispatch actually accepts", on the strength of the fact that two readers consume the
 * tuple. Being read is not being enforced, and it had drifted in both directions at once (measured at
 * `3735b515`, one each): `write-authority` was dispatched and unenumerated, and `proposal` was
 * enumerated after ADR-0298 deleted its arm. Neither reader could have noticed — one FORMATS the
 * tuple into an error message, the other TRUSTS it as the set of real areas, so a wrong tuple makes
 * `resolveCommandPath` vouch for a command that answers `unknown area`.
 *
 * TWO INSTRUMENTS, ON PURPOSE, because they fail differently:
 *
 *   (1) SOURCE — scan the dispatch's own branch literals and demand exact set equality. Catches
 *       both directions the moment an arm is added or deleted, and reads the same construct a human
 *       edits.
 *   (2) BEHAVIOUR — drive `run([area, "--help"])` for every member and refuse the `unknown area`
 *       envelope. Catches what a source scan structurally cannot: an arm that is present in the text
 *       but unreachable, and any future dispatch construct the scanner's regex does not model.
 *
 * SUBTRACTIVE SAFETY IS THE WHOLE DESIGN, not a flourish. Every probe here answers "I could not
 * look" by THROWING or by failing an anti-vacuity floor — never by finding nothing. A scanner whose
 * regex stops matching, a `commands.ts` that cannot be read, an emptied tuple: each of those makes
 * the repo look CLEANER than it is, which is the exact failure this file exists to prevent. So the
 * floors below (anchor found exactly once, a source-size minimum, a branch-count minimum, the
 * fallthrough pinned by name, a made-up area proving the behavioural probe can still say no) are
 * load-bearing assertions, and a change that trips one should be read as "the instrument broke",
 * not as "the invariant is fine".
 */

const cliSrc = fileURLToPath(new URL(".", import.meta.url));

/**
 * The dispatch's own destructure of the parsed positionals — the first line of `run`'s area
 * handling, and the anchor the scan slices from. Everything below it in `commands.ts` IS the
 * dispatch (`run` is the file's last declaration); everything above it is helpers, one of which
 * (`refuseMemoryStore`) takes its own parameter named `area` and compares it to `"gate"`. That
 * helper is why the scan is anchored rather than whole-file: today its literal happens to also be a
 * real area, so a whole-file scan agrees by coincidence, and a coincidence is not a rule.
 */
const DISPATCH_ANCHOR = "const [area, sub, third, fourth] = positionals;";

/** The fallthrough arm — the one branch the `area === "…"` shape cannot see. Pinned by name below. */
const FALLTHROUGH_AREA = "library";

/**
 * PURE: every area literal the dispatch text branches on — `area === "x"` plus the `area !== "x"`
 * fallthrough guard. Text is injected so this is testable against a synthetic dispatch (see the
 * non-vacuity test below), which is the only way to prove the scanner can still speak.
 *
 * THROWS if the anchor is absent or ambiguous. That is the point: a restructured dispatch must stop
 * this file rather than let it scan a slice that means nothing and report a clean bill of health.
 */
export function dispatchAreaLiterals(source: string): Set<string> {
  const first = source.indexOf(DISPATCH_ANCHOR);
  if (first === -1) {
    throw new Error(
      `the dispatch anchor ${JSON.stringify(DISPATCH_ANCHOR)} is not in the source. The dispatch was ` +
        "restructured; re-anchor this scan on its new shape. It is not safe to scan the whole file — " +
        "`refuseMemoryStore` compares its own `area` parameter to a string literal.",
    );
  }
  if (source.indexOf(DISPATCH_ANCHOR, first + 1) !== -1) {
    throw new Error(`the dispatch anchor ${JSON.stringify(DISPATCH_ANCHOR)} occurs more than once — the slice is ambiguous.`);
  }
  const body = source.slice(first);
  const out = new Set<string>();
  for (const m of body.matchAll(/\barea\s*===\s*"([^"]+)"/g)) out.add(m[1]!);
  for (const m of body.matchAll(/\barea\s*!==\s*"([^"]+)"/g)) out.add(m[1]!);
  return out;
}

/** Read `commands.ts`. Fails LOUDLY — an unreadable dispatch is never an empty one. */
function dispatchSource(): string {
  const file = path.join(cliSrc, "commands.ts");
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`could not read the dispatch at ${file}: ${(e as Error).message}`);
  }
  assert.ok(
    source.length > 50_000,
    `the dispatch source read as only ${source.length} chars, which is not the real \`commands.ts\`. ` +
      "A truncated or stubbed read would let every assertion below pass over nothing.",
  );
  return source;
}

// ---------------------------------------------------------------------------
// The scanner can speak (non-vacuity of instrument 1)
// ---------------------------------------------------------------------------

test("the scanner extracts both branch shapes from a synthetic dispatch, and refuses a missing anchor", () => {
  // A regex that silently stops matching reports ZERO drift, which is indistinguishable from a
  // healthy repo. This pins the scanner against text whose answer is known by construction.
  const synthetic = [
    'function refuseSomething(area: "alpha" | "gate") {',
    '  return area === "gate" ? 1 : 2;', // ABOVE the anchor: a helper's own `area`, must not be scanned
    "}",
    "export async function run(argv, deps) {",
    `  ${DISPATCH_ANCHOR}`,
    '  if (area === "alpha") return alphaHelp();',
    '  if (area   ===   "beta") return betaHelp();',
    '  // if (area === "ghost") — a comment is still text, and IS scanned: over-broad fails WIDE',
    '  if (area !== "omega") return unknownAreaEnvelope(area);',
    "}",
  ].join("\n");

  assert.deepEqual([...dispatchAreaLiterals(synthetic)].sort(), ["alpha", "beta", "ghost", "omega"]);
  // The helper above the anchor contributed nothing — that is the anchoring, demonstrated.
  assert.ok(!dispatchAreaLiterals(synthetic).has("gate"), "a helper's own `area` parameter is not a dispatch branch");

  // No anchor → THROW, never an empty set. An empty set would read as "no areas dispatched", and
  // every drift assertion below would pass vacuously against it.
  assert.throws(() => dispatchAreaLiterals("export function unrelated() { return 1; }"), /dispatch anchor/);
  assert.throws(() => dispatchAreaLiterals(`${DISPATCH_ANCHOR}\n${DISPATCH_ANCHOR}`), /more than once/);
});

// ---------------------------------------------------------------------------
// (1) SOURCE: the tuple and the dispatch name the same set
// ---------------------------------------------------------------------------

test("every area the dispatch branches on is enumerated in CLI_AREAS, and every enumerated area has an arm", () => {
  const branched = dispatchAreaLiterals(dispatchSource());

  // ── anti-vacuity floors ──────────────────────────────────────────────────
  assert.ok(
    branched.size >= 25,
    `the scan found only ${branched.size} dispatch branches, well under the ~33 this CLI carries. ` +
      "The scanner has stopped seeing the dispatch's shape — fix the scan before trusting a green here.",
  );
  assert.ok(CLI_AREAS.length >= 25, `CLI_AREAS holds only ${CLI_AREAS.length} entries — it has been emptied, not drained.`);
  assert.ok(
    branched.has(FALLTHROUGH_AREA),
    `the \`area !== "${FALLTHROUGH_AREA}"\` fallthrough was not found. It is the ONE arm the ` +
      "`area === \"…\"` shape cannot see, so losing it silently under-reports the dispatch by one.",
  );

  // ── the binding itself, reported as two named directions ─────────────────
  const enumerated = new Set<string>(CLI_AREAS);
  const dispatchedButUnlisted = [...branched].filter((a) => !enumerated.has(a)).sort();
  const listedButUndispatched = [...enumerated].filter((a) => !branched.has(a)).sort();

  assert.deepEqual(
    dispatchedButUnlisted,
    [],
    `the dispatch accepts ${JSON.stringify(dispatchedButUnlisted)}, which CLI_AREAS does not name. ` +
      "A working command missing from the enumeration is invisible to the `unknown area` help and to " +
      "surface-coverage's resolution. Add it to CLI_AREAS with a comment saying what it is.",
  );
  assert.deepEqual(
    listedButUndispatched,
    [],
    `CLI_AREAS names ${JSON.stringify(listedButUndispatched)}, which the dispatch does not accept. ` +
      "This is the direction that reads as healthy while being worse: the enumeration VOUCHES for " +
      "these, so `resolveCommandPath` resolves a prescribed `storytree <area> …` against a command " +
      "that answers `unknown area`. Delete the entry, or restore the arm.",
  );
});

// ---------------------------------------------------------------------------
// (2) BEHAVIOUR: the dispatch itself accepts every enumerated area
// ---------------------------------------------------------------------------

/** Does the dispatch answer this area with its unknown-area refusal? */
function isUnknownArea(body: string): boolean {
  return /^unknown area "/.test(body) || /is not an area/.test(body);
}

/**
 * `--help` is the probe for every area — it is the one shape that is universally SAFE, since help
 * never acts — except where an area's help does real work to render itself. Each override must reach
 * the area's own arm and produce something only that arm can produce; a shape that merely returns
 * quickly would prove nothing.
 *
 * Keys are asserted to be real areas below, so an override cannot outlive the area it excuses.
 */
const AREA_PROBE_OVERRIDES: ReadonlyMap<string, readonly string[]> = new Map([
  [
    // `node --help` renders the buildable-node list by walking the REAL `stories/` tree
    // (`buildableNodeIds`), which measured 533 ms warm and 67 s on a cold file cache — and CI's cache
    // is always cold. An unrecognised subcommand reaches the same arm in ~1 ms and returns its
    // `unknown node command "…"` refusal, which no other arm and no fallthrough can emit. That is a
    // STRONGER probe as well as a cheaper one: it proves the arm was entered while touching no repo
    // state at all, so this test cannot fail on a checkout whose stories tree is absent or moved.
    "node",
    ["node", "zzz-not-a-subcommand"],
  ],
]);

test("the dispatch ACCEPTS every enumerated area — asked, not inferred from the source", async () => {
  // Hermetic: the fixture corpus over an InMemoryStore, exactly as `cli.test.ts` drives `run`. No
  // credential and no DB — measured with the live store STOPPED, so this can never become a test
  // that only passes when Cloud SQL is up (ADR-0302 D3 keeps `pnpm -r test` credential-free).
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);

  const areas = new Set<string>(CLI_AREAS);
  const staleOverrides = [...AREA_PROBE_OVERRIDES.keys()].filter((a) => !areas.has(a)).sort();
  assert.deepEqual(
    staleOverrides,
    [],
    `these probe overrides name areas CLI_AREAS no longer carries: ${JSON.stringify(staleOverrides)}. ` +
      "An override outliving its area is dead weight that hides why the exception existed.",
  );

  // The CONTROL first, and it is not decoration: every assertion below is "the probe did NOT say
  // no". If the refusal's wording changed, `isUnknownArea` would stop matching and the whole loop
  // would pass while testing nothing at all.
  const control = await run(["definitely-not-an-area", "--help"], { store });
  assert.ok(
    isUnknownArea(control.body),
    "the unknown-area refusal is no longer recognised, so this test can no longer detect one. " +
      `Update \`isUnknownArea\`. Got: ${control.body.split("\n")[0]}`,
  );

  const rejected: string[] = [];
  for (const area of CLI_AREAS) {
    const argv = AREA_PROBE_OVERRIDES.get(area) ?? [area, "--help"];
    const env = await run([...argv], { store });
    if (isUnknownArea(env.body)) rejected.push(area);
  }

  assert.deepEqual(
    rejected,
    [],
    `CLI_AREAS names ${JSON.stringify(rejected)}, but the dispatch answers \`unknown area\` when asked ` +
      "for them. The enumeration is promising a command that does not exist — delete the entry, or " +
      "restore the arm.",
  );
});
