import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIMABLE_KINDS,
  MEASURED_PHANTOM_CLAIMS,
  boundedEditDistance,
  claimNamespaceOneLine,
  claimNamespaceRefusalBody,
  fenceStoryWorkClaim,
  normalisePastedPath,
  quoteClaimId,
  resolveClaimId,
  type ClaimUniverse,
} from "./claim-namespace.js";

/**
 * THE CLAIM NAMESPACE (ADR-0310 D2). Two halves:
 *
 *  1. The resolver's contract — resolve / refuse / stand down, and the near-miss ranking.
 *  2. THE REGRESSION CORPUS: the 26 phantom ids measured over the real 40-day ledger, each one
 *     re-run through the resolver here. This is what turns "26 ids named nothing" from a paragraph
 *     that ages out into a standing assertion — every one must still be refused, and every
 *     `likelyMeant` must still be surfaced as a suggestion, or this suite reds.
 *
 * HERMETIC AND FROZEN, on purpose. {@link FIXTURE} is a hand-written universe, never derived from
 * `stories/` or the live store: a package test that walked the real tree would couple `drive` to
 * every story rename (the coupling `session-decoupling-arc` is unwinding) and could not run in CI
 * without the corpus. It drifts by design, exactly like `@storytree/library/fixture`. What it
 * proves is that the MATCHING works; that it works over the real corpus was measured once, against
 * the live ledger, and is recorded in the increment's arc entry — 26/26 refused, 14/14 near-misses
 * surfaced, and ZERO false refusals across all 199 legitimate ids.
 */

// ---------------------------------------------------------------------------
// The frozen fixture universe
// ---------------------------------------------------------------------------

/** Every id a case below needs, and enough neighbours for the ranking to have to choose. */
const FIXTURE: ClaimUniverse = {
  targets: [
    { id: "studio", kind: "story" },
    { id: "website-experience", kind: "story" },
    { id: "website", kind: "story" },
    { id: "library", kind: "story" },
    { id: "drive-machinery", kind: "story" },
    { id: "chat-drive-bridge", kind: "story" },
    { id: "app-surface", kind: "story" },
    { id: "desktop-build-mount", kind: "story" },
    { id: "context-traversal-capture", kind: "story" },
    { id: "notice-board", kind: "story" },
    { id: "noticeboard-cli", kind: "capability" },
    { id: "semantic-growth-replay-view", kind: "capability" },
    { id: "svg-island-growth-track", kind: "capability" },
    { id: "organic-growth-app-witness", kind: "capability" },
    { id: "transcript-occupancy-extraction", kind: "capability" },
    { id: "library-permanent-lens", kind: "capability" },
    { id: "uat-detail-kind", kind: "capability" },
    { id: "packages-forward-refusal", kind: "contract" },
    { id: "first-class-edges-arc", kind: "arc" },
    { id: "noticeboard-claim-ledger-arc", kind: "arc" },
    { id: "typed-resolvable-claim-namespace", kind: "increment" },
    // Declared subtrees (ADR-0317 D3): the id is the manifest KEY, and the owner rides along. Both
    // idioms the map uses — a glob and a bare directory — because they match differently.
    { id: "packages/cli/src/gate*.ts", kind: "subtree", owner: "gate-ci-parity" },
    { id: "packages/library/src/store", kind: "subtree", owner: "library-cli" },
  ],
  nonClaimable: [
    { id: "session-orchestrator", kind: "agent" },
    { id: "edit-first-curation", kind: "principle" },
  ],
  complete: true,
  unreadSources: [],
};

/** The same universe with a source missing — the stand-down case. */
const PARTIAL: ClaimUniverse = {
  ...FIXTURE,
  complete: false,
  unreadSources: ["the live Library read failed (connection refused)"],
};

// ---------------------------------------------------------------------------
// Resolving
// ---------------------------------------------------------------------------

