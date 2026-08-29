import { test } from "node:test";
import assert from "node:assert/strict";

import {
  foldReadObservations,
  readFloorNotes,
  scrapeArtifactReads,
} from "./corpus-read-record.js";

/** Just the ids a command yielded, sorted — the shape most cases here assert on. */
function idsOf(command: string): string[] {
  return scrapeArtifactReads(command).reads.map((read) => read.id).sort();
}

test("a read is minted for the argv shape, through every launcher spelling", () => {
  assert.deepEqual(idsOf("storytree library artifact merge-ceremony"), ["merge-ceremony"]);
  assert.deepEqual(idsOf("pnpm storytree library artifact merge-ceremony"), ["merge-ceremony"]);
  assert.deepEqual(idsOf("npx tsx packages/cli/src/main.ts library artifact adr-0403"), ["adr-0403"]);
  assert.deepEqual(idsOf("node packages/cli/launch.mjs library artifact adr-0403"), ["adr-0403"]);
});

test("shell noise around a real read does not lose it", () => {
  // Six of eight real store reads measured on this disk carried exactly this noise, which is why
  // the rule reads the shape POSITIVELY rather than refusing unrecognised trailing tokens.
  assert.deepEqual(idsOf("storytree library artifact merge-ceremony 2>&1 | head -30"), ["merge-ceremony"]);
  assert.deepEqual(idsOf("cd /repo && storytree library artifact merge-ceremony; echo done"), ["merge-ceremony"]);
});

test("AN ID APPEARING ANYWHERE ELSE IS A MENTION, NEVER A READ", () => {
  // The 66:1 measurement: matching an id token loosely rather than by argv shape was wrong sixty-six
  // times for every time it was right.
  assert.deepEqual(idsOf('echo "=== merge-ceremony ==="'), []);
  assert.deepEqual(idsOf('git commit -m "cite merge-ceremony"'), []);
  assert.deepEqual(idsOf("storytree arc increment close x --note 'per merge-ceremony'"), []);
});

test("a SHELL VARIABLE is declined, never minted as an artifact", () => {
  // Measured before the guard existed: `$id`, `"$id"` and `$a` were being recorded as artifacts read
  // 108 times, because a sweep loop is how a sweep is written.
  for (const command of [
    'for id in a b; do storytree library artifact "$id"; done',
    "storytree library artifact $id",
    "storytree library artifact ${id}",
  ]) {
    assert.deepEqual(idsOf(command), [], command);
    assert.ok(
      scrapeArtifactReads(command).declinedVerbs.length > 0,
      "the decline must be COUNTED, not swallowed",
    );
  }
});

test("a FLAG is declined — `--help` names no artifact", () => {
  const scrape = scrapeArtifactReads("storytree library artifact --help");
  assert.deepEqual(scrape.reads, []);
  assert.deepEqual(scrape.declinedVerbs, ["library artifact (a flag, no id)"]);
});

test("a WRITE wearing a read's shape is declined", () => {
  for (const command of [
    "storytree library artifact merge-ceremony --set body=@x.txt --pg",
    "storytree library artifact merge-ceremony --file doc.json --pg",
  ]) {
    assert.deepEqual(idsOf(command), [], command);
  }
  assert.deepEqual(idsOf("storytree library artifact edit merge-ceremony --pg"), []);
  assert.deepEqual(idsOf("storytree library artifact new --file doc.json --pg"), []);
});

test("a read of the CHANGE LOG or a SEARCH is not a read of the document", () => {
  assert.deepEqual(idsOf("storytree library artifact history adr-0403"), []);
  assert.deepEqual(idsOf("storytree library artifact list principle"), []);
  assert.deepEqual(idsOf("storytree library artifact retire x --reason y --pg"), []);
});

test("`--raw` is the WEAKER read, and the weakest wins on a repeat", () => {
  assert.deepEqual(scrapeArtifactReads("storytree library artifact x --raw body").reads, [
    { id: "x", strength: "front_matter_read" },
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact x --raw=body").reads, [
    { id: "x", strength: "front_matter_read" },
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact x").reads, [
    { id: "x", strength: "full_payload_read" },
  ]);
  assert.deepEqual(
    scrapeArtifactReads("storytree library artifact x | storytree library artifact x --raw body").reads,
    [{ id: "x", strength: "front_matter_read" }],
    "the weaker reading of the same artifact wins, matching the live observer",
  );
});

test("a command with no read shape at all costs nothing and yields nothing", () => {
  assert.deepEqual(scrapeArtifactReads("pnpm gate"), { reads: [], declinedVerbs: [] });
  assert.deepEqual(scrapeArtifactReads("storytree arc show my-arc"), { reads: [], declinedVerbs: [] });
  assert.deepEqual(scrapeArtifactReads(""), { reads: [], declinedVerbs: [] });
});

