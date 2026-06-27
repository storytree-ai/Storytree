import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BuildSection } from './components/BuildSection';
import { api } from './api';
import type { BuildStatus } from './types';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

// ─────────────────────────────────────────────────────────────────────────────
// DEV-ONLY visual harness for the Build/Adopt "thinking" loading affordance
// (ADR-0070 Stage 2 — the appearance is the OWNER's call; this only makes the
// non-terminal `building` state SEEABLE without a DB or build engine). Reached
// ONLY via `?harness=buildrun`; it never mounts in the normal app flow.
//
// It drives the REAL <BuildSection>/<AdoptPanel> components through their REAL
// usePollableRun hook by overriding the api singleton's methods to return a run
// that stays `building` forever (so the affordance never tears down), then
// auto-clicks each trigger. What you see is exactly the production render path.
// ─────────────────────────────────────────────────────────────────────────────
function BuildRunHarness(): React.JSX.Element {
  const wired = useRef(false);
  if (!wired.current) {
    wired.current = true;
    // A status that never reaches terminal → the "building" affordance stays up.
    const buildingStatus = (over: Partial<BuildStatus> = {}): BuildStatus => ({
      runId: 'harness-run',
      unitId: 'demo-unit',
      status: 'building',
      transcript: [
        'AUTHOR_TEST  author the failing contract test',
        'CONFIRM_RED  spine observed RED',
        'IMPLEMENT    minimum source to green',
        'CONFIRM_GREEN  spine observed GREEN',
        'GATE         signing the verdict…',
      ],
      ...over,
    });
    api.build = async () => ({ runId: 'harness-build' });
    api.adopt = async () => ({ runId: 'harness-adopt' });
    api.buildStatus = async (runId: string) =>
      buildingStatus({ runId, unitId: runId === 'harness-adopt' ? 'demo-story' : 'demo-cap' });
  }

  // Auto-press both triggers on mount so the panels enter their building/adopting state.
  useEffect(() => {
    const clickAll = (): void => {
      document
        .querySelectorAll<HTMLButtonElement>('.harness-panel .build-btn')
        .forEach((b) => b.click());
    };
    // One microtask after paint so the buttons are mounted.
    const id = window.setTimeout(clickAll, 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>
      <p
        style={{
          margin: '0 0 18px',
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--accent)',
          background: 'var(--accent-weak)',
          borderRadius: 6,
        }}
      >
        DEV HARNESS · ?harness=buildrun — Build/Adopt loading affordance (ADR-0070 Stage 2). Not part
        of the app flow.
      </p>
      <div style={{ display: 'grid', gap: 28 }}>
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Build — &ldquo;Building…&rdquo; state</h3>
          <div className="harness-panel" style={{ maxWidth: 420 }}>
            <BuildSection unitId="demo-cap" buildable scope="node" />
          </div>
        </section>
        <section>
          <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Adopt — &ldquo;Adopting…&rdquo; state</h3>
          <div className="harness-panel" style={{ maxWidth: 420 }}>
            <BuildSection
              unitId="demo-story"
              buildable={false}
              scope="story"
              goGreen="adopt"
              status="mapped"
              adoptGates={[
                { id: 'demo#gate-1', kind: 'observe', command: 'pnpm --filter demo test' },
              ]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const harness = new URLSearchParams(window.location.search).get('harness');

createRoot(root).render(
  <StrictMode>{harness === 'buildrun' ? <BuildRunHarness /> : <App />}</StrictMode>,
);
