import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";

import { adrPull, adrPush, parseDecisionArg, type AdrRoundTripDeps } from "./adr-round-trip.js";

/**
 * The round-trip edit verb (ADR-0403 dec 9), over an in-memory store and a temp file.
 *
 * The property that makes the verb trustworthy is the NO-OP: pull, change nothing, push, and the row
 * is untouched. Everything else here guards the ways that property can be quietly lost — a field
 * dropped on the way back, a removed frontmatter line left standing on the row, a captured shell
 * banner accepted as prose.
 */

const DOC = `---
status: proposed
decided: 2026-08-21
arc: decision-log-home-arc
amends: [139]
---
# ADR-0403: A decision under test

## Status

proposed
`;

async function seeded(): Promise<{ store: InMemoryStore; deps: AdrRoundTripDeps }> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "adr-0403",
    kind: "adr",
    doc: {
      kind: "adr",
      id: "adr-0403",
      title: "A decision under test",
      description: "ADR-0403 — A decision under test",
      body: DOC.slice(DOC.indexOf("\n---\n") + "\n---\n".length),
      number: 403,
      status: "proposed",
      decided: "2026-08-21",
      arcRef: "asset:decision-log-home-arc",
      amends: [139],
      supersedes: [],
      loadBearing: false,
      references: [],
      schemaVersion: 7,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    },
  });
  return { store, deps: { store, writable: true, actor: "test" } };
}

async function tmpFile(name: string): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "storytree-adr-")), name);
}

test("adr-round-trip-pull-writes-the-whole-document: frontmatter then body, the file the row came from", async () => {
  const { deps } = await seeded();
  const out = await tmpFile("adr-0403.md");

  const env = await adrPull("403", out, deps);
  assert.equal(env.ok, true);
  assert.equal(await readFile(out, "utf8"), DOC);
});

test("adr-round-trip-no-op-push-writes-nothing: the property the verb rests on", async () => {
  // Pull, change nothing, push. A single drifting byte per pass would make every no-op edit show as
  // a diff and the tier's own history unreadable — which is the outcome that would get the migration
  // reverted, so this is the test that has to hold.
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);

  const before = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  const env = await adrPush("403", out, deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /unchanged — nothing written/);
  assert.deepEqual((await store.getDoc("adr-0403"))?.doc, before, "not even updatedAt moved");
});

test("adr-round-trip-push-applies-an-edit-and-names-what-moved: the whole document is the truth", async () => {
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);

  await writeFile(
    out,
    DOC.replace("status: proposed", "status: accepted")
      .replace("amends: [139]", "amends: [139, 223]\nload_bearing: true")
      .replace("proposed\n", "accepted (2026-08-21) — the owner directed it.\n"),
    "utf8",
  );

  const env = await adrPush("403", out, deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /status: proposed -> accepted/);
  assert.match(env.body, /amends: 139 -> 139, 223/);
  assert.match(env.body, /load_bearing: false -> true/);
  assert.match(env.body, /body: .* characters/);

  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(row["status"], "accepted");
  assert.deepEqual(row["amends"], [139, 223]);
  assert.equal(row["loadBearing"], true);
  // The `## Status` prose and the `status` field moved TOGETHER, in one edit — which is the property
  // ADR-0139 needs, since the field is a projection of that prose and never an independent write.
  assert.match(String(row["body"]), /accepted \(2026-08-21\) — the owner directed it\./);
});

test("adr-round-trip-push-deletes-a-removed-frontmatter-line: the file is the whole truth, not a patch", async () => {
  // A merge that kept a key the author deleted would make the pulled file a PARTIAL view of the row,
  // and the round trip a lie: you would remove `arc:`, push, pull again, and find it back.
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);
  await writeFile(out, DOC.replace("arc: decision-log-home-arc\n", "").replace("decided: 2026-08-21\n", ""), "utf8");

  const env = await adrPush("403", out, deps);
  assert.equal(env.ok, true);
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal("arcRef" in row, false, "a removed arc stamp comes off the row");
  assert.equal("decided" in row, false, "a removed decided date comes off the row");
});

