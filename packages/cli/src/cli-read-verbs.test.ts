import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import { AREAS_WITHOUT_CORPUS_READS, CLI_READ_VERBS } from "@storytree/context-traversal-capture";
import { InMemoryStore } from "@storytree/storage-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";

import { CLI_AREAS } from "./cli-areas.js";
import { run } from "./commands.js";

/**
 * `CLI_READ_VERBS` ↔ the dispatch — the binding that keeps the traversal allowlist from going stale
 * as the CLI grows (ADR-0484 D3).
 *
 * WHY THIS FILE EXISTS, and it is a measured failure rather than a hypothetical one. The observer's
 * allowlist recognised exactly five argv shapes from ADR-0241 until 2026-08-30, while the CLI grew
 * past forty areas around it. Two of the verbs it could not see were `library search` and
 * `library related` — the two ADR-0464 D5 nominated as the discovery route at the moment it deleted
 * the offer surface. So we retired push-discovery, declared search the pull replacement, and had no
 * instrument that could tell whether discovery then got better or worse. ADR-0484's own deliverable
 * names the remedy: *"prefer the derivation; a checklist decays the same way the allowlist did."*
 *
 * WHAT IS DERIVED. Not the classification — whether a verb is a READ is a judgement, and no scanner
 * can make it. What is derived is TOTALITY: every verb the dispatch accepts in a read-bearing area
 * must appear in the table, classified one way or the other, and every `CLI_AREA` must be either
 * read-bearing or named in `AREAS_WITHOUT_CORPUS_READS`. A new verb lands unclassified and this reds;
 * a new AREA lands in neither set and this reds. The judgement stays with the author; forgetting to
 * make it does not stay silent.
 *
 * TWO INSTRUMENTS, for the reason `cli-areas.test.ts` gives beside this one — they fail differently:
 *
 *   (1) SOURCE — scan the dispatch's own `sub === "…"` / `third === "…"` literals and demand exact
 *       set equality with the table. Reads the same construct a human edits.
 *   (2) BEHAVIOUR — drive every SEARCH-classified verb through `run` and assert the envelope carries
 *       `observedResultIds`. A source scan structurally cannot see this: the table can classify a
 *       verb as a search while nobody plumbs its results, and the event would then record
 *       `resultNodeIds: []` — indistinguishable from a search that genuinely matched nothing, which
 *       is the absence-vs-zero fault this repo refuses everywhere else.
 *
 * SUBTRACTIVE SAFETY. Every probe answers "I could not look" by THROWING or by failing an
 * anti-vacuity floor, never by finding nothing: an anchor missing, a region that yields no verbs, an
 * emptied table. Each of those would make the CLI look more observed than it is, which is the exact
 * failure this file exists to prevent — so a change that trips one is "the instrument broke", not
 * "the invariant is fine".
 */

const cliSrc = fileURLToPath(new URL(".", import.meta.url));

/**
 * `packages/`, resolved back out of a mutation-testing sandbox when it is running inside one.
 *
 * WHY, AND IT IS NOT A CONVENIENCE. `check:mutation-diff` copies the repo into
 * `<root>/.stryker-tmp/sandbox-XXXX/` and RE-PRINTS every mutated file through babel — different
 * formatting, and each mutated literal wrapped in a `stryMutAct_…` ternary. A scan of that copy is
 * reading generated text, not the dispatch a human edits, so it finds fewer verbs than exist and
 * reds for a reason that has nothing to do with the code. Measured on this very file, 2026-08-30.
 *
 * Reading the ORIGINAL is also the CORRECT mutation semantics: the subject of this scan is the
 * authored dispatch, and holding a MUTATED `CLI_READ_VERBS` against the pristine dispatch is exactly
 * the comparison a surviving mutant should fail.
 */
function packagesDir(): string {
  const marker = `${path.sep}.stryker-tmp${path.sep}`;
  const index = cliSrc.indexOf(marker);
  const base = index === -1 ? cliSrc : path.join(cliSrc.slice(0, index), "packages", "cli", "src");
  return path.resolve(base, "..", "..");
}

/** The dispatch's own destructure of the parsed positionals — the anchor the area scan slices from. */
const DISPATCH_ANCHOR = "const [area, sub, third, fourth] = positionals;";

function readSource(relative: string): string {
  const source = readFileSync(path.join(packagesDir(), relative), "utf8");
  // Subtractive: an unreadable or truncated file must not read as "no verbs here".
  assert.ok(source.length > 2000, `${relative} looks truncated (${source.length} bytes)`);
  // And a REWRITTEN one must not either. If this ever fires, the escape above stopped working and
  // the scan is about to read generated text — which fails toward "fewer verbs than exist", i.e.
  // toward looking classified.
  assert.equal(
    source.includes("stryMutAct_"),
    false,
    `${relative} is a mutation-instrumented copy — the scan would read generated text, not the dispatch`,
  );
  return source;
}

