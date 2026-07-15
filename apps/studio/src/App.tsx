import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { AppDataContext, type AppData } from './lib/appData';
import { deriveLoadState, type LoadState } from './lib/loadState';
import { useDevStoreOverride, type DevOverride } from './lib/devStoreOverride';
import { useOperator } from './lib/operator';
import { notifyStoreRecovered } from './lib/presence';
import { membersHref, homeHref, libraryHref, treeHref, useRoute } from './lib/route';
import type { Comment, DocMeta, GuidanceAsset, MeInfo } from './types';
import { Sidebar } from './components/Sidebar';
import { StoreBanner, type StorePhase } from './components/StoreBanner';
import { Home } from './components/Home';
import { DocView } from './components/DocView';
import { AssetView } from './components/AssetView';
import { AssetEditor } from './components/AssetEditor';
import { TreeView } from './components/TreeView';
import { MembersPanel } from './components/MembersPanel';
import { DesktopCredentialsDock } from './components/DesktopCredentialsDock';

/** A non-member's MeInfo while it's still loading — never read as a member. */
const ANON_ME: MeInfo = { email: null, role: null, status: null, member: false };

export function App(): React.JSX.Element {
  const route = useRoute();
  const [operator, setOperator] = useOperator();
  const [me, setMe] = useState<MeInfo | null>(null);
  const [meStatus, setMeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [meError, setMeError] = useState<string>('');
  // The store-health phase, lifted up from StoreBanner's single poller (it owns /api/health), so the
  // honest load screens (STARTING / TAKING-LONGER / SERVER-LOST / STORE-FAULT) derive from it
  // without a second poller. `startingSince` stamps when the boot entered `starting`, so a ticker
  // can age it into the TAKING-LONGER threshold.
  const [storePhase, setStorePhase] = useState<StorePhase>('unknown');
  const [startingSince, setStartingSince] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
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

  // StoreBanner lifts its health-poll phase up here. Stamp when the store enters `starting` so the
  // ticker can age it into TAKING-LONGER; clear the stamp the moment it leaves `starting`.
  const onStorePhase = useCallback((phase: StorePhase): void => {
    setStorePhase(phase);
    setStartingSince((prev) => {
      if (phase === 'starting') return prev ?? Date.now();
      return null;
    });
  }, []);

  // Age the `starting` boot for the TAKING-LONGER threshold — a 1s tick, only while booting.
  useEffect(() => {
    if (startingSince === null) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [startingSince]);

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

  // The single honest decision for which load/store-down screen to show (incident 2026-06-27).
  // A dev-only `?devLoadState=…` override (inert in prod) swaps in synthetic inputs so the owner
  // can flip through every state; otherwise we feed the live ones. `elapsedMs` ages the boot for
  // the STARTING → TAKING-LONGER threshold.
  const dev: DevOverride | null = useDevStoreOverride();
  const elapsedMs = startingSince === null ? 0 : Math.max(0, nowMs - startingSince);
  const loadState = dev
    ? deriveLoadState(dev.meStatus, dev.me, dev.phase, dev.elapsedMs)
    : deriveLoadState(meStatus, me, storePhase, elapsedMs);

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
            <DesktopCredentialsDock />
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

        <LoadScreen
          state={loadState}
          meError={meError}
          banner={
            <StoreBanner
              onRecovered={onStoreRecovered}
              canWake={(dev?.me ?? me)?.canWakeDb === true}
              onPhase={onStorePhase}
            />
          }
          onRetry={() => void loadMe()}
          app={
            <div className="body">
              {/* The forest (#/tree) is its own full-bleed world — the Library asset
                  rail is noise there, so hide it and let the canvas fill the width. */}
              {route.name !== 'tree' && <Sidebar />}
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
          }
        />
      </div>
    </AppDataContext.Provider>
  );
}

/** The non-member wall: served no corpus, just told how to get in (ADR-0043). */
/**
 * The honest load / store-down screen (incident 2026-06-27). One switch over the derived
 * {@link LoadState}: each branch states plainly what's happening — never an indefinite spinner,
 * never implied success, and a genuine fault is always distinguishable from a sleeping DB.
 *
 * The store-down arc (asleep · store-fault · starting · taking-longer · server-lost) keeps the
 * StoreBanner MOUNTED, because its single /api/health poller is what drives recovery: it flips the
 * lifted phase as the instance boots and calls onRecovered when the store returns, so these screens
 * heal in place without the user reloading. CHECKING / ERROR / the access wall don't need it.
 */
function LoadScreen({
  state,
  banner,
  onRetry,
  meError,
  app,
}: {
  state: LoadState;
  banner: React.ReactNode;
  onRetry: () => void;
  meError: string;
  app: React.ReactNode;
}): React.JSX.Element {
  switch (state.kind) {
    case 'checking':
      // Bounded by api.me's abort window — this always resolves to a state below.
      return (
        <div className="load-screen pad">
          <span className="spinner" aria-hidden="true" />
          <p className="muted">Connecting to the studio — checking the database…</p>
        </div>
      );

    case 'asleep':
      // The DB is genuinely unreachable (health agrees): asleep, likely idle-stopped 1am–7am Sydney.
      return (
        <>
          {banner}
          <div className="pad error-box">
            <h2>The live store is asleep</h2>
            <p className="muted">
              The studio’s database (Cloud SQL) isn’t responding — it’s most likely idle-stopped to
              save cost (it sleeps 1am–7am Sydney by design). Your membership can’t be resolved until
              it’s back.
            </p>
            <p className="muted">
              {state.canWake
                ? 'Use the “Wake the database” button above — it takes about a minute. This page recovers on its own once the store returns.'
                : 'Waiting for an admin to wake it — this page recovers on its own once the store returns.'}{' '}
              <button className="btn small" onClick={onRetry}>
                Retry now
              </button>
            </p>
          </div>
        </>
      );

    case 'store-fault':
      // Two signals disagree: membership couldn't resolve, but health says the DB IS reachable.
      // Honestly a fault — do NOT offer to wake a running DB.
      return (
        <>
          {banner}
          <div className="pad error-box">
            <h2>The studio couldn’t load — this looks like a fault</h2>
            <p className="muted">
              The database is reachable, but the studio still couldn’t resolve your membership. That’s
              not a sleeping database — it looks like an unexpected fault, so waking it won’t help.
            </p>
            <p className="muted">
              It may clear on its own; if it doesn’t, it’s worth flagging.{' '}
              <button className="btn small" onClick={onRetry}>
                Retry
              </button>
            </p>
          </div>
        </>
      );

    case 'starting':
      return (
        <>
          {banner}
          <div className="load-screen pad">
            <span className="spinner" aria-hidden="true" />
            <p className="muted">Starting the database… this usually takes about a minute.</p>
          </div>
        </>
      );

    case 'taking-longer':
      // Past the ~1-minute expectation — say so honestly, don't imply it's about to succeed.
      return (
        <>
          {banner}
          <div className="load-screen pad">
            <span className="spinner" aria-hidden="true" />
            <p className="muted">
              The database is taking longer than usual to start. It should still come up — keep
              waiting, or retry.{' '}
              <button className="btn small" onClick={onRetry}>
                Retry
              </button>
            </p>
          </div>
        </>
      );

    case 'server-lost':
      // /api/health itself stopped answering — the studio server, not the DB.
      return (
        <>
          {banner}
          <div className="pad error-box">
            <h2>The studio server isn’t responding</h2>
            <p className="muted">
              The studio’s own server has stopped answering, so this page can’t see the database at
              all. This is a server problem, not a sleeping database.
            </p>
            <p className="muted">
              <button className="btn small" onClick={onRetry}>
                Retry
              </button>
            </p>
          </div>
        </>
      );

    case 'error':
      // The genuine-fault path: api.me itself rejected (network / abort / non-OK). Explicit, with
      // the message, so the owner can tell a real fault from a sleeping DB — never a blank screen.
      return (
        <div className="pad error-box">
          <h2>Couldn’t reach the studio</h2>
          <p className="muted">
            The studio server didn’t answer when resolving your access. This is a genuine error, not
            an idle database.
          </p>
          {meError !== '' && <p className="muted error-text">{meError}</p>}
          <p className="muted">
            <button className="btn small" onClick={onRetry}>
              Retry
            </button>
          </p>
        </div>
      );

    case 'request-access':
      return <RequestAccessWall email={state.email} />;

    case 'app':
      return (
        <>
          {banner}
          {app}
        </>
      );
  }
}

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
