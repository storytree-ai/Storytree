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
  setVerbRefusal,
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

function tmp() {
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

// -------------------------------------------------------- the verb that writes

/**
 * `--set` on a command that will not write it.
 *
 * THE TEST THAT MATTERS IS THE `run` ONE BELOW, AND IT ASSERTS TWO THINGS TOGETHER: non-zero exit
 * AND an unchanged store. Either alone stays green against the defect it exists to catch — the old
 * behaviour returned `ok: true` over the artifact's full render while writing nothing, so a test
 * that only asserted the `edit` form WRITES never saw it, and a test that only asserted the store
 * was unchanged would pass on a command refused for some entirely different reason.
 *
 * THE BODIES ARE ASSERTED WHOLE, and that is not belt-and-braces. Asserting a FRAGMENT of this
 * message is vacuous: every one of these bodies opens by QUOTING the shapes it is about, so a
 * `match(body, /--set <field>=<value>/)` is satisfied by the header line and says nothing about the
 * corrected command eleven lines below it. Measured while writing these tests — a deliberately
 * broken `fieldOfSet` emitted `--set not a field assignmen=<value>` and the fragment assertion
 * passed. The message IS the deliverable here (a caller reads it to recover a write that did not
 * happen), so it is pinned line by line.
 */

/** Everything above the corrected command in the id-addressed refusal. */
const ID_READ_HEAD = [
  "`--set <field>=<value>` WRITES, and `storytree library artifact <id>` is a READ.",
  "",
  "NOTHING WAS WRITTEN. This is refused rather than ignored because ignoring it is the whole",
  "defect: the read exits 0 and prints the artifact's full render, which is also what a successful",
  "write prints, so a dropped `--set` is indistinguishable from a landed one. Measured twice — a",
  "six-field batch that wrote nothing while its script logged WROTE six times, and a seeded",
  "`dependsOn` cycle that never entered the store, after which the rung under test reported PASS",
  "over a state nobody had created.",
  "",
  "THE FIX IS ONE WORD — the `edit` verb, between `artifact` and the id:",
  "",
];

/** The tail appended only when a value could not be re-typed portably. */
const ELISION_NOTE = [
  "",
  "(a value above is shown as `<value>`: it needs shell quoting, and the quoting differs",
  "between the shells this repo runs on. Re-run YOUR command with `edit` added — or send the",
  "value from a file, which no shell can cut: `--set <field>=@field.txt`.)",
];

/** The whole id-addressed refusal, for a corrected command line and an optional elision note. */
function idReadRefusal(corrected: string, note: readonly string[] = []): string {
  return [...ID_READ_HEAD, `    ${corrected}`, ...note].join("\n");
}

/** The whole refusal for a command that names no artifact to correct. */
function genericRefusal(spelled: string): string {
  return [
    `\`--set <field>=<value>\` WRITES an artifact's fields, and \`${spelled}\` is not that write.`,
    "",
    "Nothing was written. It is refused rather than ignored because an ignored `--set` runs the",
    "command it was attached to and exits 0, which is indistinguishable from the write landing.",
    "",
    "the verbs that honour it:",
    "",
    "    storytree library artifact edit <id> --set <field>=<value> --pg",
  ].join("\n");
}

test("setVerbRefusal passes the verb that writes, and any command carrying no --set", () => {
  assert.equal(
    setVerbRefusal({
      positionals: ["library", "artifact", "edit", "an-agent"],
      sets: ["whatItIs=x"],
    }),
    null,
  );
  assert.equal(setVerbRefusal({ positionals: ["library", "artifact", "an-agent"], sets: [] }), null);
});

test("setVerbRefusal prints the caller's own corrected command, values and order preserved", () => {
  assert.equal(
    setVerbRefusal({
      positionals: ["library", "artifact", "adr-0403"],
      sets: ["status=accepted", "number=403"],
    }),
    idReadRefusal(
      "storytree library artifact edit adr-0403 --set status=accepted --set number=403 --pg",
    ),
  );
});

test("setVerbRefusal elides a value no shell quoting would survive, rather than mis-quoting it", () => {
  const body = setVerbRefusal({
    positionals: ["library", "artifact", "an-agent"],
    sets: ['whatItIs=prose with "quotes" and spaces'],
  });
  assert.equal(
    body,
    idReadRefusal(
      "storytree library artifact edit an-agent --set whatItIs=<value> --pg",
      ELISION_NOTE,
    ),
  );
  // The elided form must not smuggle the raw value out anyway — that is the mis-quoting it avoids.
  assert.doesNotMatch(body ?? "", /prose with/);
});

test("setVerbRefusal renders `<field>` for a --set argument that names no field at all", () => {
  assert.equal(
    setVerbRefusal({
      positionals: ["library", "artifact", "an-agent"],
      sets: ["not a field assignment"],
    }),
    idReadRefusal(
      "storytree library artifact edit an-agent --set <field>=<value> --pg",
      ELISION_NOTE,
    ),
  );
});

test("setVerbRefusal keeps one pasteable value beside one it had to elide", () => {
  // Both branches of the per-argument choice in ONE render, so neither can be mutated into the
  // other without a visible difference.
  assert.equal(
    setVerbRefusal({
      positionals: ["library", "artifact", "an-agent"],
      sets: ["status=accepted", "whatItIs=two words"],
    }),
    idReadRefusal(
      "storytree library artifact edit an-agent --set status=accepted --set whatItIs=<value> --pg",
      ELISION_NOTE,
    ),
  );
});

test("setVerbRefusal refuses --set on a verb that is not the id-addressed read either", () => {
  // `library artifact new` takes a whole doc; `arc edit` takes named prose flags. Both PARSED
  // `--set` and dropped it, which is the same silence in a different place.
  assert.equal(
    setVerbRefusal({ positionals: ["library", "artifact", "new"], sets: ["title=x"] }),
    genericRefusal("library artifact"),
  );
  assert.equal(
    setVerbRefusal({ positionals: ["arc", "edit", "an-arc"], sets: ["title=x"] }),
    genericRefusal("arc edit"),
  );
  // A command that reached only its area: the absent sub is DROPPED, not joined as a blank.
  assert.equal(
    setVerbRefusal({ positionals: ["arc"], sets: ["title=x"] }),
    genericRefusal("arc"),
  );
});

/**
 * The allowlist match and the id-read test are CONJUNCTIONS, and a conjunction is only proven by
 * falsifying each term on its own — otherwise a mutant that drops one term is invisible, because
 * some other term is false in every case the suite happens to exercise.
 */
test("setVerbRefusal's allowlist match needs area AND sub AND verb, each falsifiable alone", () => {
  const sets = ["title=x"];
  // Right verb, right area, WRONG sub — `library tree edit` is not the write.
  assert.equal(
    setVerbRefusal({ positionals: ["library", "tree", "edit"], sets }),
    genericRefusal("library tree"),
  );
  // Right verb, right sub, WRONG area.
  assert.equal(
    setVerbRefusal({ positionals: ["arc", "artifact", "edit"], sets }),
    genericRefusal("arc artifact"),
  );
  // Right area, right sub, WRONG verb — this one is the id-addressed read, so it gets the
  // corrected command rather than the generic list.
  assert.equal(
    setVerbRefusal({ positionals: ["library", "artifact", "an-agent"], sets }),
    idReadRefusal("storytree library artifact edit an-agent --set title=x --pg"),
  );
});

test("the id-read test needs area AND sub AND a present, non-verb third, each falsifiable alone", () => {
  const sets = ["title=x"];
  // area is library but sub is not artifact -> names no artifact, so no corrected command.
  assert.equal(
    setVerbRefusal({ positionals: ["library", "tree", "focus"], sets }),
    genericRefusal("library tree"),
  );
  // sub is artifact but area is not library.
  assert.equal(
    setVerbRefusal({ positionals: ["arc", "artifact", "some-id"], sets }),
    genericRefusal("arc artifact"),
  );
  // third is ABSENT: `library artifact --set …` names no id, so there is nothing to splice `edit`
  // in front of. Forcing this term true would print the id as `undefined`.
  assert.equal(
    setVerbRefusal({ positionals: ["library", "artifact"], sets }),
    genericRefusal("library artifact"),
  );
  // third is a VERB rather than an id — every one of them, so none can be dropped from the set.
  for (const verb of ["list", "new", "edit", "retire", "comment", "history"]) {
    const body = setVerbRefusal({ positionals: ["library", "artifact", verb], sets });
    // `edit` is the write and returns null; the other five are reads that refuse generically.
    assert.equal(body, verb === "edit" ? null : genericRefusal("library artifact"), verb);
  }
});

test("a verbless --set REFUSES through run, and the store is untouched (the silent no-op)", async () => {
  const store = await withProse("the original prose");
  const env = await run(
    ["library", "artifact", "an-agent", "--set", "whatItIs=rewritten", "--pg"],
    { store, writable: true },
  );
  // Non-zero exit: `main` maps `ok: false` to 1. Before this guard the same command returned
  // `ok: true` with the artifact's full render as its body — exit 0, and nothing written.
  assert.equal(env.ok, false);
  assert.equal(await stored(store), "the original prose");
  assert.equal(
    env.body,
    idReadRefusal("storytree library artifact edit an-agent --set whatItIs=rewritten --pg"),
  );
  assert.deepEqual(env.next, ["storytree library artifact edit <id> --set <field>=<value> --pg"]);
});

test("the same command WITH the edit verb writes — so the refusal is about the verb, not the flag", async () => {
  const store = await withProse("the original prose");
  const env = await run(
    ["library", "artifact", "edit", "an-agent", "--set", "whatItIs=rewritten", "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.equal(await stored(store), "rewritten");
});

test("the verbless refusal fires BEFORE @path expansion, so a doomed command reads no file", async () => {
  const store = await withProse("the original prose");
  const env = await run(
    ["library", "artifact", "an-agent", "--set", "whatItIs=@/definitely/not/here.txt", "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  // The SET-VERB refusal, not the unreadable-path one: the ordering is what lets the corrected
  // command echo the `@path` the caller typed rather than the contents it never read.
  assert.equal(
    env.body,
    idReadRefusal(
      "storytree library artifact edit an-agent --set whatItIs=@/definitely/not/here.txt --pg",
    ),
  );
});

test("--help still wins over the verbless --set refusal", async () => {
  const env = await run(["library", "artifact", "--set", "whatItIs=x", "--help"], {
    store: await withProse("prose"),
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree library artifact —/);
});

// ------------------------------------------- the emissions that taught the broken form

/**
 * THE CLI USED TO EMIT THE BROKEN SHAPE ITSELF, and that is how the second incident happened: the
 * verbless command was copied from this tool's own footer one command earlier. So each surface that
 * prints a `--set` command is pinned to the `edit` form here — a fix in the dispatch alone would
 * leave the tool still teaching the shape it now refuses.
 */

test("the --out footer and its next: line both spell the edit verb", async () => {
  const store = await withProse("prose");
  const t = tmp();
  try {
    const file = path.join(t.dir, "field.txt");
    const env = await run(["library", "artifact", "an-agent", "--raw", "whatItIs", "--out", file], {
      store,
    });
    assert.equal(env.ok, true);
    const write = `storytree library artifact edit an-agent --set whatItIs=@${file} --pg`;
    assert.ok(env.body.includes(`  ${write}`), env.body);
    assert.deepEqual(env.next, [write]);
  } finally {
    t.cleanup();
  }
});

test("artifact --help teaches the long-prose round trip with the edit verb on the write leg", async () => {
  const env = await run(["library", "artifact", "--help"], { store: await withProse("prose") });
  assert.ok(
    env.body.includes("  storytree library artifact edit <id> --set <field>=@field.txt --pg"),
    env.body,
  );
});

test("the three write-fidelity refusals all name the edit form as the way to say it on purpose", () => {
  const banner = bannerRefusal({ what: "the value", value: PNPM_BANNER + "prose" });
  assert.ok(banner !== null);
  assert.ok(
    banner.includes("    storytree library artifact edit <id> --set <field>=@field.txt --pg"),
    banner,
  );

  const stale = "x".repeat(TRUNCATION_FLOOR * 4);
  const truncated = truncationRefusal({
    field: "whatItIs",
    submitted: stale.slice(0, TRUNCATION_FLOOR),
    stored: stale,
    inline: true,
  });
  assert.ok(truncated !== null);
  assert.ok(
    truncated.includes("    storytree library artifact edit <id> --set whatItIs=@field.txt --pg"),
    truncated,
  );

  const stray = strayPositionalRefusal({
    positionals: ["library", "artifact", "edit", "an-agent", "stray", "words"],
    hasProseValue: true,
  });
  assert.ok(stray !== null);
  assert.ok(
    stray.includes("    storytree library artifact edit <id> --set <field>=@field.txt --pg"),
    stray,
  );
});

test("the banner and truncation refusals point their next: lines at the edit form too", async () => {
  const store = await withProse("the original prose that is quite long and will be prefixed away");
  const banner = await run(
    ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=${PNPM_BANNER}new`, "--pg"],
    { store, writable: true },
  );
  assert.equal(banner.ok, false);
  assert.deepEqual(banner.next, [
    "storytree library artifact an-agent --raw whatItIs --out whatItIs.txt --pg",
    "storytree library artifact edit an-agent --set whatItIs=@whatItIs.txt --pg",
  ]);

  const long = "y".repeat(TRUNCATION_FLOOR * 4);
  const store2 = await withProse(long);
  const cut = await run(
    ["library", "artifact", "edit", "an-agent", "--set", `whatItIs=${long.slice(0, TRUNCATION_FLOOR)}`, "--pg"],
    { store: store2, writable: true },
  );
  assert.equal(cut.ok, false);
  assert.deepEqual(cut.next, [
    "storytree library artifact an-agent --raw whatItIs --out whatItIs.txt --pg",
    "storytree library artifact edit an-agent --set whatItIs=@whatItIs.txt --pg",
    "storytree library artifact history an-agent --field whatItIs --pg",
  ]);
});