test("a `<story>#uat-N` criterion id is a legal id shape", () => {
  assert.deepEqual(idsOf("storytree library artifact library-review#uat-1"), ["library-review#uat-1"]);
});

test("several reads in one command are all recovered", () => {
  assert.deepEqual(
    idsOf("storytree library artifact a && storytree library artifact b; storytree library artifact c"),
    ["a", "b", "c"],
  );
});

test("foldReadObservations keeps the session SET, so a caller can union it", () => {
  const folded = foldReadObservations([
    { id: "a", at: "2026-08-02T00:00:00.000Z", sessionId: "s1" },
    { id: "a", at: "2026-08-01T00:00:00.000Z", sessionId: "s1" },
    { id: "a", at: "2026-08-03T00:00:00.000Z", sessionId: "s2" },
    { id: "b", at: "2026-07-01T00:00:00.000Z", sessionId: "s1" },
  ]);
  const a = folded.get("a")!;
  assert.equal(a.reads, 3, "every observation counts");
  assert.deepEqual([...a.sessions].sort(), ["s1", "s2"], "sessions deduplicate");
  assert.equal(a.firstAt, "2026-08-01T00:00:00.000Z", "earliest wins, whatever the input order");
  assert.equal(a.lastAt, "2026-08-03T00:00:00.000Z");
  assert.equal(folded.get("b")!.reads, 1);
  assert.equal(folded.size, 2);
});

test("folding nothing yields nothing — never a row of zeros", () => {
  assert.equal(foldReadObservations([]).size, 0);
});

test("the floor notes name the manifest-injection floor, which is the one that bites", () => {
  const notes = readFloorNotes();
  assert.ok(notes.length >= 4);
  assert.ok(
    notes.some((note) => note.includes("AGENT MANIFEST")),
    "a zero for an artifact assembled into a prompt every run must be explained, not printed bare",
  );
  assert.ok(notes.some((note) => note.includes("ALLOWLISTED")));
  assert.ok(notes.some((note) => note.includes("PRIMARY CHECKOUT")));
  assert.ok(notes.some((note) => note.includes("CODEX")));
});

test("`library artifact <id>` with NO launcher in front of it is not a read", () => {
  // The launcher index is what anchors the argv. Without that anchor the same three tokens appear in
  // prose and in other commands, and minting a read for them is the loose-match failure.
  assert.deepEqual(idsOf("library artifact merge-ceremony"), []);
  assert.deepEqual(idsOf("echo library artifact merge-ceremony"), []);
  assert.deepEqual(idsOf("rg library artifact ."), []);
});

test("the argv shape must match in ALL THREE positions", () => {
  assert.deepEqual(idsOf("storytree adr artifact merge-ceremony"), [], "wrong area");
  assert.deepEqual(idsOf("storytree library tree merge-ceremony"), [], "wrong sub-verb");
  assert.deepEqual(idsOf("storytree library artifact"), [], "no id at all");
  assert.deepEqual(idsOf("storytree library artifact merge-ceremony"), ["merge-ceremony"]);
});

test("a NEWLINE separates segments, exactly as `&&` and `|` do", () => {
  assert.deepEqual(idsOf("storytree library artifact a\nstorytree library artifact b"), ["a", "b"]);
  assert.deepEqual(idsOf("storytree library artifact a\r\nstorytree library artifact b"), ["a", "b"]);
});

test("a WINDOWS-SPELLED launcher path is recognised", () => {
  // The launcher token is normalised backslash-to-slash before its basename is taken; on this box
  // the command is routinely written either way.
  assert.deepEqual(idsOf("node packages\\cli\\launch.mjs library artifact x"), ["x"]);
  assert.deepEqual(idsOf("npx tsx packages\\cli\\src\\main.ts library artifact x"), ["x"]);
});

test("leading and repeated whitespace does not shift the argv", () => {
  assert.deepEqual(idsOf("   storytree library artifact x"), ["x"]);
  assert.deepEqual(idsOf("storytree  library   artifact    x"), ["x"]);
});

test("the id must match END TO END, so a trailing illegal character is declined", () => {
  assert.deepEqual(idsOf("storytree library artifact abc)"), []);
  assert.deepEqual(idsOf("storytree library artifact abc.md"), []);
  assert.deepEqual(idsOf("storytree library artifact abc"), ["abc"]);
});

test("every decline names WHICH verb it declined", () => {
  assert.deepEqual(scrapeArtifactReads("storytree library artifact history adr-0403").declinedVerbs, [
    "library artifact history",
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact list principle").declinedVerbs, [
    "library artifact list",
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact $id").declinedVerbs, [
    "library artifact (not an id shape)",
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact --help").declinedVerbs, [
    "library artifact (a flag, no id)",
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact x --set body=y").declinedVerbs, [
    "library artifact --set/--file/--json (a write)",
  ]);
});

