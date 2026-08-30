/**
 * The harness ingest RECEIPT's durable half (`ingest-receipt.ts`), story
 * `context-traversal-transcript`, ADR-0484 D5 deliverable 4.
 *
 * The two ingest suites already prove the receipt end-to-end through their own runs. What is left
 * here is what those cannot reach: the states a real trace directory arrives in — no file, a file
 * that is not JSON, a file that is JSON but not a receipt, and a directory that does not exist yet.
 * Each is written so the DANGEROUS collapse is what reds it: a corrupt sidecar must never be read as
 * evidence that somebody looked.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { describeHarnessIngest, harnessIngestReceiptFileName } from "@storytree/context-traversal-telemetry";

import { readHarnessIngestReceipt, recordHarnessIngestRun } from "./ingest-receipt.js";

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ingest-receipt-${prefix}-`));
}

test("a session with no receipt reads null, and that renders as NEVER RUN", () => {
  const traceDir = freshDir("missing");
  assert.equal(readHarnessIngestReceipt(traceDir, "never-touched"), null);
  assert.match(describeHarnessIngest(readHarnessIngestReceipt(traceDir, "never-touched")), /NEVER RUN/);
});

test("a receipt that will not parse reads null — a corrupt sidecar never certifies a look", () => {
  const traceDir = freshDir("corrupt");
  // Not JSON at all.
  fs.writeFileSync(path.join(traceDir, harnessIngestReceiptFileName("torn")), "{not json");
  assert.equal(readHarnessIngestReceipt(traceDir, "torn"), null);

  // JSON, but not a receipt — the wrong shape must fail the SAME way, or a half-written file of
  // some other kind would be read as a receipt with no runs in it.
  fs.writeFileSync(path.join(traceDir, harnessIngestReceiptFileName("wrong")), JSON.stringify({ nope: 1 }));
  assert.equal(readHarnessIngestReceipt(traceDir, "wrong"), null);

  // A run carrying a negative count is refused too, rather than being clamped into a plausible one.
  fs.writeFileSync(
    path.join(traceDir, harnessIngestReceiptFileName("negative")),
    JSON.stringify({ runs: { "host-transcript-occupancy": { at: "2026-08-31T00:00:00Z", observed: -3, appended: 0 } } }),
  );
  assert.equal(readHarnessIngestReceipt(traceDir, "negative"), null);
});

test("a run recorded over a corrupt receipt repairs it rather than compounding it", () => {
  const traceDir = freshDir("repair");
  fs.writeFileSync(path.join(traceDir, harnessIngestReceiptFileName("torn")), "{not json");

  assert.equal(
    recordHarnessIngestRun({
      traceDir,
      sessionId: "torn",
      adapter: "host-transcript-occupancy",
      observed: 4,
      appended: 4,
      at: "2026-08-31T10:00:00.000Z",
    }),
    true,
  );

  assert.deepEqual(readHarnessIngestReceipt(traceDir, "torn")?.runs["host-transcript-occupancy"], {
    at: "2026-08-31T10:00:00.000Z",
    observed: 4,
    appended: 4,
  });
});

test("recording creates the trace directory when nothing has written one yet", () => {
  // The ingest can be the first thing that ever touched this directory — a run that recovered
  // nothing appends no event, so the sink never created it.
  const traceDir = path.join(freshDir("mkdir"), "nested", "traces");
  assert.equal(fs.existsSync(traceDir), false);

  assert.equal(
    recordHarnessIngestRun({
      traceDir,
      sessionId: "first",
      adapter: "host-transcript-decision-read",
      observed: 0,
      appended: 0,
      at: "2026-08-31T11:00:00.000Z",
    }),
    true,
  );
  assert.equal(readHarnessIngestReceipt(traceDir, "first")?.runs["host-transcript-decision-read"]?.observed, 0);
});

test("a receipt that cannot be written returns false rather than throwing", () => {
  // A path that cannot be a directory: the trace dir is a FILE. The ingest must survive it.
  const parent = freshDir("unwritable");
  const traceDir = path.join(parent, "not-a-directory");
  fs.writeFileSync(traceDir, "");

  assert.equal(
    recordHarnessIngestRun({
      traceDir,
      sessionId: "doomed",
      adapter: "host-transcript-occupancy",
      observed: 1,
      appended: 1,
      at: "2026-08-31T12:00:00.000Z",
    }),
    false,
  );
});

test("the receipt is one line of JSON beside the trace, under the shared spelling", () => {
  const traceDir = freshDir("shape");
  recordHarnessIngestRun({
    traceDir,
    sessionId: "shaped",
    adapter: "host-transcript-occupancy",
    observed: 2,
    appended: 1,
    at: "2026-08-31T13:00:00.000Z",
  });

  const raw = fs.readFileSync(path.join(traceDir, "shaped.ingest.json"), "utf8");
  assert.deepEqual(JSON.parse(raw), {
    runs: { "host-transcript-occupancy": { at: "2026-08-31T13:00:00.000Z", observed: 2, appended: 1 } },
  });
  // It is NOT a `.jsonl` trace and must never be picked up as one by the sink's own directory walk.
  assert.equal(fs.existsSync(path.join(traceDir, "shaped.jsonl")), false);
});
