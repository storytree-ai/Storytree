// Typed client for the dev-server /api/* endpoints (see server/devApi.ts).

import type {
  ActivityPayload,
  AssetInput,
  AttestationMark,
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
  StoreHealth,
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

const q = encodeURIComponent;

export const api = {
  listDocs: (): Promise<DocMeta[]> => http('/api/docs'),
  tree: (): Promise<TreePayload> => http('/api/tree'),
  docContent: (id: string): Promise<DocContent> => http(`/api/docs/content?id=${q(id)}`),

  listComments: (topicId?: string): Promise<Comment[]> =>
    http(topicId ? `/api/comments?topicId=${q(topicId)}` : '/api/comments'),
  createComment: (input: NewComment): Promise<Comment> =>
    http('/api/comments', jsonInit('POST', input)),
  updateComment: (id: string, patch: { body?: string; resolved?: boolean }): Promise<Comment> =>
    http(`/api/comments?id=${q(id)}`, jsonInit('PATCH', patch)),
  deleteComment: (id: string): Promise<{ ok: true }> =>
    http(`/api/comments?id=${q(id)}`, { method: 'DELETE' }),

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

  // Per-UAT-test attestations (ADR-0044). GET is member-readable; POST (record) is admin-only
  // (the server stamps the signer from the verified identity — the client `signer` is ignored).
  attestations: (storyId: string): Promise<AttestationsPayload> =>
    http(`/api/attestations?storyId=${q(storyId)}`),
  recordAttestation: (input: { testId: string; outcome: 'pass' | 'fail'; note?: string }): Promise<AttestationMark> =>
    http('/api/attestations', jsonInit('POST', input)),

  // The "I saw it work" operator-attested VERDICT (ADR-0082) — a REAL events.verdict signature that
  // greens the story crown, DISTINCT from recordAttestation's lower-rigor events.attestation vouch.
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
