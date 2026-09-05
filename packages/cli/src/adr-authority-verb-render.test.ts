/**
 * GOLDEN RENDERS for `storytree adr authority` — every shape's whole body and its whole `next:` list.
 *
 * ## Why whole-body equality rather than a handful of `assert.match` probes
 *
 * A render is mostly string literals, and `check:mutation-diff` charges ONE MUTANT PER LITERAL and
 * reds on a single survivor. A `match` probe kills only the words it quotes and leaves every other
 * literal in the same render standing; one `assert.equal(env.body, …)` kills the entire class for
 * that shape at once. The `next:` array is part of the envelope and NO body golden reaches it, so
 * each shape pins that too.
 *
 * These are deliberately brittle. Changing a word of this verb's prose is MEANT to fail here — that
 * is what makes the wording a thing the suite holds rather than a thing nobody is watching.
 * Regenerate by reading the new body, not by loosening the assertion.
 *
 * ⚠ A SHAPE NOT PINNED HERE KEEPS ITS WHOLE LITERAL SET ALIVE. When you add a branch to
 * `adr-authority-verb.ts` that renders anything, add its case below in the same landing.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { adrAuthority, type AdrAuthorityDeps } from "./adr-authority-verb.js";

const STOCK = "decided/directed by the owner in conversation on 2026-06-29.";
const FLIP = "flipped from proposed 2026-06-21 under ADR-0084";

async function seed(
  store: InMemoryStore,
  number: number,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const id = `adr-${String(number).padStart(4, "0")}`;
  const title = `Decision ${String(number)}`;
  await store.upsertDoc({
    id,
    kind: "adr",
    doc: {
      kind: "adr",
      id,
      title,
      description: `ADR-${String(number).padStart(4, "0")} — ${title}`,
      body: `# ADR-${String(number).padStart(4, "0")}: ${title}\n\n## Status\n\n${status}\n\n## Decision\n\nSomething.\n`,
      number,
      status: "accepted",
      supersedes: [],
      loadBearing: false,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
      ...extra,
    },
  });
}

const deps = (store: InMemoryStore, writable = true): AdrAuthorityDeps => ({
  store,
  writable,
  actor: "cli@claude/test",
  today: "2026-09-05",
});

/** Two stock-phrase rows, one flip, one opaque, one claiming BOTH, one already stamped. */
async function corpus(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await seed(store, 100, `accepted (2026-06-29) — ${STOCK}`);
  await seed(store, 101, `accepted (2026-06-29) — ${STOCK}`);
  await seed(store, 200, `accepted (2026-06-15; ${FLIP}) — prose.`);
  await seed(store, 300, "accepted (2026-06-03). The owner liked it, in the author's own words.");
  await seed(store, 400, `accepted (2026-06-21; ${FLIP}) — ${STOCK}`);
  await seed(store, 500, `accepted — ${STOCK}`, {
    authority: { basis: "owner-directed", scribedBy: "cli@earlier", at: "2026-09-01", ownerSaid: "his words" },
  });
  return store;
}

async function coverageAfterBackfill(): Promise<Awaited<ReturnType<typeof adrAuthority>>> {
  const store = await corpus();
  await adrAuthority(undefined, { backfill: true }, deps(store));
  return adrAuthority(undefined, {}, deps(store));
}

async function readTranscribedFixture(): Promise<Awaited<ReturnType<typeof adrAuthority>>> {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.", {
    authority: { basis: "owner-directed", scribedBy: "cli@x", at: "2026-09-05", transcribedFromProse: true },
  });
  return adrAuthority("100", {}, deps(store));
}

