/**
 * ADR-0519's READ surface — the filter, the list line, and the record block.
 *
 * The stamp was stored by `every-decision-says-whose-call-it-was-arc-inc-01` and surfaced by
 * nothing, so until this increment it answered no question a session could ask. What is proved here
 * is mostly about HONESTY rather than plumbing: a filter over a field most of the corpus does not
 * carry is very easy to write in a way that reads as a census, and the arms below are chosen against
 * that specific over-read.
 *
 * The projection that feeds all of this — a stored row's stamp reaching `AdrMeta` — is proved in
 * `packages/drive/src/adr-metas.test.ts`, because that is the package the loader lives in and a test
 * here could not witness it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { DecisionAuthority } from "@storytree/library";
import type { AdrMeta } from "@storytree/drive";
import { InMemoryStore } from "@storytree/storage-protocol";

import {
  adrCommand,
  authorityBlockFor,
  authorityLine,
  renderAdrList,
  selectAdrListings,
  unstampedFooter,
  type AdrListing,
} from "./adr.js";

const OWNER_WORDS = "yes, do it — basis plus my verbatim words";

function stamp(over: Partial<DecisionAuthority> = {}): DecisionAuthority {
  return { basis: "agent-derived", scribedBy: "cli@claude/x", at: "2026-09-05", ...over } as DecisionAuthority;
}

function listing(number: number, title: string, extra?: Partial<AdrMeta>): AdrListing {
  return {
    meta: {
      number,
      file: `${String(number).padStart(4, "0")}-x.md`,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      ...extra,
    },
    title,
  };
}

/** Two stamped rows, two unstamped — the real corpus's shape in miniature. */
const CORPUS: AdrListing[] = [
  listing(1, "An unstamped elder"),
  listing(2, "Owner directed, quoted", {
    authority: stamp({ basis: "owner-directed", ownerSaid: OWNER_WORDS }),
  }),
  listing(3, "Another unstamped elder"),
  listing(4, "An agent flip", { authority: stamp({ basis: "agent-flipped" }) }),
];

// ─── the filter, and what it must NOT be read as ──────────────────────────────────────────────

test("--basis selects only rows whose stamp claims that basis", () => {
  const owner = selectAdrListings(CORPUS, { basis: "owner-directed" });
  assert.deepEqual(owner.map((l) => l.meta.number), [2]);
  const flipped = selectAdrListings(CORPUS, { basis: "agent-flipped" });
  assert.deepEqual(flipped.map((l) => l.meta.number), [4]);
  // A basis nothing claims selects nothing — not everything, which is what a filter written as
  // `authority?.basis !== undefined` would have done.
  assert.deepEqual(selectAdrListings(CORPUS, { basis: "owner-ratified" }), []);
});

test("an UNSTAMPED row matches no basis at all", () => {
  // The rows most of the log is made of. They are not "not owner-directed" — they are rows this
  // view cannot speak for, and they must fall out of every basis cut rather than land in one.
  for (const basis of ["owner-directed", "owner-ratified", "agent-derived", "agent-flipped"] as const) {
    const selected = selectAdrListings(CORPUS, { basis });
    assert.equal(selected.some((l) => l.meta.number === 1), false, `unstamped row 1 leaked into ${basis}`);
    assert.equal(selected.some((l) => l.meta.number === 3), false, `unstamped row 3 leaked into ${basis}`);
  }
});

test("--basis composes with the other cuts rather than replacing them", () => {
  const mixed: AdrListing[] = [
    listing(10, "Accepted + owner", { authority: stamp({ basis: "owner-directed", ownerSaid: "go" }) }),
    listing(11, "Superseded + owner", {
      status: "superseded",
      authority: stamp({ basis: "owner-directed", ownerSaid: "go" }),
    }),
  ];
  // `--current --basis owner-directed` must apply BOTH. A filter chain where a later clause
  // returned early would silently widen the cut it was asked to narrow.
  assert.deepEqual(
    selectAdrListings(mixed, { current: true, basis: "owner-directed" }).map((l) => l.meta.number),
    [10],
  );
});

