import test from "node:test";
import assert from "node:assert/strict";

import { USER_ROLES, type UserDoc } from "@storytree/studio-members";

import {
  membersCommand,
  parseRole,
  renderHistoryDoc,
  type MemberEventLike,
  type MemberStoreLike,
} from "./members.js";

/**
 * `storytree members` — the studio member directory as a CLI verb (owner rule, 2026-08-24: no
 * workflow may be UI-only). Pure-by-injection: the store is a seam, so every case here runs with an
 * in-memory double — no DB, no studio.
 *
 * The double deliberately implements the ADR-0043 LAST-ADMIN GUARD, because the whole safety claim of
 * this command is that it inherits that guard rather than re-implementing it. A double that always
 * said yes would let the tests pass while the real thing could lock the owner out of the studio.
 */

const NOW = new Date("2026-08-24T00:00:00.000Z");

function user(email: string, role: UserDoc["role"], status: UserDoc["status"] = "active"): UserDoc {
  return { email, role, status, invitedBy: null, createdAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() };
}

class LastAdminError extends Error {}

function fakeStore(seed: UserDoc[] = []): MemberStoreLike & { rows: UserDoc[]; events: MemberEventLike[] } {
  const rows = [...seed];
  const events: MemberEventLike[] = [];
  const admins = (rs: UserDoc[]) => rs.filter((r) => r.role === "admin").length;
  return {
    rows,
    events,
    async list() {
      return [...rows];
    },
    async get(email) {
      return rows.find((r) => r.email === email) ?? null;
    },
    async upsert(doc, actor) {
      const i = rows.findIndex((r) => r.email === doc.email);
      if (i >= 0) {
        // the guard: a sole admin may not be downgraded
        if (rows[i]!.role === "admin" && doc.role !== "admin" && admins(rows) === 1) {
          throw new LastAdminError("refusing to downgrade the last admin");
        }
        rows[i] = doc;
      } else rows.push(doc);
      events.push({ type: i >= 0 ? "updated" : "created", doc, actor, at: NOW.toISOString() });
      return doc;
    },
    async remove(email, actor) {
      const i = rows.findIndex((r) => r.email === email);
      if (i < 0) return false;
      if (rows[i]!.role === "admin" && admins(rows) === 1) {
        throw new LastAdminError("refusing to remove the last admin");
      }
      events.push({ type: "removed", doc: rows[i]!, actor, at: NOW.toISOString() });
      rows.splice(i, 1);
      return true;
    },
    async history(email) {
      return events.filter((e) => (e.doc as UserDoc | undefined)?.email === email);
    },
  };
}

const deps = (store: MemberStoreLike | null) => ({ store, actor: "test-session", now: () => NOW });
const inv = (o: Partial<Parameters<typeof membersCommand>[0]> = {}) => ({
  sub: undefined,
  email: undefined,
  role: undefined,
  help: false,
  ...o,
});

// ── the role check is derived from the schema, which is the whole point ──────────────────────

test("members: parseRole accepts EVERY role in USER_ROLES — including builder, which the studio route refused", () => {
  for (const r of USER_ROLES) assert.equal(parseRole(r), r, `${r} must be accepted`);
  // The regression this command was written beside: `builder` is in the schema, and the studio's
  // asRole literal union silently dropped it. Asserted by NAME so deleting builder from USER_ROLES
  // cannot make this test vacuously pass.
  assert.equal(parseRole("builder"), "builder");
  assert.ok((USER_ROLES as readonly string[]).includes("builder"), "USER_ROLES must still carry builder");
});

test("members: parseRole refuses an unknown role, blank, and undefined", () => {
  assert.equal(parseRole("owner"), null);
  assert.equal(parseRole(""), null);
  assert.equal(parseRole(undefined), null);
});

test("members: parseRole normalises case and surrounding space", () => {
  assert.equal(parseRole("  Builder "), "builder");
});

// ── offline refusal ──────────────────────────────────────────────────────────────────────────

