// Invite email (studio-members `invite-notify`): when an admin invites a member, send them a real
// email with the studio link, so they actually learn they have access (the old flow only wrote an
// `invited` row and relied on the admin telling them out-of-band — apiRouter.ts handleUsers POST).
//
// Owned, dependency-free SMTP-over-TLS (the repo ethos — no nodemailer): Gmail submission on implicit
// TLS (465) with AUTH LOGIN. Best-effort by contract — `send` NEVER throws; the invite row is already
// persisted, so a mail failure degrades to a `failed` notice, never a 500. Enabled only when the Gmail
// user + app password + the public studio URL are all configured; otherwise a disabled mailer reports
// `skipped` (local dev + an unconfigured deploy both degrade cleanly).
//
// Config (env):
//   STORYTREE_STUDIO_SMTP_USER       the Gmail address mail is sent FROM (also the SMTP login)
//   STORYTREE_STUDIO_SMTP_PASS       a Google App Password (NOT the account password; needs 2FA)
//   STORYTREE_STUDIO_PUBLIC_URL      the studio URL put in the email body (the IAP/Cloud Run URL)
//   STORYTREE_STUDIO_SMTP_HOST       optional, default smtp.gmail.com
//   STORYTREE_STUDIO_SMTP_PORT       optional, default 465 (implicit TLS)
//   STORYTREE_STUDIO_SMTP_FROM_NAME  optional display name, default "storytree studio"

import { connect as tlsConnect } from 'node:tls';
import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';

export type InviteNoticeStatus = 'sent' | 'skipped' | 'failed';

/** What an invite's email attempt did — rides back on the POST /api/users response (advisory). */
export interface InviteNotice {
  status: InviteNoticeStatus;
  /** A human one-liner: why it was skipped, or the failure reason. Absent for a clean `sent`. */
  detail?: string;
}

export interface InviteMailer {
  /** Best-effort: NEVER throws — the invite row is already authoritative. Returns what happened. */
  send(to: string, role: 'admin' | 'member', invitedBy: string | null): Promise<InviteNotice>;
}

const DISABLED_DETAIL =
  'email notifications are off — set STORYTREE_STUDIO_SMTP_USER, STORYTREE_STUDIO_SMTP_PASS and ' +
  'STORYTREE_STUDIO_PUBLIC_URL to enable. Share the studio link manually for now.';

/** A mailer that sends nothing (local dev / an unconfigured deploy): every invite reports `skipped`. */
export function disabledInviteMailer(detail: string = DISABLED_DETAIL): InviteMailer {
  return { send: async () => ({ status: 'skipped', detail }) };
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromName: string;
  studioUrl: string;
}

/**
 * Build the invite mailer from env. Enabled only when the Gmail user + app password + the public
 * studio URL are all present; otherwise a disabled mailer (so an unconfigured front degrades to
 * `skipped`, never crashes). Defaults target Gmail submission over implicit TLS (465).
 */