/** The `run` dispatch, sliced from its anchor — everything above it is helpers, not the dispatch. */
function dispatchSource(): string {
  const source = readSource("cli/src/commands.ts");
  const parts = source.split(DISPATCH_ANCHOR);
  assert.equal(parts.length, 2, `expected exactly one ${DISPATCH_ANCHOR} in commands.ts`);
  const dispatch = parts[1];
  assert.ok(dispatch !== undefined && dispatch.length > 20000, "the dispatch slice looks empty");
  return dispatch ?? "";
}

/**
 * The source of ONE `area === "<area>"` arm: from its own `if` line to the next arm's.
 *
 * `library` is the FALLTHROUGH — it is spelled `area !== "library"` and runs to the end of `run` —
 * so both spellings open an arm here, exactly as `cli-areas.test.ts` scans them.
 */
function areaArm(area: string): string {
  const dispatch = dispatchSource();
  const lines = dispatch.split("\n");
  const opens = /^ {2}if \(area (?:===|!==) "([a-z-]+)"\)/;
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    const match = opens.exec(line);
    if (match !== null) {
      if (collecting) break;
      if (match[1] === area) collecting = true;
      continue;
    }
    if (collecting) collected.push(line);
  }
  const arm = collected.join("\n");
  assert.ok(arm.length > 40, `no dispatch arm found for area "${area}"`);
  return arm;
}

/** The body of one exported `<name>Command` delegate, to the first column-0 `}` that closes it. */
function commandFunction(relative: string, name: string): string {
  const source = readSource(relative);
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `no ${name} in ${relative}`);
  const rest = source.slice(start);
  const end = rest.indexOf("\n}\n");
  assert.notEqual(end, -1, `${name} in ${relative} has no column-0 close`);
  const body = rest.slice(0, end);
  assert.ok(body.length > 100, `${name} in ${relative} looks empty`);
  return body;
}

/** Every literal the given source compares the given positional against. */
function verbLiterals(source: string, token: "sub" | "third"): Set<string> {
  const found = new Set<string>();
  const pattern = new RegExp(`\\b${token} (?:===|!==) "([a-zA-Z0-9_-]+)"`, "g");
  for (const match of source.matchAll(pattern)) {
    const literal = match[1];
    // `help` is every delegate's own `sub === "help"` alias for the bare shape. It reads nothing and
    // is not a verb the table classifies.
    if (literal !== undefined && literal !== "help") found.add(literal);
  }
  return found;
}

/**
 * Where each read-bearing area's verbs are spelled. Several areas delegate past `commands.ts`, and a
 * scan that read only the dispatch file would find `arc` and `adr` half-empty — which would pass by
 * looking at less, the failure mode every floor here exists to refuse.
 */
const VERB_SOURCES = {
  library: () => verbLiterals(areaArm("library"), "sub"),
  tree: () => verbLiterals(areaArm("tree"), "sub"),
  // `agents <name>` takes no verbs at all — the second token IS the agent id. An empty set is the
  // right answer here, and the floor below exempts it BY NAME rather than by accident.
  agents: () => verbLiterals(areaArm("agents"), "sub"),
  arc: () =>
    new Set([
      ...verbLiterals(areaArm("arc"), "sub"),
      ...verbLiterals(commandFunction("arc/src/arc.ts", "arcCommand"), "sub"),
    ]),
  adr: () => verbLiterals(commandFunction("cli/src/adr.ts", "adrCommand"), "sub"),
  question: () => verbLiterals(commandFunction("arc/src/question.ts", "questionCommand"), "sub"),
  increment: () => verbLiterals(commandFunction("arc/src/increment.ts", "incrementCommand"), "sub"),
  friction: () => verbLiterals(areaArm("friction"), "sub"),
  // `satisfies`, not an annotation: the annotation would discard the literal key set, which is what
  // the totality comparison below iterates (anti-slop `no-known-value-widening`).
} satisfies Record<string, () => Set<string>>;

/** Areas whose verb set is legitimately empty, named so an empty scan cannot pass by accident. */
const AREAS_WITH_NO_VERBS = new Set(["agents"]);

/** The first segment of every table key — the areas the table claims to classify. */
function tableAreas(): Set<string> {
  return new Set(Object.keys(CLI_READ_VERBS).map((key) => key.split(" ")[0] ?? ""));
}

/** The verbs the table names at `depth` for `prefix`, with the `*` wildcard slot excluded. */
function tableVerbs(prefix: string, depth: number): Set<string> {
  const segments = prefix === "" ? 0 : prefix.split(" ").length;
  const found = new Set<string>();
  for (const key of Object.keys(CLI_READ_VERBS)) {
    const parts = key.split(" ");
    if (parts.length <= segments) continue;
    if (prefix !== "" && parts.slice(0, segments).join(" ") !== prefix) continue;
    const verb = parts[segments];
    if (verb === undefined || verb === "*") continue;
    if (parts.length !== depth && parts[depth] !== "*") continue;
    found.add(verb);
  }
  return found;
}

