import { readDecisionSources, type DecisionSource } from "@storytree/library";
import { hashSpan } from "@storytree/orchestrator";
import type { Store } from "@storytree/storage-protocol";

import { parseDecisionArg } from "./adr-round-trip.js";
import { locateSpanIn, sourceKey, sourceLabel, type SpanGrain } from "./decision-source-decay.js";
import type { Envelope } from "./envelope.js";

/**
 * `storytree adr rebind` — THE EXPLICIT FREEZE (ADR-0438 D1), and ADR-0139's missing second half.
 *
 * `grounded-decisions-arc` increment 03.
 *
 * ## WHY THIS IS A VERB AND NOT A HOOK
 *
 * ADR-0424 D2 said an anchor's fingerprint was frozen by the `proposed → accepted` transition, on
 * the reasoning that a step riding an existing transition cannot be forgotten. Building it falsified
 * that twice over, and ADR-0438 records the measurement rather than the inference. There are FOUR
 * routes to `accepted` (`adr push`, field-scoped `--set status=`, whole-document replace, the hosted
 * studio's generic update) and their only convergence is the `storage-protocol` write, which is
 * browser-safe by contract and cannot read a source tree — and one of the four runs on Cloud Run
 * with no checkout at all, so it could not hash a span under any design. Then the first real drain
 * showed the transition is the WRONG MOMENT regardless: a decision is normally accepted BEFORE the
 * code it directs exists, so a hash taken then records the pre-decision code and later reports
 * "moved" about precisely the change the decision asked for.
 *
 * So: **no automatic freeze anywhere.** A frozen hash means SOMEBODY LOOKED, and nothing else
 * (ADR-0438 D2). That is the property the verb buys, and it is worth more than the hook's
 * unforgettability — a hash minted as the residue of a status change made for unrelated reasons, by
 * someone who never opened the file, would look identical and mean nothing.
 *
 * ## WHY IT IS NOT A FLAG ON `adr push`
 *
 * ADR-0424 D7. The anchors say what the code looked like when somebody last read it; editing the
 * decision's PROSE is no evidence at all that anyone re-read the CODE. If a push could rebind, the
 * cheapest way to clear a drift finding would be to re-push the document that drifted — *halted is
 * never a pass*, wearing a different hat. `adrPush` writes a spread that does not name `sources`;
 * that spread reads like an oversight and is the fence. It is pinned end-to-end in
 * `adr-sources.test.ts` and must stay a separate verb however convenient a `--rebind` flag looks.
 *
 * ## ONE VERB, FIRST FREEZE AND EVERY LATER ONE (ADR-0438 D3)
 *
 * There is deliberately no separate `bind` and `rebind`. First-time freezing is one more case of
 * re-reading the code, not new machinery, and two verbs would immediately pose the question of which
 * one an author owes after a correction. The report distinguishes the cases; the act is the same.
 *
 * ## THE THREE HONEST DISCHARGES, AND WHICH ONE IS NOT FREE
 *
 * A located region has exactly three honest ends. REPAIRED — the prose was overtaken, so it is
 * corrected in place (`adr pull` / `adr push`, ADR-0139) and then re-frozen here. SUPERSEDED — the
 * DECISION changed, so a new ADR supersedes it (`adr new --supersedes <n>`) and the old one leaves
 * `adr list --current`, taking its findings with it; no machinery here, and none needed. REFUTED —
 * the ANCHOR was the error and the prose was always true, which is the one that empties the backlog
 * without anyone having repaired anything. So refuting REQUIRES `--reason`, stores it on the anchor
 * rather than in a commit message, retains the anchor rather than deleting it, and the sweep prints
 * every one of them in its own visible category. Refuting is reachable; it is not cheap.
 *
 * ## IT REFUSES TO FREEZE WHAT IT CANNOT LOCATE
 *
 * The first drain authored an anchor onto machinery a later decision had deleted; it bound fine
 * against history and then reported unlocatable forever. A verb that froze whatever it found would
 * hide that at authoring time. An anchor that does not locate in the CURRENT tree is never frozen
 * here — it is reported, by name, with its two remaining routes. Its siblings on the same decision
 * ARE frozen: refusing the whole write would let one bad anchor block a decision's grounding
 * permanently, and the unlocatable one keeps reding the sweep either way, so nothing is laundered.
 *
 * The COMPUTE is shared with the sweep and is not re-implemented: {@link locateSpanIn} re-locates the
 * span and {@link hashSpan} fingerprints it, so what this verb writes is by construction what the
 * sweep will read. Any other compute would report drift on the first sweep after a rebind and
 * manufacture its own false positives.
 */

