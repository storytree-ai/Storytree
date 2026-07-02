// Back-compat shim (the ADR-0112 pattern): the attestation-mark display half moved to
// `@storytree/drive` with `treeCommand`.
export {
  HUMAN_SEAL,
  MACHINE_MARK,
  readAttestations,
  attestationMark,
} from "@storytree/drive";
export type { AttestationReaderLike } from "@storytree/drive";
