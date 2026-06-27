import { test } from "node:test";
import assert from "node:assert/strict";
import {
  User,
  normalizeEmail,
  mergeUser,
  adminCount,
  mayBrokerWrite,
  wouldOrphanAdminsOnRemove,
  wouldOrphanAdminsOnRole,
  resolveAccess,
  parseSeedAdmins,
  type UserDoc,
  type UserRole,
} from "./users.js";

const user = (over: Partial<UserDoc> = {}): UserDoc =>
  User.parse({
    email: "a@example.com",
    role: "member",
    status: "active",
    createdAt: "2026-06-14T00:00:00.000Z",
    lastSeenAt: "2026-06-14T00:00:00.000Z",
    ...over,
  });

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Dev@Example.COM "), "dev@example.com");
  assert.equal(normalizeEmail(""), "");
});

test("User schema normalises email, defaults status/invitedBy, fails closed on a blank email", () => {
  const u = User.parse({
    email: "OWNER@Example.com",
    role: "admin",
    createdAt: "t",
    lastSeenAt: "t",
  });
  assert.equal(u.email, "owner@example.com");
  assert.equal(u.status, "invited"); // default
  assert.equal(u.invitedBy, null); // default
  assert.throws(() => User.parse({ email: "  ", role: "member", createdAt: "t", lastSeenAt: "t" }));
  assert.throws(() => User.parse({ email: "nope", role: "member", createdAt: "t", lastSeenAt: "t" }));
  assert.throws(() =>
    User.parse({ email: "a@b.com", role: "owner", createdAt: "t", lastSeenAt: "t" }),
  );
  // strict: an unknown field is rejected, never silently dropped
  assert.throws(() =>
    User.parse({ email: "a@b.com", role: "member", createdAt: "t", lastSeenAt: "t", extra: 1 }),
  );
});

test("mergeUser ignores undefined, never mutates, anchors email + createdAt", () => {
  const existing = user({ role: "member", createdAt: "orig", status: "invited" });
  const merged = mergeUser(existing, {
    role: "admin",
    status: "active",
    lastSeenAt: "later",
    // a cast-in attempt to move the anchors must not win
    ...({ email: "evil@example.com", createdAt: "moved" } as object),
  });
  assert.equal(merged.role, "admin");
  assert.equal(merged.status, "active");
  assert.equal(merged.lastSeenAt, "later");
  assert.equal(merged.email, "a@example.com"); // anchor held
  assert.equal(merged.createdAt, "orig"); // anchor held
  assert.equal(existing.role, "member"); // input untouched
});

test("last-admin guard: cannot remove or downgrade the only admin", () => {
  const solo = [user({ email: "admin@x.com", role: "admin" })];
  assert.equal(adminCount(solo), 1);
  assert.equal(wouldOrphanAdminsOnRemove(solo, "admin@x.com"), true);
  assert.equal(wouldOrphanAdminsOnRole(solo, "admin@x.com", "member"), true);
  // a member is always removable/re-rolable
  const two = [user({ email: "admin@x.com", role: "admin" }), user({ email: "m@x.com", role: "member" })];
  assert.equal(wouldOrphanAdminsOnRemove(two, "m@x.com"), false);
  // with two admins, removing one is fine; promoting never orphans
  const twoAdmins = [user({ email: "a1@x.com", role: "admin" }), user({ email: "a2@x.com", role: "admin" })];
  assert.equal(wouldOrphanAdminsOnRemove(twoAdmins, "a1@x.com"), false);
  assert.equal(wouldOrphanAdminsOnRole(twoAdmins, "a1@x.com", "member"), false);
  assert.equal(wouldOrphanAdminsOnRole(solo, "admin@x.com", "admin"), false); // self-promote no-op
  // case-insensitive target match
  assert.equal(wouldOrphanAdminsOnRemove(solo, "ADMIN@X.com"), true);
});

