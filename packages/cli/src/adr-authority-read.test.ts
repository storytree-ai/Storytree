/**
 * THE READ SIDE of ADR-0519's authority stamp: `adr list --basis` and the record's banner.
 *
 * A stamp nothing surfaces answers no question a session can ask, so these are the arms that make
 * the field load-bearing rather than merely stored.
 *
 * ## Why the projection arm goes through the STORE loader
 *
 * The stamp is a ROW field that `AdrMeta` deliberately cannot see (ADR-0519 D2), so it reaches a
 * view only through `loadTitledAdrMetasFromStore`. A test over `selectAdrListings` alone would pass
 * on a hand-built fixture while the real listing carried no `authority` at all — the exact
 * fully-unit-tested-and-completely-inert state ADR-0419 D1's traversal sat in for months. So one arm
 * drives a real row through the loader and out to the filter.
 *
 * ## And why the THREE STATES are asserted apart
 *
 * 289 of the 291 owner-basis stamps are phrase-matched backfills carrying no captured words. A
 * render that spoke about them in the same voice as a directive the owner actually gave would
 * promote every one of them into a class none of them earned — which is the whole reason
 * `hasQuotedOwnerDirective` exists as a shared predicate rather than a truthiness test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadTitledAdrMetasFromStore } from "@storytree/drive";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { DecisionAuthority } from "@storytree/library";

import { authorityBannerFor, UNSTAMPED_FILTER } from "./adr-attest.js";
import { adrListingsOf, selectAdrListings, type AdrListing } from "./adr.js";

const QUOTED: DecisionAuthority = {
  basis: "owner-directed",
  scribedBy: "cli@claude/x",
  at: "2026-09-05",
  ownerSaid: "yes, do it — basis plus my verbatim words",
};
const TRANSCRIBED: DecisionAuthority = {
  basis: "owner-directed",
  scribedBy: "cli@claude/backfill",
  at: "2026-09-05",
  transcribedFromProse: true,
};
const FLIPPED: DecisionAuthority = { basis: "agent-flipped", scribedBy: "cli@claude/x", at: "2026-09-05" };

function listing(number: number, authority?: DecisionAuthority): AdrListing {
  const l: AdrListing = {
    meta: {
      number,
      file: `adr-${String(number).padStart(4, "0")}`,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
    },
    title: `Decision ${String(number)}`,
  };
  if (authority !== undefined) l.authority = authority;
  return l;
}

const SAMPLE: AdrListing[] = [
  listing(100, QUOTED),
  listing(200, TRANSCRIBED),
  listing(300, FLIPPED),
  listing(400, { basis: "agent-derived", scribedBy: "cli@claude/x", at: "2026-09-05" }),
  listing(500),
];

const numbersOf = (ls: readonly AdrListing[]): number[] => ls.map((l) => l.meta.number);

// ─── the filter ───────────────────────────────────────────────────────────────────────────────

test("adr list --basis: selects exactly the rows declaring that basis", () => {
  assert.deepEqual(numbersOf(selectAdrListings(SAMPLE, { basis: "owner-directed" })), [100, 200]);
  assert.deepEqual(numbersOf(selectAdrListings(SAMPLE, { basis: "agent-flipped" })), [300]);
  assert.deepEqual(numbersOf(selectAdrListings(SAMPLE, { basis: "agent-derived" })), [400]);
});

test("adr list --basis unstamped: selects the ABSENCE, and never a stamped row", () => {
  assert.deepEqual(numbersOf(selectAdrListings(SAMPLE, { basis: UNSTAMPED_FILTER })), [500]);
});

test("adr list: no --basis leaves every row in view", () => {
  assert.deepEqual(numbersOf(selectAdrListings(SAMPLE, {})), [100, 200, 300, 400, 500]);
});

test("adr list --basis COMPOSES with the other filters rather than replacing them", () => {
  const mixed: AdrListing[] = [
    listing(100, QUOTED),
    { ...listing(200, QUOTED), meta: { ...listing(200).meta, status: "superseded" } },
  ];
  assert.deepEqual(numbersOf(selectAdrListings(mixed, { basis: "owner-directed", current: true })), [100]);
});

// ─── the projection: a stamp only ever reaches a view from a ROW ───────────────────────────────

test("the store loader projects the stamp, and the filter sees it end to end", async () => {
  const store = new InMemoryStore();
  const seed = async (n: number, authority?: DecisionAuthority): Promise<void> => {
    const id = `adr-${String(n).padStart(4, "0")}`;
    // The stamp is spread in rather than assigned through an open-dictionary binding, so the literal
    // keeps its inferred type (`anti-slop/no-known-value-widening`) and a typo in a key still fails.
    const stamp = authority === undefined ? {} : { authority };
    await store.upsertDoc({
      id,
      kind: "adr",
      doc: {
        kind: "adr",
        id,
        title: `Decision ${String(n)}`,
        description: `ADR-${String(n).padStart(4, "0")} — Decision ${String(n)}`,
        body: `# ADR-${String(n).padStart(4, "0")}: Decision ${String(n)}\n`,
        number: n,
        status: "accepted",
        supersedes: [],
        loadBearing: false,
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
        ...stamp,
      },
    });
  };
  await seed(100, QUOTED);
  await seed(500);

  const { adrs } = await loadTitledAdrMetasFromStore(store);
  const listings = adrListingsOf(adrs);
  assert.deepEqual(listings.find((l) => l.meta.number === 100)?.authority, QUOTED);
  assert.equal(listings.find((l) => l.meta.number === 500)?.authority, undefined);
  assert.deepEqual(numbersOf(selectAdrListings(listings, { basis: "owner-directed" })), [100]);
  assert.deepEqual(numbersOf(selectAdrListings(listings, { basis: UNSTAMPED_FILTER })), [500]);
});

test("a MALFORMED stored stamp projects as unstamped, never as a basis nothing checked", async () => {
  // Fail-closed: a `--basis` filter and a health rung both trusting an unvalidated shape would be
  // the vacuous green ADR-0427 refuses. `unstamped` must therefore catch it.
  const store = new InMemoryStore();
  const id = "adr-0600";
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title: "Broken",
      description: "ADR-0600 — Broken",
      body: "# ADR-0600: Broken\n",
      number: 600,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      // `owner-directed` with no words and no transcription marker — refused by the schema.
      authority: { basis: "owner-directed", scribedBy: "cli@x", at: "2026-09-05" },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    },
  });
  const listings = adrListingsOf((await loadTitledAdrMetasFromStore(store)).adrs);
  assert.equal(listings[0]?.authority, undefined);
  assert.deepEqual(numbersOf(selectAdrListings(listings, { basis: UNSTAMPED_FILTER })), [600]);
  assert.deepEqual(numbersOf(selectAdrListings(listings, { basis: "owner-directed" })), []);
});

test("adrListingsOf does NOT put the stamp on `meta` — the one place ADR-0519 D2 forbids", () => {
  const [only] = adrListingsOf([
    {
      number: 100,
      file: "adr-0100",
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      title: "T",
      authority: QUOTED,
    },
  ]);
  assert.deepEqual(only?.authority, QUOTED);
  assert.equal(
    Object.hasOwn(only?.meta ?? {}, "authority"),
    false,
    "a rest spread would carry it onto meta silently \u2014 it must be destructured out",
  );

  // And an UNSTAMPED listing carries no such KEY, rather than the key set to undefined. ADR-0223
  // keeps absent and present distinct, and `Object.hasOwn` is the only test that can see the
  // difference \u2014 a `=== undefined` assertion passes on both.
  const [bare] = adrListingsOf([
    { number: 100, file: "adr-0100", status: "accepted", supersedes: [], loadBearing: false, title: "T" },
  ]);
  assert.equal(Object.hasOwn(bare ?? {}, "authority"), false);
});

// ─── the record banner ────────────────────────────────────────────────────────────────────────

test("the banner shows the owner's words VERBATIM, without a second command", () => {
  const out = authorityBannerFor({ authority: QUOTED }).join("\n");
  assert.match(out, /owner-directed/);
  assert.match(out, /yes, do it — basis plus my verbatim words/);
});

test("the banner marks a TRANSCRIBED stamp as transcribed, and never as a quoted directive", () => {
  const out = authorityBannerFor({ authority: TRANSCRIBED }).join("\n");
  assert.match(out, /transcribed from the record's own prose/);
  assert.match(out, /does not verify one/);
  assert.doesNotMatch(out, /verbatim/, "a backfilled row must not borrow the language of a real quote");
});

test("the banner never announces its own absence", () => {
  // 206 rows carry no stamp; a line on each would be noise on the commonest case, and the composed
  // banner next door sets the precedent.
  assert.deepEqual(authorityBannerFor({}), []);
  assert.deepEqual(authorityBannerFor(null), []);
  assert.deepEqual(authorityBannerFor({ authority: { basis: "nonsense" } }), []);
});

test("the banner reports an agent basis plainly, with no owner language at all", () => {
  const out = authorityBannerFor({ authority: FLIPPED }).join("\n");
  assert.match(out, /agent-flipped/);
  assert.doesNotMatch(out, /owner/);
});

// ─── the banner, pinned WHOLE ─────────────────────────────────────────────────────────────────
//
// The `match` probes above assert the DISTINCTIONS that matter; these pin every remaining literal.
// A render is mostly string literals and `check:mutation-diff` charges one mutant each, so a probe
// leaves every word it did not quote unheld. Deliberately brittle: changing this wording is meant
// to fail here.

test("golden banner — a quoted owner directive", () => {
  assert.deepEqual(authorityBannerFor({ authority: QUOTED }), [
    "whose call: owner-directed (quoted owner directive) · scribed by cli@claude/x on 2026-09-05",
    "",
    "the owner's words, verbatim:",
    "  > yes, do it — basis plus my verbatim words",
    "",
  ]);
});

test("golden banner — a transcribed owner claim", () => {
  assert.deepEqual(authorityBannerFor({ authority: TRANSCRIBED }), [
    "whose call: owner-directed (transcribed from the record's own prose — no owner words were ever captured) · scribed by cli@claude/backfill on 2026-09-05",
    "  ⚠ read off this record's own `## Status` prose by a later pass, not captured from the owner.",
    "    It carries an earlier agent's claim forward; it does not verify one (ADR-0519 D5).",
    "",
  ]);
});

test("golden banner — an agent basis, which owes no provenance note at all", () => {
  assert.deepEqual(authorityBannerFor({ authority: FLIPPED }), [
    "whose call: agent-flipped (declared, no quote) · scribed by cli@claude/x on 2026-09-05",
    "",
  ]);
});

test("golden banner — a MULTI-LINE owner directive keeps every line quoted", () => {
  // The `.split("\n").map()` is what carries a directive of several sentences; a single-line
  // fixture cannot tell it from a bare push of the whole string.
  const multi = { ...QUOTED, ownerSaid: "first line\nsecond line" };
  assert.deepEqual(authorityBannerFor({ authority: multi }), [
    "whose call: owner-directed (quoted owner directive) · scribed by cli@claude/x on 2026-09-05",
    "",
    "the owner's words, verbatim:",
    "  > first line",
    "  > second line",
    "",
  ]);
});