test("adr-round-trip-push-refuses-a-captured-shell-banner-and-names-the-cause", async () => {
  // ADR-0361's damage shape: `pnpm storytree … > file` puts pnpm's two-line run banner ahead of the
  // document. No separate detector is needed — the banner pushes the `---` fence off line 1 — but the
  // MESSAGE has to name the cause, or the parse error reads as a corrupt decision.
  const { deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await writeFile(out, `> storytree@0.0.0 storytree C:\\code\\storytree\n\n${DOC}`, "utf8");

  const env = await adrPush("403", out, deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /not a decision document/);
  assert.match(env.body, /redirect/);
});

test("adr-round-trip-refuses-without-the-things-it-needs: --out, --file, --pg, and a real row", async () => {
  const { deps } = await seeded();
  const out = await tmpFile("adr-0403.md");

  // No stdout form, deliberately — offering one invites the redirect above.
  const noOut = await adrPull("403", undefined, deps);
  assert.equal(noOut.ok, false);
  assert.match(noOut.body, /needs --out/);

  const noFile = await adrPush("403", undefined, deps);
  assert.equal(noFile.ok, false);
  assert.match(noFile.body, /needs --file/);

  const readOnly = await adrPush("403", out, { ...deps, writable: false });
  assert.equal(readOnly.ok, false);
  assert.match(readOnly.body, /--pg/);

  // A push never CREATES: minting a decision reserves its number transactionally (ADR-0050), and a
  // creating push would be a second mint that reserved nothing.
  const missing = await adrPush("999", out, deps);
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no decision row "adr-0999"/);
});

test("adr-round-trip-parses-either-spelling-of-the-argument: `403` and `adr-0403`", () => {
  assert.equal(parseDecisionArg("403"), 403);
  assert.equal(parseDecisionArg("adr-0403"), 403);
  assert.equal(parseDecisionArg("0403"), 403);
  assert.equal(parseDecisionArg(undefined), null);
  assert.equal(parseDecisionArg("merge-ceremony"), null);
  assert.equal(parseDecisionArg("0"), null);
});

test("adr-round-trip-push-keeps-the-labelled-description: the two directions cannot disagree", async () => {
  // They DID disagree, and only for one live push: the loader wrote `ADR-0403 — <title>` and the push
  // wrote the bare title, so the first real use of the verb silently restyled the row's card line.
  // It surfaced as an `-11 chars` entry in the artifact's own history and nothing else. Both
  // directions now call `adrDescriptionOf`, and this is what stops them drifting apart again.
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);
  await writeFile(out, DOC.replace("## Status\n\nproposed\n", "## Status\n\nproposed, restated.\n"), "utf8");

  await adrPush("403", out, deps);
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(row["description"], "ADR-0403 — A decision under test");
});

test("adr-round-trip-push-refuses-a-document-for-a-different-decision: the one-character slip", async () => {
  // `adr pull 403 --out adr-0403.md` then `adr push 402 --file adr-0403.md` — one character off, and
  // the filename the pull itself suggested. Before the guard this REPLACED ADR-0402 with ADR-0403's
  // title, body and edges and returned ok:true. Nothing downstream could catch it: `adr-number-
  // identity` compares the stored `number` FIELD to the id, and the push sets that from argv, so the
  // row stayed internally consistent while carrying another decision's content.
  const { store, deps } = await seeded();
  await store.upsertDoc({
    id: "adr-0402",
    kind: "adr",
    doc: {
      kind: "adr",
      id: "adr-0402",
      title: "The neighbour",
      description: "ADR-0402 — The neighbour",
      body: "# ADR-0402: The neighbour\n\n## Status\n\naccepted\n",
      number: 402,
      status: "accepted",
      amends: [7],
      supersedes: [],
      loadBearing: true,
      references: [],
      schemaVersion: 7,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
  });
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);

  const env = await adrPush("402", out, deps);

  assert.equal(env.ok, false, "pushing 403's document at 402 must be refused");
  assert.match(env.body, /is ADR-0403, but you are pushing to ADR-0402/);
  const row = (await store.getDoc("adr-0402"))?.doc as Record<string, unknown>;
  assert.equal(row["title"], "The neighbour", "the target keeps its own title");
  assert.equal(row["status"], "accepted", "and its own status");
  assert.deepEqual(row["amends"], [7], "and its own edges — the drop was the silent half");
  assert.equal(row["loadBearing"], true);
});

