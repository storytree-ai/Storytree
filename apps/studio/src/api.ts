// Typed client for the dev-server /api/* endpoints (see server/devApi.ts).

import type {
  AssetInput,
  AttestationMark,
  AttestationsPayload,
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
  dbStatus: (): Promise<DbStatus> => http('/api/db/status'),
  dbStart: (): Promise<{ ok: true }> => http('/api/db/start', { method: 'POST' }),

  // Members (app-owned users, ADR-0043). /api/me is the one endpoint a non-member may reach;
  // /api/users is admin-only (the server enforces; the panel is also hidden for members).
  me: (): Promise<MeInfo> => http('/api/me'),

  // Per-UAT-test attestations (ADR-0044). GET is member-readable; POST (record) is admin-only
  // (the server stamps the signer from the verified identity — the client `signer` is ignored).
  attestations: (storyId: string): Promise<AttestationsPayload> =>
    http(`/api/attestations?storyId=${q(storyId)}`),
  recordAttestation: (input: { testId: string; outcome: 'pass' | 'fail'; note?: string }): Promise<AttestationMark> =>
    http('/api/attestations', jsonInit('POST', input)),

  listUsers: (): Promise<Member[]> => http('/api/users'),
  // Returns the new row plus `notify` — whether the invite email actually went out (see MembersPanel).
  inviteUser: (email: string, role: UserRole): Promise<InviteResult> =>
    http('/api/users', jsonInit('POST', { email, role })),
  setUserRole: (email: string, role: UserRole): Promise<Member> =>
    http('/api/users', jsonInit('PATCH', { email, role })),
  removeUser: (email: string): Promise<{ ok: true }> =>
    http(`/api/users?email=${q(email)}`, { method: 'DELETE' }),
};
