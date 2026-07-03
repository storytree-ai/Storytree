// Typed client for the dev-server /api/* endpoints (see server/devApi.ts).

import type {
  ActivityPayload,
  AssetInput,
  AttestationsPayload,
  BuildIntentResult,
  BuildStatus,
  Member,
  Comment,
  DbStatus,
  DocContent,
  DocMeta,
  GuidanceAsset,
  InviteResult,
  MeInfo,
  NewComment,
  PresencePayload,
  ReviewFeedPayload,
  StoreHealth,
  SuggestionRecord,
  TopicKind,
  TreePayload,
  UatVerdictResult,
  UserRole,
} from './types';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ── chat stream (chat-panel capability, ADR-0070) ───────────────────────────────────────────────
//
// The studio frontend's ONLY path to the desktop chat route is this streaming seam — the panel holds
// no fetch and imports no agent/drive/model code (ADR-0004 / the modelPathBoundary wall). The chat
// route answers `text/event-stream`, NOT a JSON body, so the http<T> helper above (which JSON.parses
// the WHOLE body) cannot consume it; chatStream reads the response body stream directly, splits on the
// SSE frame separator, and parses each `data:` line as plain JSON.
//
// THE WIRE SHAPE is the cross-boundary contract owned by `chat-sse-mount` (apps/desktop) — the
// done/error/refused `data:` frames. It is declared HERE as plain studio types (a discriminated union),
// NOT imported from @storytree/drive (forbidden in apps/studio/src): the frames are plain JSON, so the
// studio rides the wire shape with a locally-declared type (the same move boot-read-routes makes for
// LocalMe). Re-cite the producer at apps/desktop/src/backend/chat-sse-mount.ts.

/** A NON-terminal streaming frame — one assistant text fragment as it generates. Zero or more
 *  precede the terminal frame; the panel appends each `text` to a live render so the operator sees
 *  tokens stream (the responsiveness fix). The authoritative answer is the terminal `done` proposal. */
export interface ChatDeltaEvent {
  type: 'delta';
  text: string;
}
/** The terminal success frame — the authoritative proposal text plus optional session metrics. */
export interface ChatDoneEvent {
  type: 'done';
  proposal: string;
  costUsd?: number;
  turns?: number;
}
/** The terminal failure frame — a dead/errored session, rendered as a distinct error state. */
export interface ChatErrorEvent {
  type: 'error';
  error: string;
}
/** The terminal single-session refusal (ADR-0108 d.6) — rendered as a distinct "busy" state, NOT a
 *  failure (nothing failed; the session never started, so the operator can retry). */
export interface ChatRefusedEvent {
  type: 'refused';
  reason: string;
}
/** One SSE `data:` frame from /api/chat, discriminated by `type`. A stream is zero or more
 *  non-terminal `delta` frames followed by exactly one terminal `done`/`error`/`refused` frame. */
export type ChatEvent = ChatDeltaEvent | ChatDoneEvent | ChatErrorEvent | ChatRefusedEvent;

