/**
 * `storytree members` — the studio member directory as a CLI verb.
 *
 * WHY THIS EXISTS. Owner call, 2026-08-24: *"everything in storytree should be drivable from the
 * CLI, we shouldn't have any workflows that are UI only."* Measured that day, `POST/PATCH/DELETE
 * /api/users` was the ONLY write route in the studio's whole API with no CLI equivalent — every
 * other one already had a verb (`/api/assets` → `library artifact edit`, `/api/uat/attest` →
 * `witness attest`, comments retired by ADR-0425). This closes that one gap.
 *
 * IT IS NOT A SECOND WRITE PATH. Every mutation goes through the SAME {@link PgUserStore} the
 * studio's own handler calls, so the zod re-validation at the write boundary, the `user_event`
 * audit append, and the ADR-0043 last-admin guard (with its `pg_advisory_xact_lock` mutex) all
 * apply identically. A CLI that poked `events."user"` directly would be able to lock the owner out
 * of the studio; this one cannot, because the guard lives under it rather than beside it.
 *
 * ⚠ IT ALSO GRANTS A ROLE THE UI CANNOT. `USER_ROLES` is `["admin", "builder", "member"]`, but the
 * studio route's `asRole` admitted only `admin`/`member`, so the Members panel could never grant
 * `builder` — the very role `stories/studio-members`' `builder-role` capability exists for, and the
 * one `stories/desktop` leg 8's journey ("the owner's in-app `builder` grant opens the brokered
 * write path") requires. The route is corrected in the same change; this verb accepts all three
 * from the outset. That defect surviving unnoticed is itself the argument for the owner's rule: with
 * no CLI path, nothing ever exercised the role, and a half-built capability sat behind a panel.
 */

import type { UserDoc, UserRole } from "@storytree/studio-members";
import { USER_ROLES, normalizeEmail } from "@storytree/studio-members";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// The store seam
// ---------------------------------------------------------------------------

/**
 * One append-only directory audit row, as the store's `history` returns it. `doc` is `unknown` on
 * purpose — that is the store's own type, and narrowing it here would be a claim this command cannot
 * make: the log is append-only across schema versions, so an OLD row may predate a field the current
 * `UserDoc` requires. {@link renderHistoryDoc} reads it defensively instead of parsing it, so a row
 * that no longer validates still prints as history rather than throwing the whole read away.
 */
export interface MemberEventLike {
  readonly type: string;
  readonly doc: unknown;
  readonly actor: string;
  readonly at: string;
}

/**
 * PURE: the `role=… status=…` fragment for one audit row, read defensively from an `unknown` doc.
 * A row missing either field renders `?` rather than throwing — an unreadable historical row must
 * not be able to sink the whole history read.
 */
export function renderHistoryDoc(doc: unknown): string {
  const d = typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
  const role = typeof d["role"] === "string" ? d["role"] : "?";
  const status = typeof d["status"] === "string" ? d["status"] : "?";
  return `role=${role.padEnd(7)} status=${status.padEnd(7)}`;
}

/**
 * The slice of `PgUserStore` this command consumes. Structural, so the real store satisfies it with
 * no cast and a test can supply an in-memory double — the same seam shape every other `--pg` command
 * here uses. Null off `--pg`: the directory is a live-store projection with no door and no offline
 * form, so every verb refuses rather than inventing one.
 */
export interface MemberStoreLike {
  list(): Promise<UserDoc[]>;
  get(email: string): Promise<UserDoc | null>;
  upsert(doc: UserDoc, actor: string): Promise<UserDoc>;
  remove(email: string, actor: string): Promise<boolean>;
  history(email: string): Promise<MemberEventLike[]>;
}

export interface MembersDeps {
  store: MemberStoreLike | null;
  /** Who the audit row is attributed to — the session identity, never typed by the caller. */
  actor: string;
  now: () => Date;
}