// ─── the footer that stops a cut reading as a census ──────────────────────────────────────────

test("the unstamped footer fires ONLY on a basis cut, and states the arithmetic", () => {
  const footer = unstampedFooter(CORPUS, { basis: "owner-directed" });
  const text = footer.join("\n");
  assert.match(text, /2 of 4 decisions carry NO authority stamp/);
  // The sentence is the point, not the number: without it the row count reads as "these are the
  // decisions the owner directed" rather than "these are the ones that say so".
  assert.match(text, /what decisions SAY about who decided them, not who decided them/);
});

test("no basis cut, no footer — an unfiltered list makes no claim to disclaim", () => {
  assert.deepEqual(unstampedFooter(CORPUS, {}), []);
  assert.deepEqual(unstampedFooter(CORPUS, { current: true }), []);
});

test("a fully stamped population gets no footer either", () => {
  const allStamped = [CORPUS[1], CORPUS[3]].filter((l): l is AdrListing => l !== undefined);
  assert.deepEqual(unstampedFooter(allStamped, { basis: "owner-directed" }), []);
});

// ─── the list line ────────────────────────────────────────────────────────────────────────────

test("authorityLine renders the basis, and nothing at all when there is no stamp", () => {
  assert.equal(authorityLine(undefined), null, "an unstamped row contributes no line");
  assert.equal(authorityLine(stamp({ basis: "agent-derived" })), "decided by: agent-derived");
});

test("authorityLine quotes the owner, and truncates with a visible marker", () => {
  const long = "a".repeat(200);
  const line = authorityLine(stamp({ basis: "owner-directed", ownerSaid: long })) ?? "";
  assert.match(line, /decided by: owner-directed/);
  assert.ok(line.includes("…"), "a truncated quote must SAY it was truncated");
  // A silent truncation would let a reader quote half a sentence as the owner's own words.
  assert.ok(line.length < 120, `the list line stays scannable, got ${String(line.length)} chars`);
});

test("authorityLine FLATTENS a multi-line quote instead of breaking the row apart", () => {
  const line = authorityLine(stamp({ basis: "owner-directed", ownerSaid: "do it\n\nand quickly" })) ?? "";
  assert.equal(line.includes("\n"), false, "a list row is one line");
  assert.match(line, /“do it and quickly”/);
});

test("authorityLine SAYS when a stamp was transcribed rather than witnessed", () => {
  const line = authorityLine(stamp({ basis: "owner-directed", transcribedFromProse: true })) ?? "";
  // The weaker evidence must not read like the stronger. Without this a backfilled row and a row
  // authored with the owner in the room print identically.
  assert.match(line, /transcribed from prose, no quote/);
});

test("the rendered list carries the stamp line and the footer together", () => {
  const rows = renderAdrList(CORPUS, { basis: "owner-directed" });
  const text = rows.join("\n");
  assert.match(text, /0002/, "the matching row is shown");
  assert.ok(text.includes(OWNER_WORDS), "the owner's words reach the rendered output");
  assert.match(text, /carry NO authority stamp/, "and the footer rides with it");
});

// ─── the record block: the deliberate difference from the list ────────────────────────────────

test("authorityBlockFor shows the owner's words WHOLE — the list truncates, the record must not", () => {
  const long = `${"word ".repeat(60)}end`;
  const block = authorityBlockFor({ authority: stamp({ basis: "owner-directed", ownerSaid: long }) }).join("\n");
  assert.ok(block.includes(long), "the record carries the full quote");
  assert.equal(block.includes("…"), false, "and never truncates it — this is where a reader came to read it");
});

test("authorityBlockFor indents a multi-line quote instead of flattening it", () => {
  const block = authorityBlockFor({
    authority: stamp({ basis: "owner-directed", ownerSaid: "first line\nsecond line" }),
  });
  // The record preserves the shape of what was said; the list flattens it. Both are deliberate and
  // they are the reason there are two functions rather than one with a width parameter.
  assert.ok(block.includes("    first line"), "each line indented under the label");
  assert.ok(block.includes("    second line"));
});

