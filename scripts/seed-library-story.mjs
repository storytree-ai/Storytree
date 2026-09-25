// `pnpm seed:library-story`: put this repo's own library story (stories/library.md) into the
// project `storytree` in the desktop app's library (~/.storytree/0.3/pgdata), then run the library's
// tests and record each contract's VERIFIED health from what they showed.
//
// The app's Postgres is started here, on the app's own data directory, and stopped again at the
// end. While the app is running it holds that directory, so the seed says so and exits non-zero:
// quit the app first. A second run updates the story in place and never duplicates it.
//
// Only the verified column is written. The reported column is what an agent says through the agent
// link, and no agent has reported yet: showing that honestly is the point of the two columns.
// The rules for what counts as passing live in scripts/library-seed.mjs.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connect } from "@storytree/library";
import { DataDirInUseError, start } from "@storytree/local-postgres";

import { APP_OWNER, appHome } from "../apps/desktop/src/home.ts";
import { contractsCoveredBy, judge, parseJunit, parseStory, recordHealth, syncStory, VERIFIED_BY } from "./library-seed.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "storytree";
const STORY_FILE = "stories/library.md";
const LIBRARY_SRC = path.join(root, "packages", "library", "src");
const LIBRARY_TESTS = "packages/library/src/**/*.test.ts";
const SEED = "pnpm seed:library-story";

let server; // the app's Postgres, while it runs
process.once("SIGINT", () => {
  console.error("\nseed: interrupted; stopping Postgres");
  void (server?.stop() ?? Promise.resolve()).finally(() => process.exit(130));
});

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`\nseed: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  },
);

async function main() {
  const home = appHome();
  // Read the story first, so a broken file fails before anything starts.
  const story = parseStory(readFileSync(path.join(root, STORY_FILE), "utf8"));
  const contracts = story.capabilities.flatMap((capability) => capability.contracts.map((contract) => contract.number));
  console.log(`${STORY_FILE}: "${story.title}", ${story.capabilities.length} capabilities, ${contracts.length} contracts`);
  console.log(`the app's library: ${home.pgdata}`);

  try {
    server = await start({ dataDir: home.pgdata, owner: SEED, log: (message) => console.log(`Postgres: ${message}`) });
  } catch (error) {
    if (!(error instanceof DataDirInUseError)) throw error;
    console.error(
      error.owner === APP_OWNER
        ? `\nThe storytree 0.3 app is running (pid ${error.pid}) and holds its library in ${home.pgdata}.\n` +
            `Quit the app, then run \`${SEED}\` again.`
        : `\nThe app's library in ${home.pgdata} is in use by process ${error.pid}` +
            `${error.owner === undefined ? "" : ` (${error.owner})`}. When it has finished, run \`${SEED}\` again.`,
    );
    return 1;
  }

  let storytree;
  try {
    storytree = await connect({ url: server.url });
    const existed = (await storytree.listProjects()).includes(PROJECT);
    const library = await storytree.openProject(PROJECT);
    console.log(`project "${PROJECT}": ${existed ? "opened" : "created"}`);

    const synced = await syncStory(library, story, { source: STORY_FILE });
    const { capabilities: caps, contracts: ks } = synced.counts;
    console.log(`story "${story.title}": ${synced.counts.story}`);
    console.log(`capabilities: ${caps.added} added, ${caps.updated} updated, ${caps.unchanged} unchanged, ${caps.retired} retired`);
    console.log(
      `contracts: ${ks.added} added, ${ks.replaced} replaced (wording changed), ${ks.unchanged} unchanged, ${ks.retired} retired`,
    );
    for (const note of synced.notes) console.log(`note: ${note}`);

    console.log(`\nrunning the library's tests (${LIBRARY_TESTS}, junit reporter) …`);
    const run = await runLibraryTests();
    if (run.results === undefined) {
      console.error(`\nThe test run (exit code ${run.code}) produced no report, so no health was recorded.`);
      return 1;
    }
    const passedCount = run.results.filter(({ status }) => status === "passed").length;
    const failedCount = run.results.filter(({ status }) => status === "failed").length;
    const skippedCount = run.results.filter(({ status }) => status === "skipped").length;
    console.log(`tests: ${run.results.length} results: ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped`);

    const { verdicts, unmapped, crashedFiles } = judge({
      contracts,
      results: run.results,
      coverage: (file) => contractsCoveredBy(file, { root: LIBRARY_SRC }),
      show: (file) => path.relative(root, file),
    });
    for (const { file, contracts: held } of crashedFiles) {
      console.log(
        `\n${path.relative(root, file)} produced no results: its process died before running any test (a known flake).\n` +
          `  Its contracts are left not checked, not failed: ${held.join(", ") || "(none found)"}. Run the seed again to check them.`,
      );
    }
    if (unmapped.length > 0) {
      console.log(`\n${unmapped.length} test(s) name no contract of the story, so they count for none:`);
      for (const result of unmapped) console.log(`  ${result.status.padEnd(7)} ${result.name}`);
    }

    console.log(`\nverified health, by "${VERIFIED_BY}":`);
    for (const capability of story.capabilities) {
      console.log(`  ${capability.title}`);
      for (const { number } of capability.contracts) {
        const verdict = verdicts.get(number);
        let line = `    ${number.padEnd(5)} ${verdict.state.padEnd(12)} ${verdict.note ?? verdict.reason ?? ""}`;
        if (verdict.state === "not-checked") {
          const earlier = (await library.health(synced.contractIds.get(number))).verified;
          if (earlier.state !== "not-checked") line += `; its earlier entry (${earlier.state}, ${earlier.at}) is left as it was`;
        }
        console.log(line);
      }
    }
    const written = await recordHealth(library, synced.contractIds, verdicts);
    console.log(
      `\nrecorded: ${written.passing} passing, ${written.failing} failing; ` +
        `${written.notChecked} not checked (nothing written for those). The reported column is untouched.`,
    );
    await library.close();
    return 0;
  } finally {
    await storytree?.close();
    await server.stop();
  }
}

/** Run the library's tests through the test harness (its own throwaway Postgres), reading their junit report. */
async function runLibraryTests() {
  const work = mkdtempSync(path.join(tmpdir(), "storytree-seed-"));
  const report = path.join(work, "library-tests.xml");
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import", "tsx",
          path.join(root, "scripts", "test.mjs"),
          "--test-reporter=junit",
          `--test-reporter-destination=${report}`,
          LIBRARY_TESTS,
        ],
        { cwd: root, stdio: "inherit" },
      );
      child.on("error", reject);
      child.on("exit", (exitCode) => resolve(exitCode ?? 1));
    });
    const xml = existsSync(report) ? readFileSync(report, "utf8") : "";
    return { code, results: xml.includes("<testsuites") ? parseJunit(xml) : undefined };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