export interface MembersInvocation {
  readonly sub: string | undefined;
  readonly email: string | undefined;
  readonly role: string | undefined;
  readonly help: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * PURE: is this a role the directory accepts? Reads {@link USER_ROLES} rather than restating it, so
 * the verb can never drift from the schema the way the studio route did — which is the defect this
 * command was written alongside.
 */
export function parseRole(raw: string | undefined): UserRole | null {
  if (raw === undefined) return null;
  const candidate = raw.trim().toLowerCase();
  return (USER_ROLES as readonly string[]).includes(candidate) ? (candidate as UserRole) : null;
}

/** PURE: the role list, rendered for a refusal message. */
export function roleList(): string {
  return USER_ROLES.join(" | ");
}

/** PURE: one directory row, column-aligned. */
export function formatRow(u: UserDoc, emailWidth: number): string {
  return `  ${u.email.padEnd(emailWidth)}  ${u.role.padEnd(7)}  ${u.status.padEnd(7)}  invited-by ${u.invitedBy ?? "(seed)"}`;
}

const OFFLINE =
  "the member directory is a live-store projection — re-run with --pg (and `pnpm db:up` first).";

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export async function membersCommand(inv: MembersInvocation, deps: MembersDeps): Promise<Envelope> {
  if (inv.help || inv.sub === "help") return membersHelp();

  const store = deps.store;
  if (store === null) {
    return { ok: false, body: `members ${inv.sub ?? "list"} — ${OFFLINE}`, next: ["pnpm db:up"] };
  }

  switch (inv.sub ?? "list") {
    case "list":
      return listMembers(store);
    case "add":
      return addMember(inv, deps, store);
    case "role":
      return roleMember(inv, deps, store);
    case "remove":
      return removeMember(inv, deps, store);
    case "history":
      return historyMember(inv, store);
    default:
      return {
        ok: false,
        body: `members: unknown subcommand "${inv.sub}". Try: list | add | role | remove | history.`,
        next: ["storytree members --help"],
      };
  }
}

async function listMembers(store: MemberStoreLike): Promise<Envelope> {
  const users = await store.list();
  if (users.length === 0) {
    return {
      ok: true,
      body: [
        "The member directory is EMPTY — nobody is a studio member.",
        "",
        "That is not necessarily wrong: `STORYTREE_STUDIO_ADMINS` seeds a bootstrap admin who is",
        "resolved WITHOUT a row here (ADR-0043 d.4), so the owner can still get in.",
      ].join("\n"),
      next: ["storytree members add <email> --role admin --pg"],
    };
  }
  const width = Math.max(...users.map((u) => u.email.length));
  const byRole = new Map<string, number>();
  for (const u of users) byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
  return {
    ok: true,
    body: [
      `Studio member directory — ${users.length} member(s):`,
      "",
      ...[...users].sort((a, b) => a.email.localeCompare(b.email)).map((u) => formatRow(u, width)),
      "",
      `  by role: ${[...byRole].map(([r, n]) => `${r} ${n}`).join(" · ")}`,
    ].join("\n"),
    next: ["storytree members add <email> --role member --pg", "storytree members history <email> --pg"],
  };
}

async function addMember(
  inv: MembersInvocation,
  deps: MembersDeps,
  store: MemberStoreLike,
): Promise<Envelope> {
  const email = inv.email === undefined ? "" : normalizeEmail(inv.email);
  if (email === "" || !email.includes("@")) {
    return { ok: false, body: "members add: a valid email is required — storytree members add <email> --role <role> --pg" };
  }
  const role = parseRole(inv.role);
  if (role === null) {
    return {
      ok: false,
      body: `members add: --role must be one of: ${roleList()} (got ${inv.role === undefined ? "nothing" : `"${inv.role}"`}).`,
    };
  }
  // A duplicate is a REFUSAL, never a silent overwrite — the studio route's 409, kept here so the
  // two surfaces answer the same way. Re-roling an existing member is `members role`.
  if ((await store.get(email)) !== null) {
    return {
      ok: false,
      body: `members add: ${email} is already in the directory. Change their role with \`storytree members role\`.`,
      next: [`storytree members role ${email} <role> --pg`],
    };
  }
  const now = deps.now().toISOString();
  const created = await store.upsert(
    { email, role, status: "invited", invitedBy: deps.actor, createdAt: now, lastSeenAt: now },
    deps.actor,
  );
  return {
    ok: true,
    body: [
      `Added ${created.email} as ${created.role} (status ${created.status}).`,
      "",
      "NO INVITE EMAIL WAS SENT — that is the studio route's own best-effort extra, not part of the",
      "directory write. The row is authoritative either way; the member activates on their first",
      "request to the studio.",
    ].join("\n"),
    next: ["storytree members --pg"],
  };
}

async function roleMember(
  inv: MembersInvocation,
  deps: MembersDeps,
  store: MemberStoreLike,
): Promise<Envelope> {
  const email = inv.email === undefined ? "" : normalizeEmail(inv.email);
  if (email === "") return { ok: false, body: "members role: an email is required — storytree members role <email> <role> --pg" };
  const role = parseRole(inv.role);
  if (role === null) {
    return { ok: false, body: `members role: the role must be one of: ${roleList()}.` };
  }
  const existing = await store.get(email);
  if (existing === null) {
    return { ok: false, body: `members role: ${email} is not in the directory.`, next: [`storytree members add ${email} --role ${role} --pg`] };
  }
  // Spread the existing row so status / invitedBy / createdAt survive — the store's own merge
  // anchors email+createdAt, and the last-admin guard refuses a sole-admin downgrade by throwing.
  const updated = await store.upsert({ ...existing, role }, deps.actor);
  return {
    ok: true,
    body: `${updated.email}: ${existing.role} → ${updated.role}.`,
    next: ["storytree members --pg"],
  };
}

async function removeMember(
  inv: MembersInvocation,
  deps: MembersDeps,
  store: MemberStoreLike,
): Promise<Envelope> {
  const email = inv.email === undefined ? "" : normalizeEmail(inv.email);
  if (email === "") return { ok: false, body: "members remove: an email is required — storytree members remove <email> --pg" };
  const removed = await store.remove(email, deps.actor);
  if (!removed) return { ok: false, body: `members remove: ${email} is not in the directory.` };
  return {
    ok: true,
    body: [
      `Removed ${email} from the directory.`,
      "",
      "Their audit history is RETAINED (ADR-0043) — only the projection row is gone, so past",
      "attribution stays intact and they drop to the request-access wall on their next request.",
    ].join("\n"),
    next: [`storytree members history ${email} --pg`],
  };
}

async function historyMember(inv: MembersInvocation, store: MemberStoreLike): Promise<Envelope> {
  const email = inv.email === undefined ? "" : normalizeEmail(inv.email);
  if (email === "") return { ok: false, body: "members history: an email is required — storytree members history <email> --pg" };
  const events = await store.history(email);
  if (events.length === 0) return { ok: true, body: `No directory history for ${email}.` };
  return {
    ok: true,
    body: [
      `Directory history for ${email} — ${events.length} event(s), oldest first:`,
      "",
      ...events.map((e) => `  ${e.at}  ${e.type.padEnd(7)}  ${renderHistoryDoc(e.doc)} by ${e.actor}`),
    ].join("\n"),
  };
}

export function membersHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree members — the studio member directory (ADR-0043), as a CLI verb.",
      "",
      "  storytree members [list] --pg              who is in the directory, with roles",
      "  storytree members add <email> --role <r> --pg     invite a member (no email sent)",
      "  storytree members role <email> <role> --pg        re-role an existing member",
      "  storytree members remove <email> --pg             drop the projection row (history kept)",
      "  storytree members history <email> --pg            the append-only audit for one member",
      "",
      `  roles: ${roleList()} — admin ⊇ builder ⊇ member.`,
      "  `builder` is a member who may POST brokered writes; the studio's Members panel could not",
      "  grant it until 2026-08-24, which is why this verb exists alongside the panel rather than",
      "  behind it.",
      "",
      "Every write goes through the SAME store the studio's own /api/users handler uses, so the",
      "last-admin guard applies identically: downgrading or removing the only admin is REFUSED, and",
      "no flag overrides it. A service-account email is an ordinary member — that is how a harness",
      "identity (`storytree-*-harness`) is admitted past the studio's membership check.",
    ].join("\n"),
    next: ["storytree members --pg"],
  };
}