test("an id naming a real object of a claimable kind RESOLVES, carrying its kind", () => {
  for (const expected of FIXTURE.targets) {
    const r = resolveClaimId(expected.id, FIXTURE);
    assert.equal(r.verdict, "resolved", `${expected.id} should resolve`);
    if (r.verdict !== "resolved") return;
    assert.deepEqual(r.target, expected);
  }
});

test("every claimable kind resolves — the set is measured, not assumed", () => {
  const resolvedKinds = new Set(
    FIXTURE.targets.map((t) => {
      const r = resolveClaimId(t.id, FIXTURE);
      return r.verdict === "resolved" ? r.target.kind : "?";
    }),
  );
  assert.deepEqual([...resolvedKinds].sort(), [...CLAIMABLE_KINDS].sort());
});

test("surrounding whitespace never decides the verdict", () => {
  assert.equal(resolveClaimId("  studio  ", FIXTURE).verdict, "resolved");
});

// ---------------------------------------------------------------------------
// Standing down — the safety property
// ---------------------------------------------------------------------------

test("an INCOMPLETE universe never refuses: the verdict is `unverified`, naming what was unread", () => {
  const r = resolveClaimId("whoami", PARTIAL);
  assert.equal(r.verdict, "unverified");
  if (r.verdict !== "unverified") return;
  assert.match(r.why, /could not be read in full/);
  assert.match(r.why, /connection refused/);
  assert.match(r.why, /whoami/);
});

test("an incomplete universe still RESOLVES an id it does know — standing down is not going blind", () => {
  const r = resolveClaimId("studio", PARTIAL);
  assert.equal(r.verdict, "resolved");
});

test("an EMPTY universe that claims to be complete refuses — the shape main.ts must never build", () => {
  // Guarding the reason `claimUniverse` is supplied only by the composition root: a test double
  // with no rows would refuse everything, so `complete` must be earned by a real read.
  const empty: ClaimUniverse = { targets: [], nonClaimable: [], complete: true, unreadSources: [] };
  assert.equal(resolveClaimId("studio", empty).verdict, "unknown");
});

// ---------------------------------------------------------------------------
// Near-miss shapes
// ---------------------------------------------------------------------------

