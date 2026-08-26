// Attribution probe — the re-runnable proof that per-test mutation-kill attribution works.
//
// This is NOT a mutation-score measurement and not a gate rung. Its only job is to answer
// "does `killedBy` name the test that actually killed this mutant?" against a fixture whose
// expected answers are known in advance (the hand-written expectations in attribution-probe/verify-attribution.mjs).
//
// Run:  pnpm mutation:attribution-probe
//
// Traps this config already accounts for (docs/research/stryker-bun-attribution-2026-08-26.md):
//   - `tsconfigFile` deliberately points at a path that DOES NOT EXIST: typescript@7 exports no
//     compiler API (ADR-0400 D3), so Stryker's tsconfig preprocessor throws if it finds one.
//   - the plugin is not in the `@stryker-mutator/*` default plugin scope, so it is named explicitly.
//   - `coverageAnalysis: "perTest"` is what makes per-test coverage (and therefore attribution)
//     available at all; with it off, every mutant reruns the whole suite and attributes nothing.
export default {
  testRunner: "bun",
  plugins: ["@hughescr/stryker-bun-runner"],
  coverageAnalysis: "perTest",
  mutate: ["attribution-probe/src/**/*.ts", "!attribution-probe/src/**/*.test.ts"],
  bun: { testFiles: ["attribution-probe/src/subject.test.ts"] },
  // disableBail is REQUIRED for a COMPLETE killing set. With bail on (Stryker's default) the
  // plugin stops at the first failing test, so killedBy holds only whichever covering test ran
  // first -- which for a diff-scoped rung could omit the branch's own new test entirely.
  disableBail: true,
  reporters: ["json", "clear-text"],
  jsonReporter: { fileName: "reports/attribution-probe.json" },
  concurrency: 4,
  timeoutMS: 60000,
  tempDirName: ".stryker-tmp",
  tsconfigFile: "stryker-no-tsconfig.json",
};