test("only the tokens AFTER the id are read as flags", () => {
  // `argv.slice(3)` is what stops the verb tokens themselves being scanned, and `flagName` is what
  // makes `--raw body` and `--raw=body` classify alike. An id spelled like a flag name proves both.
  assert.deepEqual(scrapeArtifactReads("storytree library artifact raw --raw=body").reads, [
    { id: "raw", strength: "front_matter_read" },
  ]);
  assert.deepEqual(scrapeArtifactReads("storytree library artifact set").reads, [
    { id: "set", strength: "full_payload_read" },
  ]);
});

test("firstAt and lastAt each move only in their own direction", () => {
  const folded = foldReadObservations([
    { id: "a", at: "2026-08-05T00:00:00.000Z", sessionId: "s" },
    { id: "a", at: "2026-08-09T00:00:00.000Z", sessionId: "s" },
    { id: "a", at: "2026-08-01T00:00:00.000Z", sessionId: "s" },
    { id: "a", at: "2026-08-03T00:00:00.000Z", sessionId: "s" },
  ]);
  const a = folded.get("a")!;
  assert.equal(a.firstAt, "2026-08-01T00:00:00.000Z");
  assert.equal(a.lastAt, "2026-08-09T00:00:00.000Z");
});

test("a single observation makes firstAt and lastAt the same instant", () => {
  const folded = foldReadObservations([{ id: "a", at: "2026-08-05T00:00:00.000Z", sessionId: "s" }]);
  assert.equal(folded.get("a")!.firstAt, "2026-08-05T00:00:00.000Z");
  assert.equal(folded.get("a")!.lastAt, "2026-08-05T00:00:00.000Z");
});

test("the floor notes are real prose, not blank placeholders", () => {
  for (const note of readFloorNotes()) assert.ok(note.trim().length > 20, JSON.stringify(note));
});

test("a wrong-shaped invocation BESIDE a real one is still declined", () => {
  // The cheap prefilter asks for `library artifact` ANYWHERE in the command, so a command whose only
  // invocation has the wrong area never reaches the argv check at all. Only a COMPOUND command puts
  // a wrong-shaped segment past the prefilter — which is exactly how these appear in a transcript.
  assert.deepEqual(idsOf("storytree library artifact a | storytree adr artifact b"), ["a"]);
  assert.deepEqual(idsOf("storytree library artifact a && storytree library tree b"), ["a"]);
  assert.deepEqual(idsOf("storytree library artifact a; storytree library artifact"), ["a"]);
});

test("a bare sub-verb with no id after it mints nothing, even past the prefilter", () => {
  // `library artifact new` / `rename` name a WRITE, and the id slot holds the verb rather than an
  // artifact — so a set that stopped recognising either would mint a read of an artifact called
  // "new".
  assert.deepEqual(idsOf("storytree library artifact a | storytree library artifact new"), ["a"]);
  assert.deepEqual(idsOf("storytree library artifact a | storytree library artifact rename"), ["a"]);
  assert.deepEqual(idsOf("storytree library artifact a | storytree library artifact edit"), ["a"]);
  assert.deepEqual(idsOf("storytree library artifact a | storytree library artifact retire"), ["a"]);
});

test("EACH write flag is refused on its own", () => {
  // Three flags mark a write, and a test that only ever exercises one of them cannot tell a working
  // guard from one that lost the other two.
  assert.deepEqual(idsOf("storytree library artifact x --set body=y"), []);
  assert.deepEqual(idsOf("storytree library artifact x --file doc.json"), []);
  assert.deepEqual(idsOf("storytree library artifact x --json"), []);
  assert.deepEqual(idsOf("storytree library artifact x --pg"), ["x"], "not every flag is a write");
});

test("a FULL read after a RAW one does not upgrade the strength", () => {
  // The weakest reading of one artifact wins, matching the live observer — so the order the two
  // appear in must not change the answer.
  assert.deepEqual(
    scrapeArtifactReads("storytree library artifact x --raw body | storytree library artifact x").reads,
    [{ id: "x", strength: "front_matter_read" }],
  );
  assert.deepEqual(
    scrapeArtifactReads("storytree library artifact x | storytree library artifact x --raw body").reads,
    [{ id: "x", strength: "front_matter_read" }],
  );
});

test("the floor notes each say what they are about, not just name a subject", () => {
  const notes = readFloorNotes();
  assert.ok(
    notes.some((note) => note.includes("AGENT MANIFEST") && note.includes("produces a zero")),
    "the manifest note must state the CONSEQUENCE — that consumption evidence reads as a zero",
  );
  assert.ok(notes.some((note) => note.includes("bounded set of command shapes")));
  assert.ok(notes.some((note) => note.includes("lobby work records nothing")));
});