test("adr-round-trip-push-accepts-a-document-whose-heading-matches: the guard is not a wall", async () => {
  // The mirror of the case above: the guard must not refuse the ordinary push, or it would make the
  // verb unusable rather than safe. Same document, pushed at its OWN number.
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);
  const text = await readFile(out, "utf8");
  await writeFile(out, `${text}\nA new closing paragraph.\n`, "utf8");

  const env = await adrPush("403", out, deps);

  assert.equal(env.ok, true, "the matching push still goes through");
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.match(String(row["body"]), /A new closing paragraph\./);
});

test("adr-round-trip-push-refuses-a-schema-skewed-row-instead-of-crashing", async () => {
  // The `adr` schema is `.strict()`, so ANY key on the STORED row outside it makes the push's
  // validation throw. Until this guard the throw went straight past the envelope to `main().catch`
  // and the verb died printing a raw zod issue array.
  //
  // The vector is SCHEMA SKEW, a state this repo already names: the library tier is live-canonical
  // (ADR-0023), so a `--pg` write can add a field BEFORE the schema that validates it reaches this
  // checkout — and then every session on main-derived code is hard-refused on a decision it never
  // touched. Measured precedent: ADR-0298's sweep wrote `proposals` onto four arcs ~1h40m before the
  // schema half landed.
  const { store, deps } = await seeded();
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  await store.upsertDoc({
    id: "adr-0403",
    kind: "adr",
    doc: { ...row, aFieldThisCheckoutDoesNotKnow: "written by a newer branch" },
  });

  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);
  const edited = (await readFile(out, "utf8")).replace("## Status", "## Status\n\nedited\n");
  await writeFile(out, edited, "utf8");

  const env = await adrPush("403", out, deps);

  assert.equal(env.ok, false, "a refusal, not a crash");
  assert.match(env.body, /was NOT written/);
  // Charged BY AUTHORSHIP: the key was already on the stored row, so it is not the caller's typo.
  assert.match(env.body, /aFieldThisCheckoutDoesNotKnow/);
  assert.match(env.body, /exactly as it was/, "the refusal says the decision survived");
  // And it did survive — unwritten, with the pre-existing body.
  const after = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(after["body"], row["body"], "nothing was written");
});

test("adr-round-trip-push-reports-title-description-and-number: the fields it rewrites are never silent", async () => {
  // The silent-reversion path this closes: `library artifact edit adr-0403 --set title=…` sets the
  // row's title, then ANY later body-only push re-derives `title` from the document's H1 and puts it
  // back — and the change report named only `body`. A field the report omits is a field that can
  // change without anyone being told.
  const { store, deps } = await seeded();
  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  await store.upsertDoc({
    id: "adr-0403",
    kind: "adr",
    // The state a `--set title=` edit leaves behind: title/description moved, body's H1 did not.
    // `number` is skewed too, which is the `adr-number-identity` shape the push silently corrects.
    doc: { ...row, title: "A hand-edited title", description: "ADR-0403 — A hand-edited title", number: 999 },
  });

  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);
  const env = await adrPush("403", out, deps);

  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /title: "A hand-edited title" -> "A decision under test"/);
  assert.match(env.body, /description: .*A hand-edited title.* -> .*A decision under test/);
  assert.match(env.body, /number: 999 -> 403/);
});

test("adr-round-trip-push-does-not-take-a-quoted-heading-as-the-title", async () => {
  // Decisions cite decisions constantly, so a fenced block quoting another decision's `# ADR-NNNN:`
  // heading is ordinary content — and the title regex is line-anchored, so a fenced line at column 0
  // matched exactly like a real H1. The wrong title then lands on the row, reported only as
  // `body: +N characters`.
  const { store, deps } = await seeded();
  const out = await tmpFile("adr-0403.md");
  await adrPull("403", out, deps);

  const quoted = [
    "```",
    "# ADR-0050: Allocate decision numbers atomically",
    "```",
    "",
  ].join("\n");
  const text = await readFile(out, "utf8");
  await writeFile(out, text.replace("## Status", `${quoted}## Status`), "utf8");

  const env = await adrPush("403", out, deps);
  assert.equal(env.ok, true, env.body);
  assert.doesNotMatch(env.body, /title:/, "the real H1 still wins, so no title change is reported");

  const after = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(after["title"], "A decision under test", "the decision keeps its OWN name");
  assert.notEqual(after["title"], "Allocate decision numbers atomically");
});
