// The decision-log reader the three ADR probes share (`probe:adr-graph`, `probe:combined-dag`,
// `probe:depth-from-work`).
//
// Each of them opened `docs/decisions/` with `loadAdrMetas(DECISIONS_DIR)` until ADR-0403 dec 1
// deleted that directory. `readdirSync` on a missing directory THROWS, and `loadAdrMetas` returns
// an empty list rather than propagating — so all three would have gone on reporting censuses,
// ladders and depths over ZERO decisions, with no error and nothing red. A probe is an instrument;
// a silent zero from one is worse than no reading at all, because every figure downstream is
// arithmetic over an empty set and still prints as a confident number.
//
// One reader rather than three copies, for the same reason the probes are worth fixing at all:
// they are compared against each other across sessions, so they must not drift on the population
// they measure.

import { loadTitledAdrMetasFromStore, openCorpusStore, type AdrMeta } from "@storytree/drive";

export interface ProbeDecisions {
  adrs: AdrMeta[];
  /** Non-empty means the caller must fail closed — every probe here already does. */
  parseErrors: string[];
}

/**
 * Every decision as an {@link AdrMeta}, read from the live store (ADR-0403 dec 1).
 *
 * EMPTY IS AN ERROR, NOT A CENSUS. Zero decisions means an unmigrated, wrong or unreachable store —
 * never a decision log that happens to hold nothing — so it is reported as a parse error and each
 * caller's existing fail-closed branch turns it into a non-zero exit. This is the one guard the
 * file-backed reader could not have: a missing directory and an empty one were the same answer.
 */
export async function loadProbeDecisions(tag: string): Promise<ProbeDecisions> {
  const corpus = await openCorpusStore(tag);
  try {
    const { adrs, parseErrors, unreadable } = await loadTitledAdrMetasFromStore(corpus.store);
    if (unreadable) {
      return {
        adrs: [],
        parseErrors: [
          ...parseErrors,
          "the decision log could not be READ at all (bring the DB up: pnpm db:up)",
        ],
      };
    }
    if (adrs.length === 0) {
      return {
        adrs: [],
        parseErrors: [
          ...parseErrors,
          "the decision log is EMPTY — an unmigrated or wrong store, never a clean census",
        ],
      };
    }
    return { adrs, parseErrors };
  } finally {
    await corpus.close();
  }
}