/** What a rebind would do to ONE anchor. Every case is reported; only two of them write. */
export type AnchorPlan =
  | {
      /** Declared, never frozen — this is the FIRST freeze (ADR-0438 D3). */
      readonly kind: "first-freeze";
      readonly source: DecisionSource;
      readonly hash: string;
      readonly grain: SpanGrain;
    }
  | {
      /** Bound, and the span has MOVED — the drain's REPAIRED discharge landing. */
      readonly kind: "refreeze";
      readonly source: DecisionSource;
      readonly from: string;
      readonly hash: string;
      readonly grain: SpanGrain;
    }
  | {
      /** Bound and unchanged. Nothing is written — a re-read that found nothing is not a write. */
      readonly kind: "fresh";
      readonly source: DecisionSource;
      readonly grain: SpanGrain;
    }
  | {
      /** The span cannot be found in the CURRENT tree, so there is nothing honest to freeze. */
      readonly kind: "unlocatable";
      readonly source: DecisionSource;
      readonly why: string;
    }
  | {
      /** Already closed as refuted — left exactly as it is, reason and all. */
      readonly kind: "refuted";
      readonly source: DecisionSource;
      readonly reason: string;
    };

/**
 * PURE: what a rebind of these anchors would do, given the tree `readFile` describes.
 *
 * `readFile` is INJECTED for the reason `projectDecisionFacts` injects its own: the rules that can be
 * wrong — which grain located the span, what `unlocatable` means when the file is gone, which
 * outcome each anchor lands in — are otherwise exercised only against a real tree, and a rule no
 * hermetic test reaches is a rule nothing holds.
 */
export function planRebind(
  sources: readonly DecisionSource[],
  readFile: (repoRelPath: string) => string | undefined,
): AnchorPlan[] {
  const plans: AnchorPlan[] = [];
  for (const source of sources) {
    const { refuted } = source;
    if (refuted !== undefined) {
      plans.push({ kind: "refuted", source, reason: refuted });
      continue;
    }
    const text = readFile(source.file);
    if (text === undefined) {
      plans.push({
        kind: "unlocatable",
        source,
        why: `${source.file} does not exist in this checkout`,
      });
      continue;
    }
    const location = locateSpanIn(text, source.file, source);
    if (location.kind === "unlocatable") {
      plans.push({ kind: "unlocatable", source, why: location.why });
      continue;
    }
    // THE SAME COMPUTE THE SWEEP RUNS. `hashSpan(locateSpanIn(...).span)` is the whole contract
    // between this verb and `decision-source-decay.ts`; a second normalisation here would freeze a
    // value the sweep never computes, and every rebind would report drift on the next run.
    const hash = hashSpan(location.span);
    const { boundHash } = source;
    if (boundHash === undefined) {
      plans.push({ kind: "first-freeze", source, hash, grain: location.grain });
    } else if (boundHash === hash) {
      plans.push({ kind: "fresh", source, grain: location.grain });
    } else {
      plans.push({ kind: "refreeze", source, from: boundHash, hash, grain: location.grain });
    }
  }
  return plans;
}

