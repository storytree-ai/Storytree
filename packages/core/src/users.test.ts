import { test } from "node:test";
import assert from "node:assert/strict";
import {
  User,
  normalizeEmail,
  mergeUser,
  adminCount,
  wouldOrphanAdminsOnRemove,
  wouldOrphanAdminsOnRole,
  resolveAccess,
  parseSeedAdmins,
  type UserDoc,
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