test("members: every verb refuses without a store rather than inventing an offline directory", async () => {
  for (const sub of ["list", "add", "role", "remove", "history"]) {
    const env = await membersCommand(inv({ sub }), deps(null));
    assert.equal(env.ok, false, `${sub} must refuse offline`);
    assert.match(env.body, /--pg/, `${sub} must name the fix`);
  }
});

// ── list ─────────────────────────────────────────────────────────────────────────────────────

test("members list: renders each member and a per-role tally", async () => {
  const env = await membersCommand(
    inv({ sub: "list" }),
    deps(fakeStore([user("a@x.com", "admin"), user("b@x.com", "builder"), user("c@x.com", "member")])),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /3 member\(s\)/);
  assert.match(env.body, /a@x\.com/);
  assert.match(env.body, /builder 1/);
});

test("members list: an EMPTY directory is reported as empty and says why that may be correct", async () => {
  const env = await membersCommand(inv({ sub: "list" }), deps(fakeStore([])));
  assert.equal(env.ok, true);
  assert.match(env.body, /EMPTY/);
  // A reader must not conclude the owner is locked out — the seed admin needs no row.
  assert.match(env.body, /STORYTREE_STUDIO_ADMINS/);
});

// ── add ──────────────────────────────────────────────────────────────────────────────────────

test("members add: writes an invited row with the given role and stamps the session as inviter", async () => {
  const store = fakeStore([]);
  const env = await membersCommand(inv({ sub: "add", email: "New@X.com", role: "builder" }), deps(store));
  assert.equal(env.ok, true);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0]!.email, "new@x.com", "the email must be normalised");
  assert.equal(store.rows[0]!.role, "builder");
  assert.equal(store.rows[0]!.status, "invited");
  assert.equal(store.rows[0]!.invitedBy, "test-session");
});

test("members add: a SERVICE ACCOUNT email is an ordinary member — the harness-identity path", async () => {
  const store = fakeStore([]);
  const sa = "storytree-claude-harness@storytree-498613.iam.gserviceaccount.com";
  const env = await membersCommand(inv({ sub: "add", email: sa, role: "member" }), deps(store));
  assert.equal(env.ok, true);
  assert.equal(store.rows[0]!.email, sa);
});

