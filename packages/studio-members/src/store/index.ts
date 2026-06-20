// @storytree/studio-members/store — the node-only Postgres drawer the studio-members organism owns
// (ADR-0077 U2): the app-owned user (member) store (ADR-0043), with its last-admin guard.
// node+pg-only — NEVER re-exported from the root `.` barrel, which the studio's browser bundle imports.

export { PgUserStore, LastAdminError } from "./user-store.js";
export type {
  UserClient,
  UserPool,
  UserPoolClient,
  UserEvent,
} from "./user-store.js";
