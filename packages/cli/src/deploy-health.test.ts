import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyDeployHealth, formatDeployHealth } from "./deploy-health.js";
import type { DeployRun } from "./deploy-health.js";

describe("deploy-health-red-run-classifies-loud", () => {
  it("classifies a completed non-success newest run as a red streak and formats a loud multi-line WARN", () => {
    const runs: DeployRun[] = [
      {
        status: "completed",
        conclusion: "failure",
        updatedAt: "2026-07-10T10:00:00Z",
        url: "https://github.com/org/repo/actions/runs/103",
        databaseId: 103,
      },
      {
        status: "completed",
        conclusion: "timed_out",
        updatedAt: "2026-07-10T09:00:00Z",
        url: "https://github.com/org/repo/actions/runs/102",
        databaseId: 102,
      },
      {
        status: "completed",
        conclusion: "success",
        updatedAt: "2026-07-10T08:00:00Z",
        url: "https://github.com/org/repo/actions/runs/101",
        databaseId: 101,
      },
    ];

    const health = classifyDeployHealth(runs);

    assert.equal(health.verdict, "red");
    assert.equal(health.streak, 2);
    assert.equal(health.redSince, "2026-07-10T09:00:00Z");
    assert.equal(health.latestRedUrl, "https://github.com/org/repo/actions/runs/103");
    assert.equal(health.lastGreenAt, "2026-07-10T08:00:00Z");
    assert.equal(health.inFlight, false);

    const lines = formatDeployHealth(health);

    assert.ok(lines.length > 1, "a red verdict must format as a LOUD multi-line block");
    for (const line of lines) {
      assert.ok(line.startsWith("[check:deploy-health]"), `line must be prefixed: ${line}`);
    }

    const joined = lines.join("\n");
    assert.ok(joined.includes("2"), "streak count must appear somewhere in the block");
    assert.ok(joined.includes("2026-07-10T09:00:00Z"), "red-since timestamp must appear");
    assert.ok(
      joined.includes("https://github.com/org/repo/actions/runs/103"),
      "newest red run URL must appear",
    );
    assert.ok(
      joined.includes("the hosted studio is serving the image from the last green deploy"),
      "the stale-image consequence must be named",
    );
    assert.ok(joined.includes("2026-07-10T08:00:00Z"), "last-green time must appear in the consequence");
    assert.ok(
      joined.includes("gh run view") && joined.includes("--log-failed"),
      "a forensics pointer (gh run view --log-failed) must appear",
    );
  });
});

describe("deploy-health-green-run-classifies-quiet", () => {
  it("classifies a completed success newest run as ok and formats one quiet line noting an in-flight deploy above it", () => {
    const runs: DeployRun[] = [
      {
        status: "in_progress",
        conclusion: null,
        updatedAt: "2026-07-11T12:00:00Z",
        url: "https://github.com/org/repo/actions/runs/205",
      },
      {
        status: "completed",
        conclusion: "success",
        updatedAt: "2026-07-11T11:00:00Z",
        url: "https://github.com/org/repo/actions/runs/204",
        databaseId: 204,
      },
    ];

    const health = classifyDeployHealth(runs);

    assert.equal(health.verdict, "ok");
    assert.equal(health.streak, 0);
    assert.equal(health.redSince, null);
    assert.equal(health.latestRedUrl, null);
    assert.equal(health.lastGreenAt, "2026-07-11T11:00:00Z");
    assert.equal(health.inFlight, true);

    const lines = formatDeployHealth(health);

    assert.equal(lines.length, 1, "an ok verdict must format as a single quiet line");
    const [line] = lines;
    assert.ok(line !== undefined);
    assert.ok(line.startsWith("[check:deploy-health]"));
    assert.ok(line.includes("2026-07-11T11:00:00Z"), "the last-green time must be mentioned");
    assert.ok(
      /in.?flight/i.test(line),
      "the in-flight deploy above the last green run must be noted",
    );
  });

  // Post-PASS supplement (audit-the-signed-verdict): the contract's plain-green case — no
  // in-flight run above the success, so the quiet line carries NO in-flight note.
  it("formats a plain green page (no in-flight run) as one quiet line without an in-flight note", () => {
    const runs: DeployRun[] = [
      {
        status: "completed",
        conclusion: "success",
        updatedAt: "2026-07-11T11:00:00Z",
        url: "https://github.com/org/repo/actions/runs/204",
        databaseId: 204,
      },
      {
        status: "completed",
        conclusion: "failure",
        updatedAt: "2026-07-11T10:00:00Z",
        url: "https://github.com/org/repo/actions/runs/203",
        databaseId: 203,
      },
    ];

    const health = classifyDeployHealth(runs);

    assert.equal(health.verdict, "ok");
    assert.equal(health.inFlight, false);
    assert.equal(health.lastGreenAt, "2026-07-11T11:00:00Z");

    const lines = formatDeployHealth(health);
    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.ok(line !== undefined);
    assert.ok(!/in.?flight/i.test(line), "a plain green line must not claim an in-flight deploy");
  });
});

