import { z } from "zod";

/**
 * ADR-0043 `user-directory`: the app-owned user (member) doc plus the pure logic the
 * studio's authorization reuses — validation, email normalisation, upsert-merge,
 * the last-admin guard, and access resolution from the projection.
 *
 * No I/O: no store, no clock reads (callers pass timestamps), no IAP. Identity is
 * the verified email (lowercased); this module only refuses docs without one. The
 * studio (ADR-0042) authenticates via IAP and authorizes HERE.
 */

// ---------------------------------------------------------------------------
// Roles & status
// ---------------------------------------------------------------------------

/**
 * The three roles (ADR-0043/ADR-0117): admins manage; builders read + comment + post brokered
 * writes; members read + comment. Ordering: admin ⊇ builder ⊇ member.
 */
export const USER_ROLES = ["admin", "builder", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Lifecycle: invited (not yet signed in) → active (seen at least once). */
export const USER_STATUSES = ["invited", "active"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// ---------------------------------------------------------------------------
// Role scope (ADR-0117 — the brokered-write predicate)
// ---------------------------------------------------------------------------

/**
 * PURE: may a caller with this role POST a brokered write (a locally-signed verdict /
 * presence declaration) through the members-gated write-broker? The brokered-write
 * scope of `admin ⊇ builder ⊇ member` (ADR-0117 d.2): a `builder` and an `admin` may;
 * a plain `member` may not. The broker ENDPOINT (apps/studio/server, ADR-0117 Unit 2)
 * reads this predicate off the resolved role — the role-scope compute lives with the
 * role model here, never re-inlined at the gate.
 */
export function mayBrokerWrite(role: UserRole): boolean {
  return role === "admin" || role === "builder";
}

// ---------------------------------------------------------------------------
// Email normalisation
// ---------------------------------------------------------------------------

/** PURE: the canonical identity key — trimmed, lowercased. "" for blank input. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const emailField = z
  .string()
  .transform(normalizeEmail)
  .refine((s) => s.length > 0 && s.includes("@"), {
    message: "must be a non-blank email address",
  });

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The validated user doc (ADR-0043 Decision 1). Strict: unknown fields rejected,
 * not stripped. Fail-closed on a blank/invalid email. `invitedBy` is the inviter's
 * email (null for a bootstrap-seeded admin).
 */
export const User = z
  .object({
    /** Verified email — the identity key, always normalised. */
    email: emailField,
    role: z.enum(USER_ROLES),
    status: z.enum(USER_STATUSES).default("invited"),
    /** The admin who invited this user; null for a bootstrap-seeded admin. */
    invitedBy: z.string().nullable().default(null),
    /** Set once at first write; preserved by every merge — never patched. */
    createdAt: z.string(),
    /** Bumped on each upsert / sighting. */
    lastSeenAt: z.string(),
  })
  .strict();

export type UserDoc = z.infer<typeof User>;

/**
 * A partial update to a stored user. `email` and `createdAt` are anchors — they
 * cannot appear in a patch (mirrors `PresenceDeclarationPatch`). Explicit
 * `undefined` is admitted by the type because the merge ignores it at runtime.
 */
export type UserPatch = {
  [K in keyof Omit<UserDoc, "email" | "createdAt">]?: Omit<UserDoc, "email" | "createdAt">[K] | undefined;
};

// ---------------------------------------------------------------------------
// Upsert-merge
// ---------------------------------------------------------------------------

/**
 * PURE: merge a patch into an existing user doc (the `mergeDeclaration` pattern):
 * undefined patch fields ignored; input never mutated; `email`/`createdAt` anchors
 * forcibly re-applied from `existing` so no patch can move them.
 */
export function mergeUser(existing: UserDoc, patch: UserPatch): UserDoc {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  merged.email = existing.email;
  merged.createdAt = existing.createdAt;
  return merged;
}

// ---------------------------------------------------------------------------
// Last-admin guard (ADR-0043 Decision 4 — no lockout)
// ---------------------------------------------------------------------------

/** Count of users who are effective admins (role admin; status irrelevant — an invited admin still counts). */
export function adminCount(users: readonly UserDoc[]): number {
  return users.filter((u) => u.role === "admin").length;
}

/**
 * PURE: would removing `email` leave the directory with zero admins? An email that
 * isn't an admin (or isn't present) never orphans, so removing a member is always fine.
 */
export function wouldOrphanAdminsOnRemove(users: readonly UserDoc[], email: string): boolean {
  const target = normalizeEmail(email);
  const u = users.find((x) => x.email === target);
  if (!u || u.role !== "admin") return false;
  return adminCount(users) <= 1;
}

/**
 * PURE: would changing `email` to `nextRole` leave zero admins? Only a downgrade of
 * the last admin orphans; promoting, or re-roling a member, never does.
 */
export function wouldOrphanAdminsOnRole(
  users: readonly UserDoc[],
  email: string,
  nextRole: UserRole,
): boolean {
  if (nextRole === "admin") return false;
  const target = normalizeEmail(email);
  const u = users.find((x) => x.email === target);
  if (!u || u.role !== "admin") return false;
  return adminCount(users) <= 1;
}

// ---------------------------------------------------------------------------
// Access resolution (ADR-0043 Decision 2 — the app authorizes)
// ---------------------------------------------------------------------------

/** What the API needs to authorize a request: the resolved member (or null = not a member). */
export interface ResolvedAccess {
  email: string;
  role: UserRole;
  status: UserStatus;
  /** True when this identity was admitted only because it is in the bootstrap seed. */
  seeded: boolean;
}

/**
 * PURE: resolve a verified email against the projection plus the bootstrap-admin
 * seed (ADR-0043 Decision 4). A present row wins. Otherwise, a seed email is an
 * effective active admin (so there is always a first admin who can invite). Anyone
 * else is `null` — a non-member, served nothing but a request-access wall.
 *
 * Never mutates and never writes: turning a seeded/invited identity into a stored
 * `active` row is the store's job (the caller upserts on the back of this).
 */
export function resolveAccess(
  users: readonly UserDoc[],
  verifiedEmail: string | null | undefined,
  seedAdmins: ReadonlySet<string>,
): ResolvedAccess | null {
  if (!verifiedEmail) return null;
  const email = normalizeEmail(verifiedEmail);
  if (!email) return null;
  const row = users.find((u) => u.email === email);
  if (row) return { email, role: row.role, status: row.status, seeded: false };
  if (seedAdmins.has(email)) return { email, role: "admin", status: "active", seeded: true };
  return null;
}

/** PURE: parse a comma-separated seed-admin env value into a normalised set. */
export function parseSeedAdmins(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter((s) => s.length > 0),
  );
}
