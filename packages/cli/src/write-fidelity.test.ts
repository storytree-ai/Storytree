import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import {
  bannerRefusal,
  runScriptBannerOf,
  strayPositionalRefusal,
  truncationRefusal,
  TRUNCATION_FLOOR,
} from "./write-fidelity.js";

/**
 * The write-fidelity proofs (`guidance-write-path-integrity-arc`, ADR-0361).
 *
 * The pure predicates are asserted directly; the three wired behaviours are asserted through `run`,
 * over an InMemoryStore, exactly as `main` drives it. The round trip at the foot of this file is the
 * one the increment named as "the test that matters": read a field, write it back unmodified, and
 * assert the stored value is unchanged.
 */

const PNPM_BANNER = [
  "",
  "> storytree@0.0.0 storytree C:\\code\\storytree",
  '> node packages/cli/launch.mjs "library" "artifact" "session-orchestrator" "--raw=workflow"',
  "",
].join("\n");

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "storytree-fidelity-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * A store holding one schema-valid artifact whose `whatItIs` is the long prose field under test.
 *
 * A `definition` rather than the `agent` of the real incident, because the edit path VALIDATES the
 * merged doc and the definition schema is the smaller fixture — the guards read a field's stored
 * string, not its kind, so the shape under test is identical.
 */
async function withProse(prose: string): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "an-agent",
    kind: "definition",
    doc: {
      kind: "definition",
      id: "an-agent",
      title: "A thing",
      oneLine: "one line",
      description: "d",
      whatItIs: prose,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    },
  });
  return store;
}

/** The stored prose field, read back from the store. */
async function stored(store: InMemoryStore): Promise<string> {
  return ((await store.getDoc("an-agent"))?.doc as { whatItIs: string }).whatItIs;
}

// ---------------------------------------------------------------- the banner

test("runScriptBannerOf names a pnpm run banner at the head of a captured value", () => {
  assert.match(runScriptBannerOf(PNPM_BANNER + "the real prose") ?? "", /^> storytree@0\.0\.0/);
  assert.equal(runScriptBannerOf("yarn run v1.22.19\n$ node x\nthe prose"), "yarn run v1.22.19");
});

test("runScriptBannerOf passes ordinary prose, including prose that quotes a shell line", () => {
  assert.equal(runScriptBannerOf("The workflow starts here."), null);
  // A banner is PREPENDED, never interleaved: a `>` line below real content is the author's own.
  assert.equal(runScriptBannerOf("Run it like this:\n> storytree@0.0.0 storytree C:\\x"), null);
  assert.equal(runScriptBannerOf(""), null);
});

test("bannerRefusal names the offending line and the --out round trip", () => {
  const body = bannerRefusal({ what: 'the value for "workflow"', value: PNPM_BANNER + "prose" });
  assert.ok(body !== null);
  assert.match(body, /> storytree@0\.0\.0/);
  assert.match(body, /--out/);
  assert.equal(bannerRefusal({ what: "x", value: "clean prose" }), null);
});

// ------------------------------------------------------------ the truncation

test("truncationRefusal fires on an INLINE value that is a proper prefix of the stored one", () => {
  const stored = "A".repeat(500);
  const body = truncationRefusal({
    field: "workflow",
    submitted: "A".repeat(200),
    stored,
    inline: true,
  });
  assert.ok(body !== null);
  assert.match(body, /exact PREFIX/);
  assert.match(body, /300 characters short/);
});

test("truncationRefusal leaves the @path channel alone — a file arrived whole, so a prefix is meant", () => {
  assert.equal(
    truncationRefusal({
      field: "workflow",
      submitted: "A".repeat(200),
      stored: "A".repeat(500),
      inline: false,
    }),
    null,
  );
});

test("truncationRefusal ignores a shorter value that is NOT a prefix — that is ordinary curation", () => {
  // The shape the owner refused a guard for on 2026-08-12: shortening a guidance section is normal
  // wanted work. Only the PREFIX relation carries the cut signal.
  assert.equal(
    truncationRefusal({
      field: "workflow",
      submitted: "B".repeat(100),
      stored: "A".repeat(500),
      inline: true,
    }),
    null,
  );
});

test("truncationRefusal ignores a loss below the floor — short-field edits stay free", () => {
  const stored = "A".repeat(200);
  assert.equal(
    truncationRefusal({
      field: "title",
      submitted: stored.slice(0, stored.length - (TRUNCATION_FLOOR - 1)),
      stored,
      inline: true,
    }),
    null,
  );
});

// ------------------------------------------------------- the stray positional

