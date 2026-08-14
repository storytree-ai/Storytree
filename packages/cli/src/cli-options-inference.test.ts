import test from "node:test";
import assert from "node:assert/strict";

import { CLI_OPTIONS, parseCliArgs, type CliValues } from "./commands.js";

/**
 * ONE hand-kept declaration per CLI flag (`tool-signal-gaps-arc`, from friction
 * `cli-flag-needs-two-hand-kept-declarations`).
 *
 * Adding a flag used to need TWO declarations in `commands.ts`: the runtime `CLI_OPTIONS` table AND
 * a ~110-line structural `values` annotation inside `run()` that mirrored it by hand. Omitting the
 * second did not fail at the declaration — it failed as four `TS2339`s naming the DISPATCH lines
 * that read the field, so every error pointed AWAY from the fix. `values` is now inferred from
 * `CLI_OPTIONS` via {@link parseCliArgs}, making the table the single source of truth.
 *
 * The load-bearing assertions here are the TYPE-LEVEL ones. They are checked by `tsc --noEmit`
 * (`pnpm -r typecheck`, a gate rung), and they fail AT THE DECLARATION if a future edit
 * reintroduces a hand-kept mirror that drifts from the table — which is the whole property.
 */

// ---------------------------------------------------------------------------
// Type-level: the inferred shape covers the table EXACTLY
// ---------------------------------------------------------------------------

/** Invariant-position equality — distinguishes `string` from `string | undefined`, unlike `extends`. */
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

/**
 * The key sets match in BOTH directions. A flag declared in the table but missing from the values
 * type is the measured defect; a phantom field on the values type is the stale-mirror defect that
 * made it possible. Neither can exist while the type is derived — and if anyone re-derives it by
 * hand, `tsc` names THIS line.
 */
type _NoFlagMissingFromValues = Expect<
  Equals<Exclude<keyof typeof CLI_OPTIONS, keyof CliValues>, never>
>;
type _NoPhantomFieldOnValues = Expect<
  Equals<Exclude<keyof CliValues, keyof typeof CLI_OPTIONS>, never>
>;

/**
 * The three option SHAPES the table uses, each pinned to the type `parseArgs` infers for it. These
 * are what a hand-copied mirror got subtly wrong: the old annotation typed every boolean as
 * OPTIONAL (`pg?: boolean`), while a `default` guarantees presence.
 */
type _PlainStringFlag = Expect<Equals<CliValues["json"], string | undefined>>;
type _RepeatableStringFlag = Expect<Equals<CliValues["set"], string[] | undefined>>;
type _BooleanFlagWithDefault = Expect<Equals<CliValues["pg"], boolean>>;

// Reference the aliases so `noUnusedLocals` keeps them, and so a reader sees they are assertions.
export type TypeAssertions = [
  _NoFlagMissingFromValues,
  _NoPhantomFieldOnValues,
  _PlainStringFlag,
  _RepeatableStringFlag,
  _BooleanFlagWithDefault,
];

// ---------------------------------------------------------------------------
// Runtime: every declared flag actually reaches `values` through the real parse
// ---------------------------------------------------------------------------

/** A minimal argv that exercises one flag, matching its declared shape. */
function argvFor(flag: string, spec: { type: string }): string[] {
  return spec.type === "boolean" ? [`--${flag}`] : [`--${flag}`, "sample-value"];
}

test("EVERY flag declared in CLI_OPTIONS parses and lands on values — one declaration is enough", () => {
  const unreachable: string[] = [];
  for (const [flag, spec] of Object.entries(CLI_OPTIONS)) {
    const { values } = parseCliArgs(argvFor(flag, spec as { type: string }));
    if ((values as Record<string, unknown>)[flag] === undefined) unreachable.push(flag);
  }
  assert.deepEqual(
    unreachable,
    [],
    "these flags are declared in CLI_OPTIONS but did not survive the parse — the table is the " +
      "only place a flag should need to be declared",
  );
});

test("a repeatable flag accumulates; a single-valued one does not", () => {
  const { values } = parseCliArgs(["--set", "a=1", "--set", "b=2", "--json", "{}"]);
  assert.deepEqual(values.set, ["a=1", "b=2"]);
  assert.equal(values.json, "{}");
});

test("a boolean flag with a default is present WITHOUT being passed (the old annotation said optional)", () => {
  const { values } = parseCliArgs([]);
  assert.equal(values.pg, false, "declared `default: false`, so it is never undefined");
  assert.equal(parseCliArgs(["--pg"]).values.pg, true);
});

test("an UNDECLARED flag is still refused — inference did not loosen the strict parse", () => {
  assert.throws(
    () => parseCliArgs(["--no-such-flag", "x"]),
    /Unknown option/,
    "ADR-0343: one strict parse before dispatch; deriving the type must not weaken it",
  );
});

test("positionals still survive alongside flags (the dispatch reads four of them)", () => {
  const { positionals, values } = parseCliArgs(["library", "artifact", "some-id", "--pg"]);
  assert.deepEqual(positionals, ["library", "artifact", "some-id"]);
  assert.equal(values.pg, true);
});
