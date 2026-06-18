// WorldSettingsPanel — the forest-map tuning gear (owner ask 2026-06-18).
//
// A small gear button fixed bottom-right of the #/tree frame opens a compact panel
// of sliders / toggles / selects bound to the URL dials (the worldSettings schema is
// the single source of truth). Changing a control writes the URL query string (params
// BEFORE the #hash, via the parent's onCommit → replaceState) and re-renders the world
// live — so a tuned world is shareable / bookmarkable. "Copy link" copies that URL;
// "Reset to defaults" clears every managed param (byte-identical default world).
//
// APPEARANCE / UX is owner-attested (operator-attested ProofMode): this builds the
// look behind the default-closed gear; the orchestrator surfaces the hosted deep-link
// and the owner judges the styling/layout/live-render. The binding contract under it
// is proven red-green in worldSettings.test.ts.
//
// PERF: a slider drag fires onChange continuously, and buildWorld (~2k nodes) is
// expensive, so sliders hold a LOCAL value for instant thumb feedback and only COMMIT
// to the search state on release / after a short debounce. Toggles + selects commit
// immediately (one-shot).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTROLS,
  readControlValue,
  setControlValue,
  resetControls,
  buildShareUrl,
  type ControlSpec,
  type NumberControl,
} from '../lib/worldSettings.js';

const COMMIT_DEBOUNCE_MS = 140;

/** Group the schema into its ordered sections (first-seen order). */
function grouped(): { group: string; controls: ControlSpec[] }[] {
  const out: { group: string; controls: ControlSpec[] }[] = [];
  for (const c of CONTROLS) {
    let bucket = out.find((b) => b.group === c.group);
    if (!bucket) {
      bucket = { group: c.group, controls: [] };
      out.push(bucket);
    }
    bucket.controls.push(c);
  }
  return out;
}

/** A pretty live value for a numeric control's label. */
function fmtNumber(c: NumberControl, v: number): string {
  if (c.integer || Number.isInteger(c.step)) return String(Math.round(v));
  // Match the slider step's precision (e.g. 0.05 ⇒ 2 dp), trimming trailing zeros.
  const dp = (String(c.step).split('.')[1] ?? '').length;
  return Number(v.toFixed(dp)).toString();
}

export function WorldSettingsPanel({
  search,
  onCommit,
}: {
  search: string;
  onCommit: (nextSearch: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const sections = useMemo(() => grouped(), []);

  return (
    <div className="world-gear-dock">
      {open && (
        <WorldSettingsBody
          search={search}
          sections={sections}
          copied={copied}
          onChange={onCommit}
          onCopy={() => {
            const url = currentShareUrl(search);
            void copyToClipboard(url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
          onReset={() => onCommit(resetControls(search))}
        />
      )}
      <button
        type="button"
        className={`world-gear-btn${open ? ' on' : ''}`}
        aria-label={open ? 'Close world settings' : 'Open world settings'}
        aria-expanded={open}
        title="World settings"
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon />
      </button>
    </div>
  );
}

/** The current shareable URL: managed params (from `search`) BEFORE the live #hash. */
function currentShareUrl(search: string): string {
  if (typeof window === 'undefined') return search;
  const origin = `${window.location.origin}${window.location.pathname}`;
  return buildShareUrl(origin, search, window.location.hash);
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fall through to the legacy path */
  }
  // Legacy fallback for non-secure contexts.
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}

function WorldSettingsBody({
  search,
  sections,
  copied,
  onChange,
  onCopy,
  onReset,
}: {
  search: string;
  sections: { group: string; controls: ControlSpec[] }[];
  copied: boolean;
  onChange: (nextSearch: string) => void;
  onCopy: () => void;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <div className="world-gear-panel" role="group" aria-label="World settings">
      <div className="world-gear-head">World settings</div>
      <div className="world-gear-scroll">
        {sections.map((sec) => (
          <fieldset key={sec.group} className="world-gear-group">
            <legend>{sec.group}</legend>
            {sec.controls.map((c) => (
              <ControlRow key={c.key} control={c} search={search} onChange={onChange} />
            ))}
          </fieldset>
        ))}
      </div>
      <div className="world-gear-foot">
        <button type="button" className="world-gear-action" onClick={onCopy}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button type="button" className="world-gear-action subtle" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function ControlRow({
  control,
  search,
  onChange,
}: {
  control: ControlSpec;
  search: string;
  onChange: (nextSearch: string) => void;
}): React.JSX.Element {
  if (control.kind === 'number') {
    return <NumberRow control={control} search={search} onChange={onChange} />;
  }
  if (control.kind === 'toggle') {
    const on = readControlValue(search, control) as boolean;
    return (
      <div className="world-gear-row toggle">
        <label className="world-gear-control">
          <span className="world-gear-label">{control.label}</span>
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(setControlValue(search, control, e.target.checked))}
          />
        </label>
        {control.hint && <span className="world-gear-hint">{control.hint}</span>}
      </div>
    );
  }
  // select
  const value = readControlValue(search, control) as string;
  return (
    <div className="world-gear-row select">
      <label className="world-gear-control">
        <span className="world-gear-label">{control.label}</span>
        <select
          value={value}
          onChange={(e) => onChange(setControlValue(search, control, e.target.value))}
        >
          {control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {control.hint && <span className="world-gear-hint">{control.hint}</span>}
    </div>
  );
}

/** A numeric slider with instant local feedback but a DEBOUNCED commit (so a drag
 *  doesn't rebuild the ~2k-node world on every pixel). The committed search is the
 *  source of truth; local state only leads it mid-drag and re-syncs when search
 *  changes underneath (reset / copy-link load / another control). */
function NumberRow({
  control,
  search,
  onChange,
}: {
  control: NumberControl;
  search: string;
  onChange: (nextSearch: string) => void;
}): React.JSX.Element {
  const committed = readControlValue(search, control) as number;
  const [local, setLocal] = useState(committed);
  // Re-sync local to the committed value when the URL changes from outside this slider
  // (reset, a shared link, another control). A live drag updates `committed` only
  // after the debounce fires, by which point `local` already equals it — no flicker.
  useEffect(() => {
    setLocal(committed);
  }, [committed]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (v: number): void => {
    onChange(setControlValue(search, control, v));
  };
  const scheduleCommit = (v: number): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), COMMIT_DEBOUNCE_MS);
  };

  return (
    <div className="world-gear-row number">
      <span className="world-gear-label">
        {control.label}
        <span className="world-gear-value">{fmtNumber(control, local)}</span>
      </span>
      <input
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v); // instant thumb feedback
          scheduleCommit(v); // debounced world rebuild
        }}
        // On release, commit immediately (clear any pending debounce first).
        onPointerUp={(e) => {
          if (timer.current) clearTimeout(timer.current);
          commit(Number((e.target as HTMLInputElement).value));
        }}
        onKeyUp={(e) => {
          if (timer.current) clearTimeout(timer.current);
          commit(Number((e.target as HTMLInputElement).value));
        }}
      />
      {control.hint && <span className="world-gear-hint">{control.hint}</span>}
    </div>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.78 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.66.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.12.52.02.66-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}