test("strayPositionalRefusal fires when a prose-carrying write brings words no verb reads", () => {
  const body = strayPositionalRefusal({
    // The reproduced PowerShell cut: the tail of the value arrives as bare words.
    positionals: ["library", "artifact", "edit", "an-agent", "quoted", " and more prose"],
    hasProseValue: true,
  });
  assert.ok(body !== null);
  assert.match(body, /2 argument\(s\) no verb here reads/);
  assert.match(body, /"quoted"/);
});

test("strayPositionalRefusal is silent without a prose value, and on the free-text areas", () => {
  assert.equal(
    strayPositionalRefusal({ positionals: ["a", "b", "c", "d", "e"], hasProseValue: false }),
    null,
  );
  assert.equal(
    strayPositionalRefusal({
      positionals: ["orchestrate", "orient", "and", "propose", "the", "next", "unit"],
      hasProseValue: true,
    }),
    null,
  );
  assert.equal(
    strayPositionalRefusal({
      positionals: ["library", "artifact", "edit", "an-agent"],
      hasProseValue: true,
    }),
    null,
  );
});

// ------------------------------------------------------------- wired into run

test("edit refuses a --set value carrying a run banner, on either channel", async () => {
  const store = await withProse("the original prose");
  const env = await run(
    ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=${PNPM_BANNER}new prose`, "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /run banner/);
  assert.equal(await stored(store), "the original prose");
});

test("edit refuses an inline --set that is a prefix of the stored value, and stores nothing", async () => {
  const full = "step one. ".repeat(60);
  const store = await withProse(full);
  const env = await run(
    ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=${full.slice(0, 100)}`, "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /exact PREFIX/);
  assert.equal(await stored(store), full);
});

test("the same prefix write LANDS from a file — the refusal redirects, it does not block", async () => {
  const full = "step one. ".repeat(60);
  const store = await withProse(full);
  const t = tmp();
  try {
    const file = path.join(t.dir, "prose.txt");
    writeFileSync(file, full.slice(0, 100), "utf8");
    const env = await run(
      ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=@${file}`, "--pg"],
      { store, writable: true },
    );
    assert.equal(env.ok, true);
    assert.equal(await stored(store), full.slice(0, 100));
  } finally {
    t.cleanup();
  }
});

test("a prose-carrying write with stray positionals is refused before anything is stored", async () => {
  const store = await withProse("the original prose");
  const env = await run(
    // What PowerShell hands over when it ends the value at an inner quote.
    ["library", "artifact", "edit", "an-agent", "--set", "whatItIs=head of the value ", "quoted", " tail", "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no verb here reads/);
  assert.equal(await stored(store), "the original prose");
});

// ------------------------------------------------------------- the round trip

test("--out writes the field's own bytes and nothing else", async () => {
  const prose = "  leading and trailing space kept  \n\nand a blank line above.\n";
  const store = await withProse(prose);
  const t = tmp();
  try {
    const file = path.join(t.dir, "field.txt");
    const env = await run(["library", "artifact", "an-agent", "--raw", "whatItIs", "--out", file], {
      store,
    });
    assert.equal(env.ok, true);
    // Byte-exact: no banner, no envelope, no trailing-newline normalisation.
    assert.equal(readFileSync(file, "utf8"), prose);
    // And it is an ORDINARY envelope on stdout — nothing for a redirect to capture as the value.
    assert.ok(!("raw" in env));
    assert.match(env.body, /wrote \d+ characters/);
  } finally {
    t.cleanup();
  }
});

test("--out without --raw is refused, not dropped — an empty capture written back is a deletion", async () => {
  const t = tmp();
  try {
    const env = await run(
      ["library", "artifact", "an-agent", "--out", path.join(t.dir, "field.txt")],
      { store: await withProse("prose") },
    );
    assert.equal(env.ok, false);
    assert.match(env.body, /has no `--raw`/);
  } finally {
    t.cleanup();
  }
});

test("the documented round trip is byte-exact: --out then --set field=@path leaves the value unchanged", async () => {
  // The increment's own acceptance test. The value carries every shape that made the old redirect
  // path lossy: a leading blank line, an inner double quote, a backtick, and trailing whitespace.
  const prose = [
    "",
    'Step one — the value has "quotes" and `backticks` in it.',
    "",
    "Step two. It ends with trailing space.   ",
  ].join("\n");
  const store = await withProse(prose);
  const t = tmp();
  try {
    const file = path.join(t.dir, "field.txt");
    const readBack = await run(
      ["library", "artifact", "an-agent", "--raw", "whatItIs", "--out", file],
      { store },
    );
    assert.equal(readBack.ok, true);
    const written = await run(
      ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=@${file}`, "--pg"],
      { store, writable: true },
    );
    assert.equal(written.ok, true);
    assert.equal(await stored(store), prose);
  } finally {
    t.cleanup();
  }
});
