// Unit tests for the invite mailer (studio-members `invite-notify`). The owned SMTP client is
// exercised end-to-end against a fake SMTP server over PLAIN TCP — sendMailOverSocket takes any
// Duplex, so the whole conversation (AUTH LOGIN, dot-stuffing, the message, the data terminator) is
// proven without TLS certs. The env-driven wrapper is covered for the disabled + failed paths.

import { describe, it, expect } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import {
  buildMessage,
  createInviteMailer,
  disabledInviteMailer,
  inviteContent,
  sendMailOverSocket,
} from './inviteMailer';

/** What the fake server captured from one SMTP session. */
interface Captured {
  user: string;
  pass: string;
  mailFrom: string;
  rcptTo: string;
  data: string;
  quit: boolean;
}

/**
 * A minimal scripted SMTP server (plain TCP). Resolves `captured` once a full message is delivered.
 * Speaks just enough of RFC 5321 for the client: greeting, EHLO (multiline), AUTH LOGIN, MAIL/RCPT,
 * DATA + the lone-dot terminator, QUIT.
 */
function fakeSmtpServer(): Promise<{ port: number; captured: Promise<Captured>; close: () => Promise<void> }> {
  return new Promise((resolveServer) => {
    let resolveCaptured!: (c: Captured) => void;
    const captured = new Promise<Captured>((r) => (resolveCaptured = r));

    const server = net.createServer((socket) => {
      const cap: Captured = { user: '', pass: '', mailFrom: '', rcptTo: '', data: '', quit: false };
      let phase: 'cmd' | 'authUser' | 'authPass' | 'data' = 'cmd';
      let buffer = '';
      socket.setEncoding('utf8');
      socket.write('220 fake ESMTP ready\r\n');

      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf('\r\n')) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          handleLine(line);
        }
      });

      function handleLine(line: string): void {
        if (phase === 'data') {
          if (line === '.') {
            phase = 'cmd';
            socket.write('250 2.0.0 OK queued\r\n');
          } else {
            cap.data += (cap.data ? '\r\n' : '') + line;
          }
          return;
        }
        if (phase === 'authUser') {
          cap.user = Buffer.from(line, 'base64').toString('utf8');
          phase = 'authPass';
          socket.write('334 UGFzc3dvcmQ6\r\n'); // base64("Password:")
          return;
        }
        if (phase === 'authPass') {
          cap.pass = Buffer.from(line, 'base64').toString('utf8');
          phase = 'cmd';
          socket.write('235 2.7.0 Accepted\r\n');
          return;
        }
        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO')) socket.write('250-fake greets you\r\n250 AUTH LOGIN\r\n');
        else if (upper === 'AUTH LOGIN') {
          phase = 'authUser';
          socket.write('334 VXNlcm5hbWU6\r\n'); // base64("Username:")
        } else if (upper.startsWith('MAIL FROM')) {
          cap.mailFrom = line;
          socket.write('250 2.1.0 OK\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          cap.rcptTo = line;
          socket.write('250 2.1.5 OK\r\n');
        } else if (upper === 'DATA') {
          phase = 'data';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          cap.quit = true;
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
          resolveCaptured(cap);
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });

    server.listen(0, '127.0.0.1', () => {
      resolveServer({
        port: (server.address() as AddressInfo).port,
        captured,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('inviteContent', () => {
  it('names the inviter, the role, and the exact Google account + studio URL', () => {
    const { subject, body } = inviteContent('newbie@example.com', 'member', 'owner@example.com', 'https://studio.example');
    expect(subject).toContain('invited');
    expect(body).toContain('owner@example.com has invited you');
    expect(body).toContain('as a member');
    expect(body).toContain('https://studio.example');
    expect(body).toContain('newbie@example.com');
  });

  it('reads naturally with no inviter and an admin role (the "an admin" article)', () => {
    const { body } = inviteContent('a@b.com', 'admin', null, 'https://s');
    expect(body).toContain("You've been invited");
    expect(body).toContain('as an admin');
  });
});

describe('disabledInviteMailer', () => {
  it('always skips, carrying a reason', async () => {
    const r = await disabledInviteMailer().send('x@y.com', 'member', 'admin@z.com');
    expect(r.status).toBe('skipped');
    expect(r.detail).toBeTruthy();
  });
});

describe('createInviteMailer (env gating)', () => {
  it('is disabled when SMTP env is incomplete', async () => {
    const mailer = createInviteMailer({ STORYTREE_STUDIO_SMTP_USER: 'me@gmail.com' } as NodeJS.ProcessEnv);
    expect((await mailer.send('x@y.com', 'member', null)).status).toBe('skipped');
  });

  it('reports `failed` (never throws) when the SMTP host is unreachable', async () => {
    const mailer = createInviteMailer({
      STORYTREE_STUDIO_SMTP_USER: 'me@gmail.com',
      STORYTREE_STUDIO_SMTP_PASS: 'app-pass',
      STORYTREE_STUDIO_PUBLIC_URL: 'https://studio.example',
      STORYTREE_STUDIO_SMTP_HOST: '127.0.0.1',
      STORYTREE_STUDIO_SMTP_PORT: '1', // nothing listens → connection refused
    } as NodeJS.ProcessEnv);
    const r = await mailer.send('x@y.com', 'member', null);
    expect(r.status).toBe('failed');
    expect(r.detail).toBeTruthy();
  });
});

describe('SMTP header/envelope injection guard', () => {
  // Control chars built from codepoints so the test source stays pure printable ASCII.
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const injected = `newbie@example.com${CR}${LF}Bcc: evil@attacker.example`;

  it('buildMessage refuses a recipient carrying CR/LF (would inject a header / extra envelope line)', () => {
    expect(() =>
      buildMessage({
        from: 'me@gmail.com',
        fromName: 'storytree studio',
        to: injected,
        subject: 'hi',
        body: 'body',
      }),
    ).toThrow(/control characters/i);
  });

  it('send() degrades a CRLF recipient to `failed` (best-effort) and never opens a connection', async () => {
    const mailer = createInviteMailer({
      STORYTREE_STUDIO_SMTP_USER: 'me@gmail.com',
      STORYTREE_STUDIO_SMTP_PASS: 'app-pass',
      STORYTREE_STUDIO_PUBLIC_URL: 'https://studio.example',
    } as NodeJS.ProcessEnv);
    // The guard throws inside buildMessage, before any socket is opened; send's catch turns it into
    // a `failed` notice (never a throw, never a sent message).
    const r = await mailer.send(injected, 'member', 'admin@z.com');
    expect(r.status).toBe('failed');
    expect(r.detail).toMatch(/control characters/i);
  });
});

describe('sendMailOverSocket (full SMTP conversation)', () => {
  it('authenticates, sends the message, and dot-stuffs leading-dot body lines', async () => {
    const srv = await fakeSmtpServer();
    try {
      const socket = net.connect(srv.port, '127.0.0.1');
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });
      // A body line starting with '.' must arrive doubled at the server (dot-stuffing).
      const message = buildMessage({
        from: 'me@gmail.com',
        fromName: 'storytree studio',
        to: 'newbie@example.com',
        subject: 'You are invited',
        body: 'line one\n.dotted line\nlast line',
      });
      await sendMailOverSocket(socket, { user: 'me@gmail.com', pass: 'app-pass' }, 'newbie@example.com', message);

      const cap = await srv.captured;
      expect(cap.user).toBe('me@gmail.com');
      expect(cap.pass).toBe('app-pass');
      expect(cap.mailFrom).toContain('me@gmail.com');
      expect(cap.rcptTo).toContain('newbie@example.com');
      expect(cap.quit).toBe(true);
      // headers + body survived
      expect(cap.data).toContain('Subject: You are invited');
      expect(cap.data).toContain('To: <newbie@example.com>');
      expect(cap.data).toContain('line one');
      expect(cap.data).toContain('last line');
      // the leading-dot line was stuffed on the wire ('..dotted'), un-stuffing is the receiver's job
      expect(cap.data).toContain('..dotted line');
    } finally {
      await srv.close();
    }
  });
});
