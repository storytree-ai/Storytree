// @storytree/studio-members — the studio-members organism (ADR-0068 step 6), extracted from the
// dissolving @storytree/core. The member/user schema + access-control compute (UserDoc / User /
// mergeUser / normalizeEmail / resolveAccess / parseSeedAdmins / ResolvedAccess /
// wouldOrphanAdminsOnRemove / wouldOrphanAdminsOnRole / last-admin guard). Pure zod, browser-safe.
export * from "./users.js";
