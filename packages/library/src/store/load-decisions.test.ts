import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";

import { crossLinkedDecisionRefs, loadDecisions } from "./load-decisions.js";

/**
 * The one-shot decision load (ADR-0403 dec 1), exercised over a FAKE `docs/decisions` tree.
 *
 * A fake tree rather than the real one, for the reason the `-inc-02` census learned the hard way on
 * `referential-integrity`: a check written against the live corpus passes for whatever the live
 * corpus happens to be, so a resolver that silently agreed with itself went green on the very bug it
 * existed to catch. Here the expected rows are authored independently of the input, so a loader that
 * dropped a field or mis-keyed a row has nowhere to hide. It also keeps the suite off
 * `docs/decisions/**`, which the affected-scope classifier maps elsewhere (ADR-0394/0399).
 */

async function fakeDecisionsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "storytree-decisions-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, "utf8");
  }
  return dir;
}

const ACCEPTED = `---
status: accepted
decided: 2026-08-21
arc: decision-log-home-arc
amends: [139, 223]
---
# ADR-0403: The decision log becomes ordinary artifacts

## Status

accepted (2026-08-21)

## Context

It follows [ADR-0302](0302-online-or-nothing.md) and [ADR-0139](../decisions/0139-correct.md).
`;

const PROPOSED = `---
status: proposed
---
# ADR-0404: Something not yet decided
`;

test("load-decisions-writes-one-row-per-file: the frontmatter becomes typed fields on an ordinary artifact", async () => {
  const dir = await fakeDecisionsDir({
    "0403-the-decision-log-becomes-ordinary.md": ACCEPTED,
    "0404-something-not-yet-decided.md": PROPOSED,
    // Not a decision filename — the loader must not pick it up, or a stray note in the directory
    // becomes a row with a garbage number.
    "README.md": "# not a decision\n",
  });
  const store = new InMemoryStore();

  const result = await loadDecisions(store, dir);
  assert.equal(result.scanned, 2, "the non-conforming filename is not scanned");
  assert.equal(result.written, 2);
  assert.deepEqual(result.numbers, [403, 404]);

  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(row["kind"], "adr");
  assert.equal(row["number"], 403);
  assert.equal(row["status"], "accepted");
  assert.equal(row["decided"], "2026-08-21");
  assert.deepEqual(row["amends"], [139, 223]);
  assert.deepEqual(row["supersedes"], []);
  assert.equal(row["loadBearing"], false);
  assert.equal(row["title"], "The decision log becomes ordinary artifacts");
  // The frontmatter's BARE arc id becomes the `asset:` pointer every other containment stamp uses,
  // so the arc surface's ADR leg is an ordinary pointer query rather than a bespoke string compare.
  assert.equal(row["arcRef"], "asset:decision-log-home-arc");
  // The body is the whole document from its H1 down — the shape decision that keeps the 23% of
  // records carrying non-canonical headings intact.
  assert.ok(String(row["body"]).startsWith("# ADR-0403: "));
  assert.ok(String(row["body"]).includes("## Context"));

  const proposed = (await store.getDoc("adr-0404"))?.doc as Record<string, unknown>;
  assert.equal(proposed["status"], "proposed");
  assert.equal(proposed["decided"], undefined, "a record with no decided date does not gain one");
});

test("load-decisions-lifts-body-cross-links-into-references: the guarded rot class does not go unguarded", async () => {
  // `adr-link-integrity` dies with the files (a relative link between FILES means nothing between
  // ROWS). The census names the risk: the migration must not trade a guarded rot class for an
  // unguarded one. These refs land where `referential-integrity` already looks.
  const dir = await fakeDecisionsDir({ "0403-a.md": ACCEPTED });
  const store = new InMemoryStore();
  await loadDecisions(store, dir);

  const row = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  // BOTH link shapes in the fixture resolve — a bare `0302-…md` and a `../decisions/0139-…md`.
  assert.deepEqual(row["references"], ["asset:adr-0302", "asset:adr-0139"]);
});

test("load-decisions-cross-links-are-pure-and-drop-self-references: a contents link is not a citation", () => {
  assert.deepEqual(crossLinkedDecisionRefs("see [x](0223-a.md) and [y](docs/decisions/0020-b.md)", 1), [
    "asset:adr-0223",
    "asset:adr-0020",
  ]);
  assert.deepEqual(crossLinkedDecisionRefs("[me](0403-self.md)", 403), [], "self-links are dropped");
  assert.deepEqual(
    crossLinkedDecisionRefs("[a](0223-x.md) [again](0223-y.md)", 1),
    ["asset:adr-0223"],
    "a decision cited twice is one citation",
  );
  assert.deepEqual(crossLinkedDecisionRefs("[note](../research/a-note.md)", 1), [], "non-decisions are not lifted");
});

test("load-decisions-is-idempotent-and-preserves-createdAt: a second pass does not rewrite birth dates", async () => {
  const dir = await fakeDecisionsDir({ "0403-a.md": ACCEPTED });
  const store = new InMemoryStore();

  await loadDecisions(store, dir);
  const first = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  // `decided` is the honest birth date, not the moment the loader happened to run.
  assert.equal(first["createdAt"], "2026-08-21T00:00:00.000Z");

  const again = await loadDecisions(store, dir);
  assert.equal(again.written, 1);
  const second = (await store.getDoc("adr-0403"))?.doc as Record<string, unknown>;
  assert.equal(second["createdAt"], first["createdAt"], "the dual-source window can be reconciled freely");
});

test("load-decisions-refuses-the-whole-run-on-one-bad-file: no half-migrated decision log", async () => {
  // The one outcome worse than not running: a log half in the store and half on disk, with nothing
  // recording which half. The `load_bearing` query would return a smaller set and say nothing.
  const dir = await fakeDecisionsDir({
    "0403-a.md": ACCEPTED,
    "0405-broken.md": "---\nstatus: accepted\nsupersedes_in_part: [12]\n---\n# ADR-0405: Retired key\n",
  });
  const store = new InMemoryStore();

  await assert.rejects(() => loadDecisions(store, dir), /0405-broken\.md: .*unknown frontmatter key/);
  assert.equal(await store.getDoc("adr-0403"), null, "nothing was written before the failure");
});

test("load-decisions-keys-the-row-off-the-filename: a mistyped heading cannot re-key or collide", async () => {
  // The filename is what the ADR-0050 allocator reserved. Keying off the heading would let one typo
  // mint `adr-0122` twice and lose 0353 entirely — silently, since both writes succeed. No committed
  // record disagrees today; this is the guard that keeps it that way.
  const dir = await fakeDecisionsDir({
    "0353-a-capability-declares-where-its-contract-tests-live.md":
      "---\nstatus: accepted\n---\n# ADR-0122: A capability declares where its contract tests live\n",
  });
  const store = new InMemoryStore();
  await loadDecisions(store, dir);

  assert.ok(await store.getDoc("adr-0353"), "keyed off the filename");
  assert.equal(await store.getDoc("adr-0122"), null, "never off the heading");
  const row = (await store.getDoc("adr-0353"))?.doc as Record<string, unknown>;
  assert.equal(row["number"], 353);
  assert.equal(row["title"], "A capability declares where its contract tests live");
});