export function createInviteMailer(env: NodeJS.ProcessEnv): InviteMailer {
  const user = env.STORYTREE_STUDIO_SMTP_USER?.trim();
  // Google shows App Passwords grouped in fours with spaces; the real secret is the 16 chars
  // without them — strip all whitespace so a pasted "abcd efgh ijkl mnop" still authenticates.
  const pass = env.STORYTREE_STUDIO_SMTP_PASS?.replace(/\s+/g, '');
  const studioUrl = env.STORYTREE_STUDIO_PUBLIC_URL?.trim();
  if (!user || !pass || !studioUrl) return disabledInviteMailer();
  const cfg: SmtpConfig = {
    host: env.STORYTREE_STUDIO_SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number(env.STORYTREE_STUDIO_SMTP_PORT) || 465,
    user,
    pass,
    fromName: env.STORYTREE_STUDIO_SMTP_FROM_NAME?.trim() || 'storytree studio',
    studioUrl,
  };
  return {
    async send(to, role, invitedBy): Promise<InviteNotice> {
      try {
        const { subject, body } = inviteContent(to, role, invitedBy, cfg.studioUrl);
        const message = buildMessage({ from: cfg.user, fromName: cfg.fromName, to, subject, body });
        const socket = await openTlsSocket(cfg.host, cfg.port);
        await sendMailOverSocket(socket, cfg, to, message);
        return { status: 'sent' };
      } catch (err) {
        return { status: 'failed', detail: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// ---------- message content ----------

const article = (role: string): 'an' | 'a' => (role === 'admin' ? 'an' : 'a');

/** The invite email's subject + plain-text body. Pure — exported for the unit test. */
export function inviteContent(
  to: string,
  role: 'admin' | 'member',
  invitedBy: string | null,
  studioUrl: string,
): { subject: string; body: string } {
  const subject = "You're invited to the storytree studio";
  const opener = invitedBy
    ? `${invitedBy} has invited you to the storytree studio as ${article(role)} ${role}.`
    : `You've been invited to the storytree studio as ${article(role)} ${role}.`;
  const body = [
    'Hi,',
    '',
    opener,
    '',
    'Open the studio and sign in with Google:',
    studioUrl,
    '',
    `Use the Google account this email was sent to (${to}) — that's the one on the members list.`,
    '',
    '— storytree studio',
  ].join('\n');
  return { subject, body };
}

const quoted = (s: string): string => `"${s.replace(/["\\]/g, '')}"`;

/**
 * Reject an address carrying a control character (CR/LF/NUL/DEL, any code < 0x20 or 0x7f) BEFORE it
 * is written into a raw SMTP line (RCPT TO / MAIL FROM / the `To:` header). An embedded `\r\n` would
 * terminate the command/header early and inject attacker-controlled envelope recipients or headers —
 * SMTP header/envelope injection. Belt-and-suspenders to the schema-level guard
 * (@storytree/studio-members `emailField`): the mailer fails closed on ANY call path. Throws — every
 * caller runs inside `send`'s best-effort try, so this degrades to a `failed` notice, never a 500.
 * A charCodeAt scan (no literal control chars in source).
 */
function assertMailSafeAddress(addr: string): void {
  for (let i = 0; i < addr.length; i++) {
    const code = addr.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error('invalid email address: control characters (CR/LF) are not allowed');
    }
  }
}

/** Assemble RFC-5322 headers + body into the wire message (CRLF line endings). Pure. */
export function buildMessage(m: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}): string {
  // Fail closed before either address reaches a raw header line (SMTP header injection guard).
  assertMailSafeAddress(m.to);
  assertMailSafeAddress(m.from);
  const headers = [
    `From: ${quoted(m.fromName)} <${m.from}>`,
    `To: <${m.to}>`,
    `Subject: ${m.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@storytree.studio>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const bodyCrlf = m.body.split(/\r?\n/).join('\r\n');
  return headers.join('\r\n') + '\r\n\r\n' + bodyCrlf;
}

// ---------- SMTP transport (owned, no dependency) ----------

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

/** Dot-stuff the message body for the DATA stage: a line starting with '.' is doubled (RFC 5321). */
function dotStuff(s: string): string {
  return s
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');
}

/** SNI servername must be a hostname, not an IP literal (RFC 6066) — omit it for an IP host. */
const isIpLiteral = (host: string): boolean => /^[0-9.]+$/.test(host) || host.includes(':');

/** Open an implicit-TLS socket to the SMTP submission port. Rejects on connect error / timeout. */
function openTlsSocket(host: string, port: number): Promise<Duplex> {
  return new Promise<Duplex>((resolve, reject) => {
    const socket = tlsConnect(
      { host, port, ...(isIpLiteral(host) ? {} : { servername: host }) },
      () => resolve(socket),
    );
    socket.once('error', reject);
    socket.setTimeout(20_000, () => socket.destroy(new Error('SMTP connection timed out')));
  });
}

interface Reply {
  code: number;
  text: string;
}

/** A minimal request/reply pump over an SMTP socket. Reads multiline replies, fails-fast on close. */
function smtpIo(socket: Duplex): {
  expect(ok: number[]): Promise<Reply>;
  cmd(line: string, ok: number[]): Promise<Reply>;
} {
  let buffer = '';
  let pending: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  let terminal: Error | null = null;
  socket.setEncoding('utf8');

  const fail = (err: Error): void => {
    if (pending) {
      const p = pending;
      pending = null;
      p.reject(err);
    } else {
      terminal ??= err;
    }
  };

  function deliver(): void {
    if (!pending) return;
    // A reply is complete once a line reads `NNN ` (code + space); `NNN-` lines are continuations.
    const lines = buffer.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (/^\d{3} /.test(line)) {
        const replyLines = lines.slice(0, i + 1);
        const consumed = replyLines.reduce((n, l) => n + l.length + 2, 0); // +2 for each CRLF
        buffer = buffer.slice(consumed);
        const p = pending;
        pending = null;
        p?.resolve({ code: Number(line.slice(0, 3)), text: replyLines.join('\n') });
        return;
      }
    }
  }

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    deliver();
  });
  socket.on('error', (e: Error) => fail(e));
  socket.on('close', () => fail(new Error('SMTP connection closed unexpectedly')));

  function read(): Promise<Reply> {
    return new Promise<Reply>((resolve, reject) => {
      if (terminal) {
        reject(terminal);
        return;
      }
      pending = { resolve, reject };
      deliver();
    });
  }

  async function expect(ok: number[]): Promise<Reply> {
    const reply = await read();
    if (!ok.includes(reply.code)) {
      throw new Error(`SMTP: expected ${ok.join('/')}, got ${reply.code} — ${reply.text}`);
    }
    return reply;
  }

  async function cmd(line: string, ok: number[]): Promise<Reply> {
    socket.write(line + '\r\n');
    return expect(ok);
  }

  return { expect, cmd };
}

/**
 * Drive the SMTP conversation to deliver one message. The socket is any Duplex (a real TLSSocket in
 * production, a plain net.Socket in the test), so the protocol logic is exercised without TLS certs.
 */
export async function sendMailOverSocket(
  socket: Duplex,
  cfg: { user: string; pass: string },
  to: string,
  message: string,
): Promise<void> {
  // Fail closed before either address is written into a raw envelope line (SMTP injection guard) —
  // belt-and-suspenders even though buildMessage already checked, since this is the seam a test /
  // future caller could reach directly.
  assertMailSafeAddress(to);
  assertMailSafeAddress(cfg.user);
  const io = smtpIo(socket);
  try {
    await io.expect([220]); // server greeting
    await io.cmd('EHLO storytree.studio', [250]);
    await io.cmd('AUTH LOGIN', [334]);
    await io.cmd(b64(cfg.user), [334]);
    await io.cmd(b64(cfg.pass), [235]);
    await io.cmd(`MAIL FROM:<${cfg.user}>`, [250]);
    await io.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await io.cmd('DATA', [354]);
    // cmd appends CRLF, so the trailing `\r\n.` becomes the `\r\n.\r\n` end-of-data terminator.
    await io.cmd(dotStuff(message) + '\r\n.', [250]);
    await io.cmd('QUIT', [221]).catch(() => undefined); // a missing 221 doesn't fail a sent message
  } finally {
    socket.end();
  }
}