test("golden render — emptyStore", async () => {
  const env = await adrAuthority(undefined, {}, deps(new InMemoryStore()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "no decisions in the store. (they live there since ADR-0403 — is the DB up?)");
  assert.deepEqual(env.next ?? [], ["pnpm db:up","storytree adr list --current"]);
});

test("golden render — dryRun", async () => {
  const env = await adrAuthority(undefined, { backfill: true }, deps(await corpus(), false));
  assert.equal(env.ok, true);
  assert.equal(env.body, "DRY RUN — 3 of 5 unstamped decisions are mechanically classifiable.\n\n     1  agent-flipped\n     2  owner-directed\n\n     2  left UNSTAMPED — their `## Status` carries neither exact phrase\n     1  already stamped, untouched by this pass\n\nEvery stamp this would write is a TRANSCRIPTION of a claim an agent already made in prose,\nnever a verification of one, and none carries `ownerSaid` — those words were never captured,\nand reconstructing them from a summary would forge the evidence the field exists to make\ntrustworthy (ADR-0519 D5).\n\nRe-run with --pg to apply.");
  assert.deepEqual(env.next ?? [], ["pnpm db:up","storytree adr authority --backfill --pg","storytree adr authority"]);
});

test("golden render — backfillApplied", async () => {
  const env = await adrAuthority(undefined, { backfill: true }, deps(await corpus()));
  assert.equal(env.ok, true);
  assert.equal(env.body, "stamped 3 of 3 classifiable decisions.\n\n     1  agent-flipped\n     2  owner-directed\n\n     2  left UNSTAMPED — an honest absence, not a hole to fill (ADR-0519 D5)");
  assert.deepEqual(env.next ?? [], ["storytree adr authority","storytree adr list --current"]);
});

test("golden render — backfillWithNumber", async () => {
  const env = await adrAuthority("100", { backfill: true }, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "--backfill stamps the whole log by ADR-0519 D5's two exact phrases; it takes no decision number (got \"100\").");
  assert.deepEqual(env.next ?? [], ["storytree adr authority --backfill","storytree adr authority 100 --basis agent-derived --pg"]);
});

test("golden render — coverageIndex", async () => {
  const env = await coverageAfterBackfill();
  assert.equal(env.ok, true);
  assert.equal(env.body, "storytree adr authority — 4 of 6 decision rows declare a basis (66.7% of the WHOLE log).\n\n     1  agent-flipped\n     3  owner-directed\n\n  of the 3 stamps CLAIMING the owner's authority:\n       1  carry his verbatim words (33.3% of owner claims)\n       2  transcribed from the record's own prose — no words were ever captured\n\n     2  unstamped (33.3% of the whole log)\n\nA transcribed stamp is an agent's earlier claim carried forward, not a verification of it\n(ADR-0519 D5). Read the two owner rows as different strengths of evidence — that separation is\nthe reason the marker exists, and flattening them would promote every backfilled row into the\nclass of a record authored with the owner in the room.");
  assert.deepEqual(env.next ?? [], ["storytree adr authority --backfill","storytree adr list --current","storytree adr authority 519"]);
});

test("golden render — readQuoted", async () => {
  const env = await adrAuthority("500", {}, deps(await corpus()));
  assert.equal(env.ok, true);
  assert.equal(env.body, "ADR-0500 — owner-directed (quoted owner directive) · scribed by cli@earlier on 2026-09-01\n\nThe owner's words, verbatim:\n  > his words");
  assert.deepEqual(env.next ?? [], ["storytree library artifact adr-0500","storytree adr authority"]);
});

test("golden render — readTranscribed", async () => {
  const env = await readTranscribedFixture();
  assert.equal(env.ok, true);
  assert.equal(env.body, "ADR-0100 — owner-directed (transcribed from the record's own prose — no owner words were ever captured) · scribed by cli@x on 2026-09-05");
  assert.deepEqual(env.next ?? [], ["storytree library artifact adr-0100","storytree adr authority"]);
});

test("golden render — readUnstampedClassifiable", async () => {
  const env = await adrAuthority("100", {}, deps(await corpus()));
  assert.equal(env.ok, true);
  assert.equal(env.body, "ADR-0100 — unstamped — nobody has recorded whose call this was\n\nThe backfill would read it as `owner-directed` from its own prose (`storytree adr authority --backfill` to see the whole pass).");
  assert.deepEqual(env.next ?? [], ["storytree library artifact adr-0100","storytree adr authority 100 --basis agent-derived --pg"]);
});

test("golden render — readUnstampedOpaque", async () => {
  const env = await adrAuthority("300", {}, deps(await corpus()));
  assert.equal(env.ok, true);
  assert.equal(env.body, "ADR-0300 — unstamped — nobody has recorded whose call this was\n\nIts `## Status` prose carries neither phrase ADR-0519 D5 classifies mechanically, so the\nbackfill leaves it alone. That is an honest absence — stamp it by hand only if you KNOW\nwhose call it was; do not read a basis out of prose the classifier declined.");
  assert.deepEqual(env.next ?? [], ["storytree library artifact adr-0300","storytree adr authority 300 --basis agent-derived --pg"]);
});

test("golden render — stamped", async () => {
  const env = await adrAuthority("300", { basis: "owner-ratified", ownerSaid: "do the thing" }, deps(await corpus()));
  assert.equal(env.ok, true);
  assert.equal(env.body, "stamped adr-0300:\n  owner-ratified (quoted owner directive) · scribed by cli@claude/test on 2026-09-05\n\nThe owner's words, verbatim:\n  > do the thing");
  assert.deepEqual(env.next ?? [], ["storytree library artifact adr-0300","storytree adr authority"]);
});

test("golden render — alreadyStamped", async () => {
  const env = await adrAuthority("500", { basis: "agent-derived" }, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "ADR-0500 is ALREADY stamped and was not overwritten:\n  owner-directed (quoted owner directive) · scribed by cli@earlier on 2026-09-01\n\nThis verb FILLS AN ABSENCE and can do nothing else. There is no --force and no --restamp:\na stamp is EVIDENCE (ADR-0424 D6), and evidence a later pass can rewrite is not evidence.\nA loud rewrite route is still a rewrite route, so none exists.\n\nIf this stamp is WRONG, correct it the way a wrong DECISION is corrected — say so in the\nrecord's own prose, or supersede the record. If you are merely correcting the record's text,\nyou do not need this verb at all: the stamp is deliberately out of `adr push`'s reach.");
  assert.deepEqual(env.next ?? [], ["storytree adr authority 500","storytree library artifact adr-0500"]);
});

test("golden render — badBasis", async () => {
  const env = await adrAuthority("300", { basis: "nope" }, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "--basis must be one of owner-directed | owner-ratified | agent-derived | agent-flipped (got \"nope\").");
  assert.deepEqual(env.next ?? [], ["storytree adr authority 300"]);
});

test("golden render — notWritable", async () => {
  const env = await adrAuthority("300", { basis: "agent-derived" }, deps(await corpus(), false));
  assert.equal(env.ok, false);
  assert.equal(env.body, "stamping writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).");
  assert.deepEqual(env.next ?? [], ["pnpm db:up","storytree adr authority 300 --basis agent-derived --pg"]);
});

test("golden render — badNumber", async () => {
  const env = await adrAuthority("banana", {}, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "expected a decision NUMBER (got \"banana\").");
  assert.deepEqual(env.next ?? [], ["storytree adr authority 519","storytree adr authority"]);
});

test("golden render — unknownRow", async () => {
  const env = await adrAuthority("777", {}, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "no decision row \"adr-0777\" in the store.");
  assert.deepEqual(env.next ?? [], ["storytree adr list --current","storytree adr authority"]);
});

test("golden render — ownerBasisNoQuote", async () => {
  const env = await adrAuthority("300", { basis: "owner-directed" }, deps(await corpus()));
  assert.equal(env.ok, false);
  assert.equal(env.body, "a 'owner-directed' stamp must quote the owner verbatim in ownerSaid (ADR-0519 D3). If there is no directive to quote, the honest basis is 'agent-derived'.");
  assert.deepEqual(env.next ?? [], ["storytree adr authority 300"]);
});
