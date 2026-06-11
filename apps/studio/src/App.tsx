import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { AppDataContext, type AppData } from './lib/appData';
import { useOperator } from './lib/operator';
import { homeHref, libraryHref, useRoute } from './lib/route';
import type { Comment, DocMeta, GuidanceAsset } from './types';
import { Sidebar } from './components/Sidebar';
import { StoreBanner } from './components/StoreBanner';
import { Home } from './components/Home';
import { DocView } from './components/DocView';
import { Library } from './components/Library';
import { AssetView } from './components/AssetView';
import { AssetEditor } from './components/AssetEditor';

export function App(): React.JSX.Element {
  const route = useRoute();
  const [operator, setOperator] = useOperator();
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

  // The initial load is a re-invocable callback (not just an effect body) so
  // the store banner can retry it after the live store comes back up.
  const loadInitial = useCallback(async (): Promise<void> => {
    try {
      const [d, a, c] = await Promise.all([
        api.listDocs(),
        api.listAssets(),
        api.listComments(),
      ]);
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
    void loadInitial();
  }, [loadInitial]);

  // When the live store recovers (Start DB / the banner's poll), re-pull what
  // the outage cost us: the whole initial load if it failed, or just the
  // mutable collections if we were already up.
  const onStoreRecovered = useCallback((): void => {
    if (status === 'error') {
      setStatus('loading');
      void loadInitial();
    } else if (status === 'ready') {
      void refreshAssets();
      void refreshComments();
    }
  }, [status, loadInitial, refreshAssets, refreshComments]);

  const appData: AppData = useMemo(
    () => ({
      docs,
      docIds: new Set(docs.map((d) => d.id)),
      docTitles: new Map(docs.map((d) => [d.id, d.title])),
      assets,
      comments,
      refreshComments,
      refreshAssets,
    }),
    [docs, assets, comments, refreshComments, refreshAssets],
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
          <nav className="topnav">
            <a href={homeHref}>Overview</a>
            <a href={libraryHref()}>Library</a>
          </nav>
          <label className="operator">
            <span>operator</span>
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              spellCheck={false}
              aria-label="operator identity"
            />
          </label>
        </header>

        <StoreBanner onRecovered={onStoreRecovered} />

        <div className="body">
          <Sidebar route={route} />
          <main className="content">
            {status === 'loading' && <p className="muted pad">Loading the corpus…</p>}
            {status === 'error' && (
              <div className="pad error-box">
                <h2>Couldn’t reach the studio data API</h2>
                <p className="muted">{error}</p>
                <p className="muted">
                  Is the dev server running? Start it with{' '}
                  <code>pnpm studio:up</code> from the repo root (not your home
                  directory — pnpm needs the workspace).
                </p>
                <p className="muted">
                  If the dev server <em>is</em> up, the live store may be stopped — use
                  the Start DB button in the banner above.
                </p>
              </div>
            )}
            {status === 'ready' && <RouteView route={route} />}
          </main>
        </div>
      </div>
    </AppDataContext.Provider>
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
  }
}