/**
 * PURE: the anchor list a plan would store — the frozen hashes applied, everything else untouched.
 *
 * An UNLOCATABLE anchor keeps whatever it had, including a stale `boundHash`. That is deliberate: the
 * sweep must go on reporting it, and clearing the hash would silently convert a real finding into a
 * "declared but never frozen" note, which is a quieter category. The verb tells the author instead.
 */
export function nextSources(plans: readonly AnchorPlan[]): DecisionSource[] {
  return plans.map((plan) =>
    plan.kind === "first-freeze" || plan.kind === "refreeze"
      ? { ...plan.source, boundHash: plan.hash }
      : plan.source,
  );
}

/** True when applying this plan would change a stored hash — i.e. there is a write to make. */
export function planWrites(plans: readonly AnchorPlan[]): boolean {
  return plans.some((plan) => plan.kind === "first-freeze" || plan.kind === "refreeze");
}

/**
 * PURE: refute ONE anchor by its {@link sourceKey}, recording why.
 *
 * The hash is STRIPPED as the reason is recorded. A refuted anchor is not a binding any more, and
 * leaving the hash would keep it in the sweep's comparison set — the finding would survive its own
 * discharge. `boundRef` guards that case a second time on the read side, because the field is
 * hand-writable through `--set sources=@file.json` and this is the pair of edits a hand-written
 * entry gets wrong.
 */
export function refuteSource(
  sources: readonly DecisionSource[],
  key: string,
  reason: string,
):
  | { readonly ok: true; readonly next: DecisionSource[]; readonly label: string }
  | { readonly ok: false } {
  const index = sources.findIndex((source) => sourceKey(source) === key);
  const target = sources[index];
  if (target === undefined) return { ok: false };
  const { boundHash: _dropped, ...identity } = target;
  const next = [...sources];
  next[index] = { ...identity, refuted: reason };
  return { ok: true, next, label: sourceLabel(target) };
}

/** How the report names one planned outcome — the grain is printed because it decides the noise. */
export function describePlan(plan: AnchorPlan): string {
  const label = sourceLabel(plan.source);
  if (plan.kind === "first-freeze") {
    return `FIRST FREEZE  ${label} [${plan.grain} grain] → ${plan.hash}`;
  }
  if (plan.kind === "refreeze") {
    return `RE-FROZEN     ${label} [${plan.grain} grain] ${plan.from} → ${plan.hash}`;
  }
  if (plan.kind === "fresh") return `fresh         ${label} [${plan.grain} grain] — unchanged`;
  if (plan.kind === "refuted") return `refuted       ${label} — ${plan.reason}`;
  return `UNLOCATABLE   ${label} — ${plan.why}`;
}

/** What {@link adrRebind} needs: the row, the write gate, and the tree the spans are hashed in. */
export interface AdrRebindDeps {
  /** The live store. The dry read dials it too; only the write needs `writable`. */
  readonly store: Store;
  /** `--pg` + a real connection — the freeze refuses without it, the dry read does not. */
  readonly writable: boolean;
  /** Recorded as the write's actor, resolved at the call site like every other decision write. */
  readonly actor?: string | undefined;
  /** Repo-relative read of the CURRENT tree — the fs-backed reader offline, a fake under test. */
  readonly readFile: (repoRelPath: string) => string | undefined;
}

/** `storytree adr rebind --refute <key> --reason <text|@file>` — the third discharge's flags. */
export interface AdrRebindOpts {
  /** The `sourceKey` of the anchor to refute, exactly as the sweep's finding prints it. */
  readonly refute?: string | undefined;
  /** WHY it was refuted. REQUIRED with `--refute`; the whole point of the unit. */
  readonly reason?: string | undefined;
}

const pad = (n: number): string => String(n).padStart(4, "0");

/**
 * `storytree adr rebind <n> [--refute <key> --reason <text>] [--pg]`.
 *
 * WITHOUT `--pg` it is a DRY READ that writes nothing and reports what a freeze would do. That is
 * not a courtesy: the freeze asserts "somebody looked", so the author needs to see which spans it is
 * about to assert that over, and the read is what they look AT. WITH `--pg` it applies.
 */
