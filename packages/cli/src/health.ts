// Back-compat shim (the ADR-0112 pattern): the Library health checks moved to `@storytree/drive`
// so the drive-resident library dashboard (and the desktop orientation runner behind it) can run
// the banner without importing the command hub. The library-health-gate story's proof
// (`packages/cli/src/health.test.ts`) keeps proving the same module through this shim.
export {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
  GATE_CHECKS,
  CHEAP_CHECKS,
  RETIRED_FIELDS,
} from "@storytree/drive";
export type { CheckLevel, CheckResult, HealthOpts } from "@storytree/drive";