describe("deploy-health-no-signal-classifies-unknown", () => {
  it("never claims healthy when there is no completed run: empty page and all-in-flight page are both unknown", () => {
    const empty: DeployRun[] = [];
    const emptyHealth = classifyDeployHealth(empty);

    assert.equal(emptyHealth.verdict, "unknown");
    assert.equal(emptyHealth.streak, 0);
    assert.equal(emptyHealth.redSince, null);
    assert.equal(emptyHealth.latestRedUrl, null);
    assert.equal(emptyHealth.lastGreenAt, null);
    assert.equal(emptyHealth.inFlight, false);

    const emptyLines = formatDeployHealth(emptyHealth);
    assert.equal(emptyLines.length, 1, "an unknown verdict must format as a single line");
    const [emptyLine] = emptyLines;
    assert.ok(emptyLine !== undefined);
    assert.ok(emptyLine.startsWith("[check:deploy-health]"));
    assert.ok(emptyLine.includes("UNVERIFIED"));
    assert.ok(!/healthy/i.test(emptyLine), "must never claim healthy");

    const allInFlight: DeployRun[] = [
      {
        status: "in_progress",
        conclusion: null,
        updatedAt: "2026-07-12T00:00:00Z",
        url: "https://github.com/org/repo/actions/runs/301",
      },
      {
        status: "queued",
        conclusion: null,
        updatedAt: "2026-07-11T23:00:00Z",
        url: "https://github.com/org/repo/actions/runs/300",
      },
    ];
    const inFlightHealth = classifyDeployHealth(allInFlight);

    assert.equal(inFlightHealth.verdict, "unknown");
    assert.equal(inFlightHealth.streak, 0);
    assert.equal(inFlightHealth.redSince, null);
    assert.equal(inFlightHealth.latestRedUrl, null);
    assert.equal(inFlightHealth.lastGreenAt, null);
    assert.equal(inFlightHealth.inFlight, false);

    const inFlightLines = formatDeployHealth(inFlightHealth);
    assert.equal(inFlightLines.length, 1);
    const [inFlightLine] = inFlightLines;
    assert.ok(inFlightLine !== undefined);
    assert.ok(inFlightLine.startsWith("[check:deploy-health]"));
    assert.ok(inFlightLine.includes("UNVERIFIED"));
    assert.ok(!/healthy/i.test(inFlightLine), "must never claim healthy");
  });

  // Post-PASS supplement (audit-the-signed-verdict): the contract's totality clause — odd
  // conclusions and unexpected status strings never throw, and a completed run with a null/""
  // conclusion counts as non-success (red), per the completed-run rule.
  it("is total over odd input: null/empty conclusions and unexpected status strings never throw", () => {
    const oddCompleted: DeployRun[] = [
      {
        status: "completed",
        conclusion: null,
        updatedAt: "2026-07-12T02:00:00Z",
        url: "https://github.com/org/repo/actions/runs/402",
      },
      {
        status: "completed",
        conclusion: "",
        updatedAt: "2026-07-12T01:00:00Z",
        url: "https://github.com/org/repo/actions/runs/401",
      },
      {
        status: "completed",
        conclusion: "success",
        updatedAt: "2026-07-12T00:00:00Z",
        url: "https://github.com/org/repo/actions/runs/400",
      },
    ];

    const oddHealth = classifyDeployHealth(oddCompleted);
    assert.equal(oddHealth.verdict, "red", "a completed null/empty conclusion counts as non-success");
    assert.equal(oddHealth.streak, 2);
    assert.equal(oddHealth.lastGreenAt, "2026-07-12T00:00:00Z");
    assert.ok(formatDeployHealth(oddHealth).length > 1);

    const weirdStatus: DeployRun[] = [
      {
        status: "totally-new-github-status",
        conclusion: null,
        updatedAt: "2026-07-12T03:00:00Z",
        url: "https://github.com/org/repo/actions/runs/403",
      },
      {
        status: "completed",
        conclusion: "success",
        updatedAt: "2026-07-12T00:00:00Z",
        url: "https://github.com/org/repo/actions/runs/400",
      },
    ];

    const weirdHealth = classifyDeployHealth(weirdStatus);
    assert.equal(weirdHealth.verdict, "ok", "an unexpected status is treated as non-completed");
    assert.equal(weirdHealth.inFlight, true, "the non-completed run above the success flags in-flight");
    assert.equal(formatDeployHealth(weirdHealth).length, 1);
  });
});