test("every CLI area is classified — read-bearing, or named as carrying no corpus reads", () => {
  const declared = tableAreas();
  const readFree = new Set(Object.keys(AREAS_WITHOUT_CORPUS_READS));
  assert.ok(CLI_AREAS.length > 30, `CLI_AREAS looks emptied (${CLI_AREAS.length})`);

  for (const area of CLI_AREAS) {
    const inTable = declared.has(area);
    const inReadFree = readFree.has(area);
    assert.ok(
      inTable !== inReadFree,
      inTable
        ? `"${area}" is both read-bearing and declared read-free — pick one`
        : `"${area}" is classified nowhere. Add its read verbs to CLI_READ_VERBS, or name it in ` +
          `AREAS_WITHOUT_CORPUS_READS with the reason. Silence here is how the five-shape allowlist happened.`,
    );
  }

  // The other direction: nothing may be classified that the dispatch does not accept, or the table
  // vouches for a verb an operator cannot run — `cli-areas.ts`' own stale-`proposal` fault.
  const areas = new Set<string>(CLI_AREAS);
  for (const area of [...declared, ...readFree]) {
    assert.ok(areas.has(area), `"${area}" is classified but is not a CLI area`);
  }
});

test("every verb the dispatch accepts in a read-bearing area is classified in CLI_READ_VERBS", () => {
  for (const [area, scan] of Object.entries(VERB_SOURCES)) {
    const dispatched = scan();
    if (!AREAS_WITH_NO_VERBS.has(area)) {
      // Subtractive: a scanner whose regex stopped matching would silently agree with everything.
      assert.ok(dispatched.size > 0, `scanned no verbs for "${area}" — the scanner broke, not the CLI`);
    }
    const classified = tableVerbs(area, 2);
    assert.deepEqual(
      [...dispatched].sort(),
      [...classified].sort(),
      `"${area}"'s dispatch verbs and CLI_READ_VERBS disagree. Every verb is classified in the same ` +
        `landing it lands in (ADR-0484 D3) — as a read, or as silent with the reason.`,
    );
  }
});

test("`library artifact`'s own sub-verbs are classified too — the level a flat area scan cannot see", () => {
  const artifactArm = areaArm("library").split('if (sub === "artifact") {')[1] ?? "";
  assert.ok(artifactArm.length > 400, "could not slice the library artifact arm");
  const dispatched = verbLiterals(artifactArm, "third");
  assert.ok(dispatched.size >= 5, `scanned only ${dispatched.size} artifact verbs — the scanner broke`);
  assert.deepEqual(
    [...dispatched].sort(),
    [...tableVerbs("library artifact", 3)].sort(),
    "library artifact's sub-verbs and CLI_READ_VERBS disagree. An unclassified one falls through to " +
      "`library artifact *` and is recorded as a READ of an artifact named after the verb.",
  );
});

test("the scanner can still say NO — a verb the table does not name is caught", () => {
  // The comparison above is only worth its runtime if it can fail. Proving that with a fabricated
  // verb keeps the floor honest without waiting for a real one to drift in.
  const dispatched = new Set([...VERB_SOURCES.friction(), "invent"]);
  assert.notDeepEqual([...dispatched].sort(), [...tableVerbs("friction", 2)].sort());
});

/**
 * The search verbs, and the argv that proves each one plumbs its results.
 *
 * Held to EXACT set equality with the table below, so a newly-classified search verb without a probe
 * reds here rather than shipping a search whose `resultNodeIds` is permanently empty.
 */
const SEARCH_PROBES = {
  "library artifact list": ["library", "artifact", "list", "adr"],
  "library search *": ["library", "search", "arc"],
  "library related *": ["library", "related", "adr-0002"],
  "library query": ["library", "query", "--kind", "adr"],
  "adr list": ["adr", "list"],
  "arc list": ["arc", "list"],
  "friction list": ["friction", "list"],
} satisfies Record<string, readonly string[]>;

test("every SEARCH-classified verb has a probe, and every probe carries its result ids out", async () => {
  const searchKeys = Object.entries(CLI_READ_VERBS)
    .filter(([, spec]) => spec.observes === "search")
    .map(([key]) => key)
    .sort();
  assert.ok(searchKeys.length >= 5, `expected the search verbs, got ${searchKeys.length}`);
  assert.deepEqual(
    searchKeys,
    Object.keys(SEARCH_PROBES).sort(),
    "a search verb without a probe would ship an event whose recorded results are permanently empty — " +
      "unreadable as either 'found nothing' or 'never plumbed'.",
  );

  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  for (const [key, argv] of Object.entries(SEARCH_PROBES)) {
    const env = await run([...argv], { store });
    assert.equal(env.ok, true, `${key}: ${env.body.slice(0, 200)}`);
    assert.notEqual(
      env.observedResultIds,
      undefined,
      `${key} is classified as a search but its envelope carries no observedResultIds. The capture ` +
        `would record resultNodeIds: [] for every one of its invocations.`,
    );
  }
});

test("a search that found things records THEM — not a shape that would look the same when empty", async () => {
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  const env = await run(["library", "artifact", "list", "adr"], { store });
  assert.equal(env.ok, true);
  const ids = env.observedResultIds ?? [];
  assert.ok(ids.length > 0, "the fixture holds adr rows, so this listing must record some");
  // Ids only, never titles or prose (ADR-0235 clause 6).
  for (const id of ids) {
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/, `${id} does not look like a canonical artifact id`);
  }
});