test("members add: refuses a duplicate rather than silently overwriting a role", async () => {
  const store = fakeStore([user("a@x.com", "admin")]);
  const env = await membersCommand(inv({ sub: "add", email: "a@x.com", role: "member" }), deps(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /already in the directory/);
  assert.equal(store.rows[0]!.role, "admin", "the existing role must be untouched");
});

test("members add: refuses a bad role and NAMES the legal set", async () => {
  const store = fakeStore([]);
  const env = await membersCommand(inv({ sub: "add", email: "a@x.com", role: "owner" }), deps(store));
  assert.equal(env.ok, false);
  assert.match(env.body, /builder/);
  assert.equal(store.rows.length, 0, "nothing may be written on a refusal");
});

test("members add: refuses a non-email", async () => {
  const store = fakeStore([]);
  const env = await membersCommand(inv({ sub: "add", email: "nope", role: "member" }), deps(store));
  assert.equal(env.ok, false);
  assert.equal(store.rows.length, 0);
});

// ── role ─────────────────────────────────────────────────────────────────────────────────────

test("members role: re-roles in place and PRESERVES status / invitedBy / createdAt", async () => {
  const existing: UserDoc = {
    email: "a@x.com",
    role: "member",
    status: "active",
    invitedBy: "someone@else.com",
    createdAt: "2020-01-01T00:00:00.000Z",
    lastSeenAt: "2020-01-02T00:00:00.000Z",
  };
  const store = fakeStore([existing, user("admin@x.com", "admin")]);
  const env = await membersCommand(inv({ sub: "role", email: "a@x.com", role: "builder" }), deps(store));
  assert.equal(env.ok, true);
  const after = store.rows.find((r) => r.email === "a@x.com")!;
  assert.equal(after.role, "builder");
  assert.equal(after.status, "active", "status must survive a re-role");
  assert.equal(after.invitedBy, "someone@else.com", "the original inviter must survive");
  assert.equal(after.createdAt, "2020-01-01T00:00:00.000Z", "createdAt is an anchor");
});

test("members role: refuses an unknown member instead of creating one", async () => {
  const store = fakeStore([]);
  const env = await membersCommand(inv({ sub: "role", email: "ghost@x.com", role: "admin" }), deps(store));
  assert.equal(env.ok, false);
  assert.equal(store.rows.length, 0);
});

test("members role: the LAST-ADMIN guard is inherited, not re-implemented — a sole-admin downgrade throws", async () => {
  const store = fakeStore([user("only@x.com", "admin")]);
  await assert.rejects(
    () => membersCommand(inv({ sub: "role", email: "only@x.com", role: "member" }), deps(store)),
    /last admin/i,
    "the store's guard must reach the caller, not be swallowed into an ok envelope",
  );
  assert.equal(store.rows[0]!.role, "admin", "the sole admin must still be an admin");
});

// ── remove ───────────────────────────────────────────────────────────────────────────────────

test("members remove: drops the row and says history is retained", async () => {
  const store = fakeStore([user("a@x.com", "member"), user("admin@x.com", "admin")]);
  const env = await membersCommand(inv({ sub: "remove", email: "a@x.com" }), deps(store));
  assert.equal(env.ok, true);
  assert.equal(store.rows.length, 1);
  assert.match(env.body, /RETAINED/);
});

test("members remove: an unknown member is a refusal, not a silent success", async () => {
  const store = fakeStore([]);
  const env = await membersCommand(inv({ sub: "remove", email: "ghost@x.com" }), deps(store));
  assert.equal(env.ok, false);
});

test("members remove: the last admin cannot be removed", async () => {
  const store = fakeStore([user("only@x.com", "admin")]);
  await assert.rejects(() => membersCommand(inv({ sub: "remove", email: "only@x.com" }), deps(store)), /last admin/i);
  assert.equal(store.rows.length, 1);
});

// ── history ──────────────────────────────────────────────────────────────────────────────────

test("members history: renders the append-only audit rows for one member", async () => {
  const store = fakeStore([user("admin@x.com", "admin")]);
  await membersCommand(inv({ sub: "add", email: "a@x.com", role: "member" }), deps(store));
  await membersCommand(inv({ sub: "role", email: "a@x.com", role: "builder" }), deps(store));
  const env = await membersCommand(inv({ sub: "history", email: "a@x.com" }), deps(store));
  assert.equal(env.ok, true);
  assert.match(env.body, /2 event\(s\)/);
  assert.match(env.body, /created/);
  assert.match(env.body, /updated/);
  assert.match(env.body, /role=builder/);
});

test("members history: renderHistoryDoc survives a row that no longer matches the schema", () => {
  // The audit log is append-only across schema versions, so an OLD row may lack a current field.
  // It must render as history rather than throwing the whole read away.
  assert.match(renderHistoryDoc({ role: "member" }), /status=\?/);
  assert.match(renderHistoryDoc(null), /role=\?/);
  assert.match(renderHistoryDoc("not-an-object"), /role=\?/);
});

// ── surface ──────────────────────────────────────────────────────────────────────────────────

test("members: --help lists every subcommand and every role", async () => {
  const env = await membersCommand(inv({ help: true }), deps(null));
  assert.equal(env.ok, true);
  for (const sub of ["list", "add", "role", "remove", "history"]) {
    assert.match(env.body, new RegExp(sub), `help must mention ${sub}`);
  }
  for (const r of USER_ROLES) assert.match(env.body, new RegExp(r), `help must mention ${r}`);
});

test("members: an unknown subcommand is refused and the legal set is named", async () => {
  const env = await membersCommand(inv({ sub: "promote" }), deps(fakeStore([])));
  assert.equal(env.ok, false);
  assert.match(env.body, /list \| add \| role \| remove \| history/);
});