test("builder role: User schema accepts 'builder', resolveAccess resolves it, last-admin guard counts only admins", () => {
  // 1. The User schema must accept "builder" as a valid role, AND refuse a bogus one —
  //    z.enum(USER_ROLES) is the fail-closed boundary (admits "builder", throws on anything else).
  const validBuilderInput = {
    email: "builder@x.com",
    role: "builder",
    status: "active",
    invitedBy: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    lastSeenAt: "2026-06-14T00:00:00.000Z",
  };
  const builderDoc = User.parse(validBuilderInput) as UserDoc;
  assert.equal(builderDoc.role, "builder");
  // A bogus role ("contributor") is refused at the write boundary — the enum fails closed,
  // so an unknown role never validates (never silently coerced to member).
  assert.throws(() => User.parse({ ...validBuilderInput, role: "contributor" }));

  // 2. resolveAccess resolves a stored builder row with role "builder".
  const seed = parseSeedAdmins("");
  const resolved = resolveAccess([builderDoc], "builder@x.com", seed);
  assert.deepEqual(resolved, {
    email: "builder@x.com",
    role: "builder",
    status: "active",
    seeded: false,
  });

  // 3. adminCount counts only admins — builders do not contribute (last-admin guard unaffected).
  const adminDoc = user({ email: "admin@x.com", role: "admin" });
  const mixed: readonly UserDoc[] = [adminDoc, builderDoc];
  assert.equal(adminCount(mixed), 1);

  // 4. Downgrading the sole admin TO builder orphans (builder ≠ admin);
  //    re-roling a builder to member never orphans (builder is not an admin).
  assert.equal(
    wouldOrphanAdminsOnRole(mixed, "admin@x.com", "builder" as unknown as UserRole),
    true,
  );
  assert.equal(wouldOrphanAdminsOnRole(mixed, "builder@x.com", "member"), false);

  // 5. Removing a builder never orphans (only admins count toward the last-admin guard).
  assert.equal(wouldOrphanAdminsOnRemove(mixed, "builder@x.com"), false);

  // 6. With TWO admins, down-roling one to "builder" is allowed — only the LAST admin is
  //    protected, and a builder does not count toward the admin floor (no-lockout preserved).
  const twoAdmins: readonly UserDoc[] = [
    user({ email: "a1@x.com", role: "admin" }),
    user({ email: "a2@x.com", role: "admin" }),
  ];
  assert.equal(wouldOrphanAdminsOnRole(twoAdmins, "a1@x.com", "builder"), false);
});

test("mayBrokerWrite: builder and admin may broker writes, member may not (admin ⊇ builder ⊇ member)", () => {
  assert.equal(mayBrokerWrite("builder"), true);
  assert.equal(mayBrokerWrite("admin"), true);
  assert.equal(mayBrokerWrite("member"), false);
});

test("resolveAccess: row wins, seed admin is admitted, everyone else is null", () => {
  const seed = parseSeedAdmins(" Owner@Example.com , ");
  const users = [user({ email: "m@x.com", role: "member", status: "active" })];
  // a present row resolves by its stored role/status
  assert.deepEqual(resolveAccess(users, "M@X.com", seed), {
    email: "m@x.com",
    role: "member",
    status: "active",
    seeded: false,
  });
  // a seed email with no row is an effective active admin (bootstrap)
  assert.deepEqual(resolveAccess(users, "owner@example.com", seed), {
    email: "owner@example.com",
    role: "admin",
    status: "active",
    seeded: true,
  });
  // a stored row for a seed email wins over the seed (so a demoted seed stays demoted)
  const demotedSeed = [user({ email: "owner@example.com", role: "member", status: "active" })];
  assert.equal(resolveAccess(demotedSeed, "owner@example.com", seed)?.role, "member");
  // strangers and blanks are non-members
  assert.equal(resolveAccess(users, "stranger@x.com", seed), null);
  assert.equal(resolveAccess(users, null, seed), null);
  assert.equal(resolveAccess(users, "  ", seed), null);
});