/** A frame that parses to JSON but isn't a recognised ChatEvent shape — defensively ignored. */
function isChatEvent(value: unknown): value is ChatEvent {
  if (value === null || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  return t === 'delta' || t === 'done' || t === 'error' || t === 'refused';
}

/**
 * POST `intent` to /api/chat and stream the SSE response, invoking `onEvent` for each typed frame as
 * it arrives. Resolves when the stream ends (the backend `end()`s the response after the terminal
 * frame); REJECTS when the route is absent or the request fails (a non-OK status or a network error —
 * the studio-standalone case where /api/chat is not mounted), so the caller can degrade honestly
 * rather than hang on a stream that never arrives.
 */
async function chatStream(intent: string, onEvent: (event: ChatEvent) => void): Promise<void> {
  const res = await fetch('/api/chat', jsonInit('POST', { intent }));
  if (!res.ok || res.body === null) {
    // Absent route / fail-closed backend (e.g. studio-standalone 404, or the intent guard's 400).
    throw new Error(`chat unavailable (${res.status} ${res.statusText})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Parse complete SSE frames (separated by a blank line) out of the rolling buffer.
  const drainFrames = (): void => {
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice('data:'.length).trim();
        if (!json) continue;
        try {
          const parsed: unknown = JSON.parse(json);
          if (isChatEvent(parsed)) onEvent(parsed);
        } catch {
          // A malformed frame is skipped, not fatal — the stream may still terminate cleanly.
        }
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value !== undefined) {
      buffer += decoder.decode(value, { stream: true });
      drainFrames();
    }
    if (done) break;
  }
  // Flush any trailing frame the stream ended without a terminating blank line.
  buffer += decoder.decode();
  if (buffer && !buffer.endsWith('\n\n')) buffer += '\n\n';
  drainFrames();
}

const q = encodeURIComponent;

export const api = {
  listDocs: (): Promise<DocMeta[]> => http('/api/docs'),
  tree: (): Promise<TreePayload> => http('/api/tree'),
  docContent: (id: string): Promise<DocContent> => http(`/api/docs/content?id=${q(id)}`),

  // The chat panel's single backend seam (chat-panel capability, ADR-0070 / ADR-0004). Streams the
  // /api/chat SSE response, one onEvent per typed done/error/refused frame; rejects on an absent route.
  chatStream,

  listComments: (topicId?: string): Promise<Comment[]> =>
    http(topicId ? `/api/comments?topicId=${q(topicId)}` : '/api/comments'),
  createComment: (input: NewComment): Promise<Comment> =>
    http('/api/comments', jsonInit('POST', input)),
  updateComment: (id: string, patch: { body?: string; resolved?: boolean }): Promise<Comment> =>
    http(`/api/comments?id=${q(id)}`, jsonInit('PATCH', patch)),
  deleteComment: (id: string): Promise<{ ok: true }> =>
    http(`/api/comments?id=${q(id)}`, { method: 'DELETE' }),

  // Review-mode suggestion seam (ADR-0140). createSuggestion posts a member PROPOSAL (the
  // member-suggest policy gate opens exactly this path); decideSuggestion drives the admin-only
  // accept/reject route; reviewFeed is cap 5's one-poll comments+suggestions payload.
  createSuggestion: (input: {
    blockId: string;
    proposedText: string;
    topicKind?: TopicKind;
    topicId?: string;
    originalText?: string;
  }): Promise<SuggestionRecord> => http('/api/suggestions', jsonInit('POST', input)),
  decideSuggestion: (input: {
    id: string;
    decision: 'accept' | 'reject';
  }): Promise<SuggestionRecord> =>
    // The component seam speaks {id, decision}; cap 3's route speaks {suggestionId, action}.
    http(
      '/api/suggestions/decision',
      jsonInit('POST', { suggestionId: input.id, action: input.decision }),
    ),
  reviewFeed: (topicId: string): Promise<ReviewFeedPayload> =>
    http(`/api/review/feed?topicId=${q(topicId)}`),

  listAssets: (): Promise<GuidanceAsset[]> => http('/api/assets'),
  createAsset: (input: AssetInput): Promise<GuidanceAsset> =>
    http('/api/assets', jsonInit('POST', input)),
  updateAsset: (id: string, input: AssetInput): Promise<GuidanceAsset> =>
    http(`/api/assets?id=${q(id)}`, jsonInit('PATCH', input)),
  deleteAsset: (id: string): Promise<{ ok: true }> =>
    http(`/api/assets?id=${q(id)}`, { method: 'DELETE' }),

  // Store health (see components/StoreBanner.tsx). /api/health never 500s and
  // the server's own DB probe times out at ~4s; the client-side abort is a
  // backstop so a wedged request can't pin the banner's in-flight guard.
  health: (): Promise<StoreHealth> =>
    http('/api/health', { signal: AbortSignal.timeout(10_000) }),
  // Presence poll (see lib/presence.ts). Same abort backstop as health: the
  // server-side probe already times out at ~4s and answers {sessions: null},
  // so a wedged request must not pin the poll's in-flight guard.
  presence: (): Promise<PresencePayload> =>
    http('/api/presence', { signal: AbortSignal.timeout(10_000) }),
  // In-flight build activity (see lib/buildActivity.ts, ADR-0048). Same advisory
  // contract + abort backstop as presence: a down DB answers {builds: null}.
  activity: (): Promise<ActivityPayload> =>
    http('/api/activity', { signal: AbortSignal.timeout(10_000) }),
  // UI-driven build (ADR-0090 Phase 1 "the local loop"). build() posts a build INTENT (a safe
  // write — never a verdict); buildStatus() polls the run's coarse transcript + status. The frontend
  // imports NO build code (ADR-0004) — its only path to a build is these two endpoints.
  build: (unitId: string): Promise<BuildIntentResult> =>
    http('/api/build', jsonInit('POST', { unitId })),
  buildStatus: (runId: string): Promise<BuildStatus> =>
    http(`/api/build?runId=${q(runId)}`),
  // Accept a chat PROPOSAL into a build (ADR-0108 d.3 / ADR-0133 d.3). acceptBuild() posts the SAME
  // build INTENT as build() — a safe write, never a verdict — but to /api/chat/accept, the DISTINCT
  // route whose whole purpose is accept-PROVENANCE: it records that the build came from a human
  // accepting a chat proposal, not a generic build POST. The routing is identical (the desktop mounts
  // both over the SAME BuildContext/registry — apps/desktop/src/backend/accept-dispatch.ts), only the
  // provenance differs. The minted run is polled via the SAME buildStatus() above (one registry, one
  // GET /api/build?runId poll). The accept route's 202 body is { ok: true, runId }; we read only runId
  // (http<T> already throws on a non-2xx — 404 not-buildable / 409 build-already-running / 400 missing
  // unitId — so a RESOLVED promise IS ok:true), hence the BuildIntentResult shape, as adopt() does.
  acceptBuild: (unitId: string): Promise<BuildIntentResult> =>
    http('/api/chat/accept', jsonInit('POST', { unitId })),
  // Adopt a brownfield (`mapped`) story (ADR-0097 Layer 1). adopt() posts an adoption INTENT that
  // mirrors build() exactly: it returns a `runId` and the spine runs the adoption fire-and-forget in
  // the SAME build registry (flips the story `mapped → proposed` + observe-and-signs its `observe`
  // gates). Progress is polled with the EXISTING buildStatus() above (one registry, one poll path) —
  // terminal `passed` (all observe gates adopted + status flipped) or `failed` (a gate refused). The
  // frontend imports NO spine code (ADR-0004) — this endpoint is its only seam to the proving process.
  adopt: (storyId: string): Promise<BuildIntentResult> =>
    http('/api/adopt', jsonInit('POST', { storyId })),

  dbStatus: (): Promise<DbStatus> => http('/api/db/status'),
  dbStart: (): Promise<{ ok: true }> => http('/api/db/start', { method: 'POST' }),
  // Hosted-native DB wake (ADR-0049): keyless Cloud SQL Admin REST, so it works on Cloud Run where
  // gcloud-based dbStart() answers 403. Admin-gated server-side; 202 fire-and-forget like dbStart.
  dbWake: (): Promise<{ ok: true }> => http('/api/db/wake', { method: 'POST' }),

  // Members (app-owned users, ADR-0043). /api/me is the one endpoint a non-member may reach;
  // /api/users is admin-only (the server enforces; the panel is also hidden for members).
  // Same 10s abort backstop as health/presence/activity: resolving membership reads the live
  // store, so an idle-stopped DB can wedge the request — without this the SPA sits on "Resolving
  // access…" forever instead of surfacing the error/wake path. The server degrades sooner (see
  // serve.ts MEMBERS_RESOLVE_TIMEOUT_MS), so the happy outcome is a storeUnreachable banner, not this.
  me: (): Promise<MeInfo> => http('/api/me', { signal: AbortSignal.timeout(10_000) }),

  // Per-UAT-test attestations (ADR-0044): a story's UAT tests with their per-test marks + proven
  // state. GET, member-readable. The lower-rigor vouch POST is no longer surfaced — the UAT table
  // signs REAL verdicts via signUat (below); the server's /api/attestations POST path stays intact.
  attestations: (storyId: string): Promise<AttestationsPayload> =>
    http(`/api/attestations?storyId=${q(storyId)}`),

  // The "I saw it work" operator-attested VERDICT (ADR-0082) — a REAL events.verdict signature that
  // greens the story crown, DISTINCT from the lower-rigor events.attestation vouch (now UI-hidden).
  // Admin-only; the server stamps the signer from the verified identity (the client cannot forge it)
  // and refuses a machine-witness test (a click is not a machine proof).
  signUat: (input: { testId: string; outcome?: 'pass' | 'fail'; note?: string }): Promise<UatVerdictResult> =>
    http('/api/uat/attest', jsonInit('POST', input)),

  listUsers: (): Promise<Member[]> => http('/api/users'),
  // Returns the new row plus `notify` — whether the invite email actually went out (see MembersPanel).
  inviteUser: (email: string, role: UserRole): Promise<InviteResult> =>
    http('/api/users', jsonInit('POST', { email, role })),
  setUserRole: (email: string, role: UserRole): Promise<Member> =>
    http('/api/users', jsonInit('PATCH', { email, role })),
  removeUser: (email: string): Promise<{ ok: true }> =>
    http(`/api/users?email=${q(email)}`, { method: 'DELETE' }),
};