export async function adrRebind(
  numberArg: string | undefined,
  opts: AdrRebindOpts,
  deps: AdrRebindDeps,
): Promise<Envelope> {
  const number = parseDecisionArg(numberArg);
  if (number === null) {
    return {
      ok: false,
      body: `expected a decision NUMBER (got ${numberArg === undefined ? "nothing" : JSON.stringify(numberArg)}).`,
      next: ["storytree adr rebind 424", "storytree adr rebind 424 --pg"],
    };
  }
  const id = `adr-${pad(number)}`;
  const stored = await deps.store.getDoc(id);
  if (stored === null) {
    return {
      ok: false,
      body: [
        `no decision row "${id}" in the store.`,
        "",
        "Decisions are rows and nothing mirrors them on disk (ADR-0403 dec 1), so an empty answer",
        "here is the whole answer — either the number is wrong, or it was reserved and never written.",
      ].join("\n"),
      next: ["storytree adr list --current"],
    };
  }

  const sources = readDecisionSources(stored.doc);
  if (sources.length === 0) {
    return {
      ok: false,
      body: [
        `${id} carries no code anchors, so there is nothing to freeze.`,
        "",
        "This verb re-reads anchors somebody has already authored; it never invents them. Anchors are",
        "hand-attested against the decision's own prose and authored with",
        `  storytree library artifact ${id} --set sources=@anchors.json --pg`,
        "",
        "NEVER auto-anchor. Matching a decision's backticked identifiers against the files it cites was",
        "measured at 795 candidates across 200 decisions, mostly coincidental collisions",
        "(docs/research/decision-source-first-drain-2026-08-24.md).",
      ].join("\n"),
      next: [`storytree library artifact ${id}`],
    };
  }

  const { refute, reason } = opts;
  if (refute !== undefined) return refuteOne(id, sources, refute, reason, deps);
  // `--reason` on its own is refused rather than ignored: it is the flag that carries the durable
  // record, and a silently dropped one is how a reason gets written and lost in the same command.
  if (reason !== undefined) {
    return {
      ok: false,
      body: [
        "--reason means nothing without --refute, so nothing was written.",
        "",
        "A rebind needs no reason — re-reading the code IS the justification, and the report says what",
        "moved. A REFUTATION needs one, because it discharges a finding without repairing anything.",
      ].join("\n"),
      next: [`storytree adr rebind ${String(number)}`],
    };
  }

  const plans = planRebind(sources, deps.readFile);
  const lines = plans.map((plan) => `  ${describePlan(plan)}`);
  const unlocatable = plans.filter((plan) => plan.kind === "unlocatable");
  const tail: string[] = [];
  if (unlocatable.length > 0) {
    tail.push(
      "",
      `${String(unlocatable.length)} anchor(s) were NOT frozen — the span could not be located in this`,
      "checkout, and a hash taken over a span nobody found would assert a look that never happened.",
      "Each keeps whatever it had, so the sweep goes on reporting it. Two honest routes:",
      "  - the anchor's IDENTITY moved (renamed symbol, moved file) → fix `file`/`symbol`/`quote` with",
      `    storytree library artifact ${id} --set sources=@anchors.json --pg, then rebind`,
      "  - the anchor was the ERROR and the prose was always true → refute it, with the reason:",
      `    storytree adr rebind ${String(number)} --refute "<key>" --reason "<why>" --pg`,
    );
  }

  if (!planWrites(plans)) {
    return {
      ok: true,
      body: [
        `${id} — nothing to freeze; every locatable anchor already matches the tree.`,
        ...lines,
        ...tail,
      ].join("\n"),
      next: [`storytree library artifact ${id}`],
    };
  }

  if (!deps.writable) {
    return {
      ok: true,
      body: [
        `${id} — DRY READ. Nothing was written. This is what --pg would freeze:`,
        ...lines,
        ...tail,
        "",
        "A frozen hash asserts that somebody READ this code (ADR-0438 D2). Read the spans above, then:",
        `  storytree adr rebind ${String(number)} --pg`,
      ].join("\n"),
      next: [`storytree adr rebind ${String(number)} --pg`],
    };
  }

  await patchSources(id, nextSources(plans), deps);
  return {
    ok: true,
    body: [`${id} — anchors re-frozen against this checkout:`, ...lines, ...tail].join("\n"),
    next: [`storytree library artifact ${id}`, `storytree library artifact history ${id} --pg`],
  };
}