test("a PATH pasted where an id belonged is caught, and named as a path", () => {
  const r = resolveClaimId("stories/studio", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.equal(r.suggestions[0]?.id, "studio");
  assert.equal(r.suggestions[0]?.reason, "path");
});

test("normalisePastedPath handles the separator, the extension and the story.md tail", () => {
  assert.equal(normalisePastedPath("stories/studio"), "studio");
  assert.equal(normalisePastedPath("stories\\studio\\story.md"), "studio");
  assert.equal(normalisePastedPath("./stories/studio.md"), "studio");
  assert.equal(normalisePastedPath('"stories/studio/"'), "studio");
  assert.equal(normalisePastedPath("studio"), "studio", "a bare id is left alone");
});

test("an addressable-but-NOT-claimable artifact is named as what it actually is", () => {
  const r = resolveClaimId("session-orchestrator", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  const hit = r.suggestions.find((s) => s.reason === "not-claimable");
  assert.equal(hit?.id, "session-orchestrator");
  assert.equal(hit?.kind, "agent", "the refusal says WHICH kind, so the mistake is legible");
});

test("a one-character typo is caught", () => {
  const r = resolveClaimId("noticeboard-clu", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.equal(r.suggestions[0]?.id, "noticeboard-cli");
  assert.equal(r.suggestions[0]?.reason, "typo");
});

test("a package name claimed instead of the node's is caught by token relatedness", () => {
  const r = resolveClaimId("drive", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.ok(r.suggestions.some((s) => s.id === "drive-machinery"));
});

// ---------------------------------------------------------------------------
// Declared subtrees (ADR-0317 D3)
// ---------------------------------------------------------------------------

test("a subtree resolves by its manifest KEY, verbatim — globs and all", () => {
  for (const id of ["packages/cli/src/gate*.ts", "packages/library/src/store"]) {
    const r = resolveClaimId(id, FIXTURE);
    assert.equal(r.verdict, "resolved", `${id} should resolve`);
    if (r.verdict !== "resolved") return;
    assert.equal(r.target.kind, "subtree");
    assert.ok(r.target.owner !== undefined, "and it carries who the map says owns it");
  }
});

test("normalisePastedPath NEVER swallows a subtree id — the measured hazard cuts one way only", () => {
  // The pasted-PATH pass exists because `stories/studio` was claimed twice. A subtree id is also a
  // path, so the two could have collided; they cannot, because normalisation strips only a
  // `stories/` prefix and `.md`/`/story.md` tails, which no `packages/`|`apps/` key carries — and
  // the exact hit short-circuits ahead of normalisation regardless. Pinned over the LIVE manifest
  // in `source-ownership-map.test.ts`; here over the idioms.
  for (const id of ["packages/cli/src/gate*.ts", "packages/library/src/store", "apps/studio/src"]) {
    assert.equal(normalisePastedPath(id), id);
  }
});

test("a FILE under a declared subtree is refused, and told the subtree that covers it", () => {
  // Exact-key-only is a correctness rule, not fussiness: the ledger keys a claim row by the raw
  // string, so resolving each contained file would mint an id per file and let two sessions hold
  // the same code without contending — a claim that protects nothing, which is this module's whole
  // subject. The suggestion is how the canonical id gets taught at the moment of the mistake.
  const r = resolveClaimId("packages/cli/src/gate-run.ts", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.deepEqual(r.suggestions[0], {
    id: "packages/cli/src/gate*.ts",
    kind: "subtree",
    owner: "gate-ci-parity",
    reason: "owning-subtree",
  });
});

test("a DIRECTORY that is no declaration's key surfaces the declarations beneath it", () => {
  const r = resolveClaimId("packages/library/src", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.equal(r.suggestions[0]?.id, "packages/library/src/store");
  assert.equal(r.suggestions[0]?.reason, "owning-subtree");
});

test("a PATH is never a near-miss for a NAME — subtrees stay out of token relatedness", () => {
  // `tokens()` splits on `/` too, so a bare word scores 1.0 against every declaration in the
  // matching directory. Left in, `drive` would surface `packages/drive/src` and its neighbours
  // ahead of the node the session actually meant, and `packages/cli/src`'s hundred entries would
  // crowd the three slots with directory coincidences.
  const r = resolveClaimId("gate", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.deepEqual(
    r.suggestions.filter((s) => s.reason === "related" && s.kind === "subtree"),
    [],
  );
});

test("quoteClaimId quotes what the shell would eat, and leaves a plain id alone", () => {
  assert.equal(quoteClaimId("noticeboard-cli"), "noticeboard-cli");
  assert.equal(quoteClaimId("packages/library/src/store"), "packages/library/src/store");
  assert.equal(
    quoteClaimId("packages/cli/src/gate*.ts"),
    "'packages/cli/src/gate*.ts'",
    "an unquoted glob is expanded by the shell BEFORE storytree sees it",
  );
});

test("a genuinely unrelated string gets NO suggestions rather than a coincidence", () => {
  const r = resolveClaimId("whoami", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.deepEqual(r.suggestions, []);
});

test("suggestions are capped at three and deterministically ordered", () => {
  const r = resolveClaimId("library-thing-that-is-not-real", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.ok(r.suggestions.length <= 3);
  const again = resolveClaimId("library-thing-that-is-not-real", FIXTURE);
  assert.deepEqual(again.verdict === "unknown" ? again.suggestions : null, r.suggestions);
});

test("boundedEditDistance is exact below the bound and saturates above it", () => {
  assert.equal(boundedEditDistance("abc", "abc", 2), 0);
  assert.equal(boundedEditDistance("abc", "abd", 2), 1);
  assert.equal(boundedEditDistance("abc", "xyz", 2), 3, "over the bound → limit + 1");
  assert.equal(boundedEditDistance("a", "aaaaaaaa", 2), 3, "length gap short-circuits");
});

// ---------------------------------------------------------------------------
// The refusal prose
// ---------------------------------------------------------------------------

test("the refusal names the id, the near-miss, and asserts NOTHING about other claims", () => {
  const r = resolveClaimId("stories/studio", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  const body = claimNamespaceRefusalBody({
    id: "stories/studio",
    suggestions: r.suggestions,
    verb: "storytree noticeboard claim <unit-id> --grade work --pg",
  });
  assert.match(body, /"stories\/studio"/);
  assert.match(body, /studio {2}\[story\]/);
  assert.match(body, /ADR-0310 D2/);
  assert.match(body, /Nothing was written/);
  // The discipline inherited from cli-write-fidelity-arc's arm-C refusal: this verb reads no
  // ledger rows, so it may not say the session holds nothing.
  assert.doesNotMatch(body, /holds no|UNCLAIMED|you hold nothing/i);
});

test("the no-suggestion refusal says so plainly instead of trailing an empty list", () => {
  const body = claimNamespaceRefusalBody({ id: "whoami", suggestions: [], verb: "x" });
  assert.match(body, /No near match was found/);
  assert.doesNotMatch(body, /Did you mean/);
});

test("the compact one-line form carries the suggestions for a multi-node verb", () => {
  const r = resolveClaimId("stories/studio", FIXTURE);
  assert.equal(r.verdict, "unknown");
  if (r.verdict !== "unknown") return;
  assert.match(claimNamespaceOneLine(r.suggestions), /NOT CLAIMED.*did you mean studio \[story\]/);
  assert.match(claimNamespaceOneLine([]), /nothing close to it either/);
});

// ---------------------------------------------------------------------------
// THE REGRESSION CORPUS — the 26 measured phantoms
// ---------------------------------------------------------------------------

test("the declared phantom inventory is the measured one: 26 distinct ids, 86 events", () => {
  assert.equal(MEASURED_PHANTOM_CLAIMS.length, 26);
  assert.equal(
    MEASURED_PHANTOM_CLAIMS.reduce((n, p) => n + p.events, 0),
    86,
    "the event total measured 2026-08-06 — 84 when ADR-0310 was written, and the two that arrived " +
      "in between are the leak demonstrating itself",
  );
  const ids = MEASURED_PHANTOM_CLAIMS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "the inventory holds no duplicate");
  for (const p of MEASURED_PHANTOM_CLAIMS) {
    assert.ok(p.note.length > 20, `${p.id} carries an explanation, not a placeholder`);
  }
});

test("every measured phantom is REFUSED — none of the 26 may quietly become resolvable", () => {
  for (const p of MEASURED_PHANTOM_CLAIMS) {
    const r = resolveClaimId(p.id, FIXTURE);
    assert.equal(r.verdict, "unknown", `${p.id} must not resolve (${p.note})`);
  }
});

test("every phantom whose intent is known SURFACES that target — the suggester earns its keep", () => {
  // Only the entries the frozen fixture can speak to; a `likelyMeant` outside FIXTURE is skipped
  // rather than silently passing, and the assertion below keeps that skip honest.
  const covered = MEASURED_PHANTOM_CLAIMS.filter(
    (p) => p.likelyMeant !== null && FIXTURE.targets.some((t) => t.id === p.likelyMeant),
  );
  assert.ok(covered.length >= 8, `the fixture must exercise a real slice; covered ${covered.length}`);
  for (const p of covered) {
    const r = resolveClaimId(p.id, FIXTURE);
    assert.equal(r.verdict, "unknown");
    if (r.verdict !== "unknown") continue;
    assert.ok(
      r.suggestions.some((s) => s.id === p.likelyMeant),
      `${p.id} should suggest ${p.likelyMeant}, got [${r.suggestions.map((s) => s.id).join(", ")}]`,
    );
  }
});

test("the two pasted PATHS are recognised as paths, not as coincidental typos", () => {
  const paths = MEASURED_PHANTOM_CLAIMS.filter((p) => p.id.includes("/"));
  assert.equal(paths.length, 2, "exactly two of the 26 were paths");
  for (const p of paths) {
    const r = resolveClaimId(p.id, FIXTURE);
    assert.equal(r.verdict, "unknown");
    if (r.verdict !== "unknown") continue;
    assert.equal(r.suggestions[0]?.reason, "path", `${p.id} ranks its path hit first`);
  }
});

// ---------------------------------------------------------------------------
// The story-grain fence (ADR-0346 D2)
// ---------------------------------------------------------------------------

const VERB = "storytree noticeboard claim <unit-id> --grade work --pg";

test("fenceStoryWorkClaim REFUSES a story that names no driven unit", () => {
  const f = fenceStoryWorkClaim({ id: "library", kind: "story", uatWitness: null, verb: VERB });
  assert.equal(f.ok, false);
  if (f.ok) return;
  assert.match(f.body, /is a STORY, and a story is no longer a work claim/);
  assert.match(f.body, /ADR-0346 D2/);
  // The three remedies the ADR names, each reachable from the message itself.
  assert.match(f.body, /Claim the CAPABILITY you are writing/);
  assert.match(f.body, /claim the INCREMENT you are driving \(ADR-0308 D5\)/);
  assert.match(f.body, /--grade exploring` on this story is untouched/);
  // WHY, not just what: the containment hole is the reason the grain went rather than being kept
  // as a coarse fallback, and a session that does not read that reason re-invents the bypass.
  assert.match(f.body, /knows no containment/);
  assert.ok(
    f.next.some((n) => n.startsWith("storytree tree library")),
    "the remedy line points at the story's own members",
  );
});

test("fenceStoryWorkClaim ADMITS a `uat_witness: machine` story — that id names the UAT node", () => {
  // `story build` claims `story.id` in exactly this case, alongside the story's members. If the
  // fence refused it, the CLI would refuse a claim the build path takes — two rules over one id.
  assert.deepEqual(
    fenceStoryWorkClaim({ id: "driven", kind: "story", uatWitness: "machine", verb: VERB }),
    { ok: true },
  );
});

test("fenceStoryWorkClaim fails CLOSED toward the fence on any other witness value", () => {
  // ADR-0040's default is fail-closed toward the human witness, which here means fail-closed toward
  // the fence: only the literal `machine` leaves the story id naming a unit the gate drives.
  for (const witness of ["human", "Machine", "machine ", "", "operator", null]) {
    const f = fenceStoryWorkClaim({ id: "library", kind: "story", uatWitness: witness, verb: VERB });
    assert.equal(f.ok, false, `uat_witness ${JSON.stringify(witness)} must not admit a work claim`);
  }
});

test("fenceStoryWorkClaim touches no other kind, and stands DOWN on an unknown one", () => {
  for (const kind of ["capability", "contract", "arc", "increment", "subtree"] as const) {
    assert.deepEqual(
      fenceStoryWorkClaim({ id: "x", kind, uatWitness: null, verb: VERB }),
      { ok: true },
      `${kind} is unaffected by D2`,
    );
  }
  // kind === null is the namespace check standing down (an unreadable universe). It fails OPEN with
  // the check that feeds it: a false refusal blocks real work, where the leak this closes is one a
  // session can see on the board.
  assert.deepEqual(
    fenceStoryWorkClaim({ id: "library", kind: null, uatWitness: null, verb: VERB }),
    { ok: true },
    "an unread universe never refuses",
  );
});