test("authorityBlockFor names WHO in plain language, and names the scribe", () => {
  const block = authorityBlockFor({
    authority: stamp({ basis: "owner-directed", ownerSaid: "go", scribedBy: "cli@claude/x" }),
  }).join("\n");
  // The record surface is read by the owner too, so `owner-directed` is glossed rather than printed
  // as a token — the identifier belongs to the filter, the sentence belongs here.
  assert.match(block, /the owner, who directed it in conversation/);
  assert.match(block, /scribed by: cli@claude\/x/);
});

test("authorityBlockFor warns, in the record, that a transcribed stamp evidences nothing", () => {
  const block = authorityBlockFor({
    authority: stamp({ basis: "owner-directed", transcribedFromProse: true }),
  }).join("\n");
  assert.match(block, /TRANSCRIBED from this record's own prose/);
  assert.match(block, /repeats a claim the prose already made rather than evidencing it/);
});

test("authorityBlockFor renders NOTHING for an unstamped or malformed record", () => {
  // The `composedBannerFor` precedent: the block never announces its own absence, which is why most
  // of the decision log renders exactly as it did before ADR-0519.
  assert.deepEqual(authorityBlockFor({}), []);
  assert.deepEqual(authorityBlockFor(null), []);
  assert.deepEqual(authorityBlockFor({ authority: null }), []);
  // A malformed stamp is not half-rendered — an owner claim with no quote is refused by the schema,
  // and surfacing it anyway would show "decided by the owner" with nothing behind it.
  assert.deepEqual(authorityBlockFor({ authority: { basis: "owner-directed", scribedBy: "x", at: "y" } }), []);
});

// ─── the count the footer would otherwise have corrupted ──────────────────────────────────────

test("the ADR count reports DECISIONS, not rendered lines — the footer must not inflate it", async () => {
  // Guarding a real near-miss: the header used to count "every line the renderer did not indent as a
  // continuation", so the three un-indented footer lines would have been counted as three extra
  // decisions. It is computed from the selection now, and this pins that.
  const env = await adrCommand(
    "list",
    { basis: "owner-directed" },
    {
      allocator: null,
      branch: "claude/test",
      actor: "tester",
      today: "2026-09-05",
      roundTrip: { store: await storeWith(CORPUS), writable: false, actor: "tester" },
    },
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /storytree adr — 1 ADRs \[decided by: owner-directed\]/);
});

/** The four fixture rows as store documents, so `adr list` can be driven end to end. */
async function storeWith(listings: readonly AdrListing[]): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  for (const l of listings) {
    const id = `adr-${String(l.meta.number).padStart(4, "0")}`;
    const doc: Record<string, unknown> = {
      kind: "adr",
      id,
      title: l.title,
      description: `ADR-${String(l.meta.number).padStart(4, "0")} — ${l.title}`,
      body: `# ADR-${String(l.meta.number).padStart(4, "0")}: ${l.title}\n`,
      number: l.meta.number,
      status: l.meta.status,
      supersedes: [],
      loadBearing: false,
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    };
    if (l.meta.authority !== undefined) doc["authority"] = l.meta.authority;
    await store.upsertDoc({ id, kind: "adr", doc });
  }
  return store;
}

// ─── the help documents the honesty caveat, not just the flag ─────────────────────────────────

test("adr help documents --basis AND the reading it must not be given", async () => {
  const env = await adrCommand("help", {}, { allocator: null, branch: "b", actor: "a", today: "2026-09-05" });
  const help = env.body;
  const carries = (needle: string): void => {
    assert.ok(help.includes(needle), `adr help is missing: ${JSON.stringify(needle)}`);
  };
  carries("--basis <b>      WHO decided (ADR-0519)");
  carries("| --basis <b>]");
  // The caveat is the part worth documenting: a flag anyone can guess, an over-read they cannot.
  carries("shows what decisions SAY about who decided them");
  carries("matches NO basis");
});
