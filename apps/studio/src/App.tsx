import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { AppDataContext, type AppData } from './lib/appData';
import { useOperator } from './lib/operator';
import { notifyStoreRecovered } from './lib/presence';
import { membersHref, homeHref, libraryHref, treeHref, useRoute } from './lib/route';
import type { Comment, DocMeta, GuidanceAsset, MeInfo } from './types';
import { Sidebar } from './components/Sidebar';
import { StoreBanner } from './components/StoreBanner';
import { Home } from './components/Home';
import { DocView } from './components/DocView';
import { Library } from './components/Library';
import { AssetView } from './components/AssetView';
import { AssetEditor } from './components/AssetEditor';
import { TreeView } from './components/TreeView';
import { MembersPanel } from './components/MembersPanel';

/** A non-member's MeInfo while it's still loading — never read as a member. */
const ANON_ME: MeInfo = { email: null, role: null, status: null, member: false };

export function App(): React.JSX.Element {
  const route = useRoute();
  const [operator, setOperator] = useOperator();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [meStatus, setMeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [meError, setMeError] = useState<string>('');
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [assets, setAssets] = useState<GuidanceAsset[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  const refreshComments = useCallback(async (): Promise<void> => {
    setComments(await api.listComments());
  }, []);
  const refreshAssets = useCallback(async (): Promise<void> => {
    setAssets(await api.listAssets());
  }, []);

  // Resolve the caller's membership first (ADR-0043): IAP authenticated them; this asks the
  // app whether they're in, and as what. Non-members never load the corpus (they'd be 403'd anyway).
  const loadMe = useCallback(async (): Promise<void> => {
    setMeStatus('loading');
    try {
      setMe(await api.me());
      setMeStatus('ready');
    } catch (e) {
      setMeError(e instanceof Error ? e.message : String(e));
      setMeStatus('error');
    }
  }, []);

  const loadInitial = useCallback(async (): Promise<void> => {
    try {
      const [d, a, c] = await Promise.all([api.listDocs(), api.listAssets(), api.listComments()]);
      setDocs(d);
      setAssets(a);
      setComments(c);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const isMember = me?.member === true && me.storeUnreachable !== true;

  // Only members load the corpus — gated on membership resolving.
  useEffect(() => {
    if (meStatus === 'ready' && isMember) void loadInitial();
  }, [meStatus, isMember, loadInitial]);

  const onStoreRecovered = useCallback((): void => {
    // Membership may have been unresolvable while the store was down — re-resolve it, then re-pull
    // whatever the outage cost (the whole initial load if it failed, else the mutable collections).
    void loadMe();
    if (status === 'error') {
      setStatus('loading');
      void loadInitial();
    } else if (status === 'ready') {
      void refreshAssets();
      void refreshComments();
    }
    notifyStoreRecovered();
  }, [status, loadMe, loadInitial, refreshAssets, refreshComments]);

  const appData: AppData = useMemo(
    () => ({
      docs,
      docIds: new Set(docs.map((d) => d.id)),
      docTitles: new Map(docs.map((d) => [d.id, d.title])),
      assets,
      comments,
      me: me ?? ANON_ME,
      refreshComments,
      refreshAssets,
    }),
    [docs, assets, comments, me, refreshComments, refreshAssets],
  );

  return (
    <AppDataContext.Provider value={appData}>
      <div className="app">
        <header className="topbar">
          <a className="brand" href={homeHref}>
            <span className="brand-mark">▴</span>
            <span className="brand-name">storytree</span>
            <span className="brand-sub">studio · foundation</span>
          </a>
          {isMember && (
            <nav className="topnav">
              <a href={homeHref}>Overview</a>
              <a href={treeHref}>Forest</a>
              <a href={libraryHref()}>Library</a>
              {me?.role === 'admin' && <a href={membersHref}>Members</a>}
            </nav>
          )}
          <div className="topbar-right">
            {me?.email && (
              <span className="identity-chip" title="your verified identity">
                <span className={`badge role-${me.role}`}>{me.role}</span>
                <span className="identity-email">{me.email}</span>
              </span>
            )}
            {isMember && (
              <label className="operator">
                <span>operator</span>
                <input
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  spellCheck={false}
                  aria-label="operator identity"
                />
              </label>
            )}
          </div>
        </header>

        {meStatus === 'loading' && <p className="muted pad">Resolving access…</p>}

        {meStatus === 'error' && (
          <div className="pad error-box">
            <h2>Couldn’t reach the studio</h2>
            <p className="muted">{meError}</p>
            <p className="muted">
              The studio server may be down. <button className="btn small" onClick={() => void loadMe()}>Retry</button>
            </p>
          </div>
        )}

        {meStatus === 'ready' && me && me.storeUnreachable && (
          <>
            <StoreBanner onRecovered={onStoreRecovered} canWake={me.canWakeDb === true} />
            <div className="pad error-box">
              <h2>The studio’s store is unreachable</h2>
              <p className="muted">
                Your membership can’t be resolved right now.{' '}
                {me.canWakeDb === true
                  ? 'Use the “Wake the database” button above to bring it back.'
                  : 'An admin needs to wake it; this page recovers on its own once the store returns.'}{' '}
                <button className="btn small" onClick={() => void loadMe()}>Retry</button>
              </p>
            </div>
          </>
        )}

        {meStatus === 'ready' && me && !me.storeUnreachable && !me.member && (
          <RequestAccessWall email={me.email} />
        )}

        {meStatus === 'ready' && isMember && (
          <>
            <StoreBanner onRecovered={onStoreRecovered} canWake={me.canWakeDb === true} />
            <div className="body">
              {/* The forest (#/tree) is its own full-bleed world — the Library asset
                  rail is noise there, so hide it and let the canvas fill the width. */}
              {route.name !== 'tree' && <Sidebar route={route} />}
              <main className="content">
                {status === 'loading' && <p className="muted pad">Loading the corpus…</p>}
                {status === 'error' && (
                  <div className="pad error-box">
                    <h2>Couldn’t reach the studio data API</h2>
                    <p className="muted">{error}</p>
                    <p className="muted">
                      If the live store is stopped, use the Start DB button in the banner above.
                    </p>
                  </div>
                )}
                {status === 'ready' && <RouteView route={route} />}
              </main>
            </div>
          </>
        )}
      </div>
    </AppDataContext.Provider>
  );
}

/** The non-member wall: served no corpus, just told how to get in (ADR-0043). */
function RequestAccessWall({ email }: { email: string | null }): React.JSX.Element {
  return (
    <main className="content">
      <div className="pad wall">
        <h1>Request access</h1>
        <p className="muted">
          You’re signed in{email ? <> as <code>{email}</code></> : ''}, but you’re not yet a member,
          so there’s nothing to show you here.
        </p>
        <p className="muted">
          Ask an admin to invite {email ? <code>{email}</code> : 'your account'} from the studio’s
          Members panel. Once you’ve been invited, reload this page and you’ll be in.
        </p>
      </div>
    </main>
  );
}

function RouteView({ route }: { route: ReturnType<typeof useRoute> }): React.JSX.Element {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'doc':
      return <DocView id={route.id} />;
    case 'library':
      return <Library category={route.category} />;
    case 'asset':
      return <AssetView id={route.id} />;
    case 'asset-edit':
      return <AssetEditor mode="edit" id={route.id} />;
    case 'asset-new':
      return <AssetEditor mode="new" />;
    case 'tree':
      return <TreeView focus={route.focus} />;
    case 'members':
      return <MembersPanel />;
  }
}
