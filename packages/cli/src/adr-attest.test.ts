/**
 * `storytree adr attest` — ADR-0519 D5's stamp-after-creation verb and its mechanical backfill.
 *
 * ## Why the arms read the STORED ROW, not the envelope
 *
 * A decision's fields do not flow by spread; several writers name them one by one, so an assertion
 * over a rendered message can pass while nothing reached the row. `adr-authority.test.ts` carries the
 * full argument. Every write arm below therefore reads the row back out of an `InMemoryStore`.
 *
 * ## And why the REFUSALS are arms rather than omissions
 *
 * Three fences are the whole reason this verb is safe to have at all: `scribedBy` is never a flag,
 * an existing stamp is never overwritten without `--restamp`, and `--restamp` is refused outright on
 * `--backfill`. Each of those is a thing the code does NOT do, which reads like an oversight in the
 * source, so each is pinned here — an unpinned deliberate absence is indistinguishable from a
 * forgotten one, and the next session to "finish the wiring" would delete the guarantee.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { DecisionAuthority } from "@storytree/library";

import { adrAttest, classifyFromProse, statusSectionOf, type AdrAttestDeps } from "./adr-attest.js";

const STOCK = "decided/directed by the owner in conversation on 2026-06-29.";
const FLIP = "flipped from proposed 2026-06-21 under ADR-0084";

const idOf = (n: number): string => `adr-${String(n).padStart(4, "0")}`;

async function seed(
  store: InMemoryStore,
  number: number,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const id = idOf(number);
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

function depsFor(store: InMemoryStore, writable = true): AdrAttestDeps {
  return { store, writable, actor: "cli@claude/test", today: "2026-09-05" };
}

const authorityOf = async (store: InMemoryStore, n: number): Promise<Record<string, unknown> | undefined> =>
  ((await store.getDoc(idOf(n)))?.doc as Record<string, unknown> | undefined)?.["authority"] as
    | Record<string, unknown>
    | undefined;

// ─── the pure classifier ──────────────────────────────────────────────────────────────────────

test("classifyFromProse: the stock owner phrase is owner-directed AND marked transcribed", () => {
  assert.deepEqual(classifyFromProse(`## Status\n\naccepted (2026-06-29) — ${STOCK}\n`), {
    basis: "owner-directed",
    transcribedFromProse: true,
  });
});

test("classifyFromProse: the ADR-0084 flip is agent-flipped and carries NO transcribed marker", () => {
  // NOT a stylistic choice — `DecisionAuthority` refuses `transcribedFromProse` on a non-owner
  // basis, so a classifier that set it here would mint stamps the schema rejects. The increment
  // that ordered this backfill asked for the marker on every row; the schema refutes that.
  const classified = classifyFromProse(`## Status\n\naccepted (2026-06-15; ${FLIP}) — some prose.\n`);
  assert.deepEqual(classified, { basis: "agent-flipped" });
  assert.equal(DecisionAuthority.safeParse({ ...classified, scribedBy: "s", at: "d" }).success, true);
  assert.equal(
    DecisionAuthority.safeParse({ ...classified, transcribedFromProse: true, scribedBy: "s", at: "d" }).success,
    false,
    "the schema must refuse the marker on agent-flipped — this is what makes the arm above load-bearing",
  );
});

test("classifyFromProse: a row claiming BOTH is left unstamped rather than resolved to either", () => {
  assert.equal(classifyFromProse(`## Status\n\naccepted (2026-06-21; ${FLIP}) — ${STOCK}\n`), null);
});

test("classifyFromProse: prose with neither phrase classifies to nothing", () => {
  assert.equal(classifyFromProse("## Status\n\naccepted (2026-06-03). The owner liked it.\n"), null);
});

test("statusSectionOf: a `## Status` quoted inside a fenced block is not read as this record's", () => {
  const body = ["# ADR-0001: X", "", "## Decision", "", "```", `## Status`, STOCK, "```", ""].join("\n");
  assert.equal(statusSectionOf(body), "");
  assert.equal(classifyFromProse(body), null);
});

test("statusSectionOf: the section stops at the next heading", () => {
  const body = `# T\n\n## Status\n\naccepted.\n\n## Context\n\n${STOCK}\n`;
  assert.match(statusSectionOf(body), /accepted\./);
  assert.doesNotMatch(statusSectionOf(body), /directed by the owner/);
  assert.equal(classifyFromProse(body), null, "a stock phrase in ## Context is not an authority claim");
});

// ─── stamping one record ──────────────────────────────────────────────────────────────────────

test("adr attest <n> --basis owner-directed --owner-said: the stamp lands on the row, words verbatim", async () => {
  const store = new InMemoryStore();
  await seed(store, 519, "accepted (2026-09-05).");
  const words = "yes, do it — basis plus my verbatim words";
  const env = await adrAttest("519", { basis: "owner-directed", ownerSaid: words }, depsFor(store));
  assert.equal(env.ok, true);
  assert.deepEqual(await authorityOf(store, 519), {
    basis: "owner-directed",
    scribedBy: "cli@claude/test",
    at: "2026-09-05",
    ownerSaid: words,
  });
  assert.match(env.body, /yes, do it/, "the render must show the words it stored");
});

test("adr attest: scribedBy is the CURRENT session and there is no flag that can set it", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  await adrAttest("100", { basis: "agent-derived" }, depsFor(store));
  assert.equal((await authorityOf(store, 100))?.["scribedBy"], "cli@claude/test");

  // The fence as BEHAVIOUR: `scribedBy` TRACKS `deps.actor` and nothing else, so the same opts
  // written by a different session produce a different stamp. That is what makes the field the one
  // the store can corroborate independently (`events.library_event.actor`) — a value the caller
  // could choose would forge exactly that. The complementary half, that no OPTION can reach it, is
  // held by the type: `AdrAttestOpts` declares no such field, so it is unreachable in typed code.
  await seed(store, 101, "accepted.");
  await adrAttest("101", { basis: "agent-derived" }, { ...depsFor(store), actor: "cli@somebody-else" });
  assert.equal((await authorityOf(store, 101))?.["scribedBy"], "cli@somebody-else");
});

test("adr attest: an owner basis with no quote is REFUSED, and the schema's own message is surfaced", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("100", { basis: "owner-ratified" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /must quote the owner verbatim/);
  assert.match(env.body, /agent-derived/, "the refusal must name the honest alternative, never suggest inventing a quote");
  assert.equal(await authorityOf(store, 100), undefined, "nothing may be written on a refusal");
});

test("adr attest: owner words on an AGENT basis are refused", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("100", { basis: "agent-derived", ownerSaid: "do it" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adr attest: --transcribed-from-prose lets an owner basis validate WITHOUT a quote", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("100", { basis: "owner-directed", transcribedFromProse: true }, depsFor(store));
  assert.equal(env.ok, true);
  assert.deepEqual(await authorityOf(store, 100), {
    basis: "owner-directed",
    scribedBy: "cli@claude/test",
    at: "2026-09-05",
    transcribedFromProse: true,
  });
});

test("adr attest: an unknown --basis is refused and names the four values", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("100", { basis: "owner-said-so" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /owner-directed \| owner-ratified \| agent-derived \| agent-flipped/);
});

test("adr attest: a write without --pg is refused and stores nothing", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("100", { basis: "agent-derived" }, depsFor(store, false));
  assert.equal(env.ok, false);
  assert.match(env.body, /--pg/);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adr attest: an unknown decision number is refused rather than creating a row", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.");
  const env = await adrAttest("777", { basis: "agent-derived" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.equal(await store.getDoc("adr-0777"), null);
});

// ─── fence 2: an existing stamp is not overwritten ────────────────────────────────────────────

test("adr attest: an ALREADY-STAMPED record is refused, and the stored stamp is untouched", async () => {
  const store = new InMemoryStore();
  const existing = { basis: "owner-directed", scribedBy: "cli@earlier", at: "2026-09-01", ownerSaid: "his words" };
  await seed(store, 100, "accepted.", { authority: existing });
  const env = await adrAttest("100", { basis: "agent-derived" }, depsFor(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /--restamp/);
  assert.deepEqual(await authorityOf(store, 100), existing);
});

test("adr attest --restamp: the explicit escape does overwrite", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.", {
    authority: { basis: "agent-derived", scribedBy: "cli@earlier", at: "2026-09-01" },
  });
  const env = await adrAttest("100", { basis: "agent-flipped", restamp: true }, depsFor(store));
  assert.equal(env.ok, true);
  assert.equal((await authorityOf(store, 100))?.["basis"], "agent-flipped");
  assert.match(env.body, /RE-STAMPED/);
});

test("adr attest: the already-stamped refusal fires WITHOUT --pg too, so the reader learns why", async () => {
  // Ordering matters: refused for the write gate first, the caller re-runs with --pg and is then
  // refused for a different reason. Reported once, with the reason that actually applies.
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.", { authority: { basis: "agent-derived", scribedBy: "x", at: "d" } });
  const env = await adrAttest("100", { basis: "agent-flipped" }, depsFor(store, false));
  assert.equal(env.ok, false);
  assert.match(env.body, /ALREADY stamped/);
});

// ─── the backfill ─────────────────────────────────────────────────────────────────────────────

async function backfillCorpus(): Promise<InMemoryStore> {
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

test("adr attest --backfill: stamps only the two exact phrases, leaving the rest alone", async () => {
  const store = await backfillCorpus();
  const env = await adrAttest(undefined, { backfill: true }, depsFor(store));
  assert.equal(env.ok, true);
  assert.deepEqual(await authorityOf(store, 100), {
    basis: "owner-directed",
    scribedBy: "cli@claude/test",
    at: "2026-09-05",
    transcribedFromProse: true,
  });
  assert.deepEqual(await authorityOf(store, 200), {
    basis: "agent-flipped",
    scribedBy: "cli@claude/test",
    at: "2026-09-05",
  });
  assert.equal(await authorityOf(store, 300), undefined, "free-form owner prose stays unstamped");
  assert.equal(await authorityOf(store, 400), undefined, "a row claiming BOTH stays unstamped");
});

test("adr attest --backfill: NO backfilled stamp carries ownerSaid", async () => {
  // ADR-0519 D5's fence, and the reason the backfill is safe to run at all: those words were never
  // captured, so any value here would be a reconstruction — forging the evidence the field exists
  // to make trustworthy.
  const store = await backfillCorpus();
  await adrAttest(undefined, { backfill: true }, depsFor(store));
  for (const n of [100, 101, 200]) {
    assert.equal((await authorityOf(store, n))?.["ownerSaid"], undefined, `adr-${String(n)} must carry no quote`);
  }
});

test("adr attest --backfill: an already-stamped row is never touched, --restamp or not", async () => {
  const store = await backfillCorpus();
  await adrAttest(undefined, { backfill: true }, depsFor(store));
  assert.deepEqual(await authorityOf(store, 500), {
    basis: "owner-directed",
    scribedBy: "cli@earlier",
    at: "2026-09-01",
    ownerSaid: "his words",
  });
});

test("adr attest --backfill --restamp: refused outright — a bulk pass may not overwrite an authored stamp", async () => {
  const store = await backfillCorpus();
  const env = await adrAttest(undefined, { backfill: true, restamp: true }, depsFor(store));
  assert.equal(env.ok, false);
  assert.equal((await authorityOf(store, 500))?.["scribedBy"], "cli@earlier");
  assert.equal(await authorityOf(store, 100), undefined, "the refused pass writes nothing at all");
});

test("adr attest --backfill without --pg is a DRY RUN that writes nothing", async () => {
  const store = await backfillCorpus();
  const env = await adrAttest(undefined, { backfill: true }, depsFor(store, false));
  assert.equal(env.ok, true);
  assert.match(env.body, /DRY RUN/);
  assert.match(env.body, /owner-directed/);
  for (const n of [100, 101, 200]) assert.equal(await authorityOf(store, n), undefined);
});

test("adr attest --backfill: refuses a decision number rather than silently ignoring it", async () => {
  const store = await backfillCorpus();
  const env = await adrAttest("100", { backfill: true }, depsFor(store));
  assert.equal(env.ok, false);
  assert.equal(await authorityOf(store, 100), undefined);
});

test("adr attest --backfill is idempotent: a second pass writes nothing new", async () => {
  const store = await backfillCorpus();
  await adrAttest(undefined, { backfill: true }, depsFor(store));
  const first = await authorityOf(store, 100);
  const env = await adrAttest(undefined, { backfill: true }, { ...depsFor(store), today: "2026-12-25" });
  assert.equal(env.ok, true);
  assert.deepEqual(await authorityOf(store, 100), first, "a re-run must not re-date an existing stamp");
  assert.match(env.body, /stamped 0 of 0/);
});

// ─── the read shapes ──────────────────────────────────────────────────────────────────────────

test("adr attest <n>: reading an unstamped record says so and does NOT read a basis out of prose", async () => {
  const store = new InMemoryStore();
  await seed(store, 300, "accepted (2026-06-03). The owner liked it.");
  const env = await adrAttest("300", {}, depsFor(store));
  assert.equal(env.ok, true);
  assert.match(env.body, /unstamped/);
  assert.match(env.body, /honest absence/);
  assert.equal(await authorityOf(store, 300), undefined);
});

test("adr attest <n>: a transcribed stamp is described as transcribed, never as a quoted directive", async () => {
  const store = new InMemoryStore();
  await seed(store, 100, "accepted.", {
    authority: { basis: "owner-directed", scribedBy: "cli@x", at: "2026-09-05", transcribedFromProse: true },
  });
  const env = await adrAttest("100", {}, depsFor(store));
  assert.match(env.body, /transcribed from the record's own prose/);
  assert.doesNotMatch(env.body, /verbatim/);
});

test("adr attest: the coverage index states its DENOMINATOR on every figure", async () => {
  // ADR-0519 D5 leaves ~41% of the log permanently unstamped by design, so a bare percentage would
  // read as a coverage claim about the whole log — the error a reader cannot detect from the view.
  const store = await backfillCorpus();
  await adrAttest(undefined, { backfill: true }, depsFor(store));
  const env = await adrAttest(undefined, {}, depsFor(store));
  assert.equal(env.ok, true);
  assert.match(env.body, /of the WHOLE log/);
  assert.match(env.body, /of owner claims/);
  assert.match(env.body, /4 of 6 decision rows declare a basis/);
});

test("adr attest: an empty decision log is refused, never reported as full coverage", async () => {
  const env = await adrAttest(undefined, {}, depsFor(new InMemoryStore()));
  assert.equal(env.ok, false);
  assert.match(env.body, /no decisions in the store/);
});