/** The REFUTED discharge — reason REQUIRED, anchor retained, hash stripped. */
async function refuteOne(
  id: string,
  sources: readonly DecisionSource[],
  key: string,
  reason: string | undefined,
  deps: AdrRebindDeps,
): Promise<Envelope> {
  // THE HEADLINE REFUSAL OF THIS UNIT. Refuting is the discharge that empties the backlog without
  // repairing anything, so a refutation with no recorded reason is indistinguishable from nobody
  // having looked — and it is the cheap move, which is exactly why it must not be the free one.
  if (reason === undefined || reason.trim() === "") {
    return {
      ok: false,
      body: [
        "--refute needs --reason, so nothing was written.",
        "",
        "Refuting says the ANCHOR was the error and the decision's prose was always true. It discharges",
        "a finding without repairing anything, which makes it the one route that could quietly empty",
        "the backlog. The reason is stored on the anchor and printed by every later sweep, so somebody",
        "can disagree with it. --reason accepts @path for prose too long for a shell argument.",
      ].join("\n"),
      next: [`storytree adr rebind <n> --refute ${JSON.stringify(key)} --reason "<why>" --pg`],
    };
  }
  const refuted = refuteSource(sources, key, reason);
  if (!refuted.ok) {
    return {
      ok: false,
      body: [
        `${id} carries no anchor keyed ${JSON.stringify(key)}.`,
        "",
        "The key is the anchor's IDENTITY exactly as a finding prints it — `<file>`, `<file>#<symbol>`",
        "or `<file>@<exact>`, never the claim label. This decision's keys are:",
        ...sources.map((source) => `  ${sourceKey(source)}`),
      ].join("\n"),
      next: [`storytree library artifact ${id}`],
    };
  }
  if (!deps.writable) {
    return {
      ok: false,
      body: [
        `refuting ${refuted.label} on ${id} is a WRITE and needs --pg. Nothing was written.`,
        "",
        `  storytree adr rebind ${id.slice("adr-".length)} --refute ${JSON.stringify(key)} --reason ${JSON.stringify(reason)} --pg`,
      ].join("\n"),
      next: ["pnpm db:up"],
    };
  }
  await patchSources(id, refuted.next, deps);
  return {
    ok: true,
    body: [
      `${id} — ${refuted.label} REFUTED, and the reason is on the record:`,
      `  ${reason}`,
      "",
      "The anchor is retained rather than deleted, and every later sweep prints it under REFUTED. It",
      "is comparable by nothing now, so it reds nothing — and it is not silence either.",
    ].join("\n"),
    next: [`storytree library artifact ${id}`, `storytree library artifact history ${id} --pg`],
  };
}

/**
 * The one write both routes make — FIELD-SCOPED (ADR-0352), never a whole-doc replace.
 *
 * Two sessions rebinding the same decision are last-write-wins with no detector; scoping the write
 * to `sources` at least keeps a rebind from clobbering a sibling's prose correction, which is the
 * collision this verb is most likely to be in — repairing and re-freezing are the same loop.
 */
async function patchSources(id: string, sources: readonly DecisionSource[], deps: AdrRebindDeps): Promise<void> {
  const patch: Parameters<Store["patchDoc"]>[0] = {
    id,
    kind: "adr",
    fields: { sources: [...sources], updatedAt: new Date().toISOString() },
  };
  await deps.store.patchDoc(deps.actor === undefined ? patch : { ...patch, actor: deps.actor });
}
