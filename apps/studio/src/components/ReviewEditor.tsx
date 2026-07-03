/**
 * ReviewEditor — the Review-mode editing surface (ADR-0146). Replaces the ReviewBlocks
 * click-to-edit surface. A split-pane markdown editor with a CriticMarkup toolbar:
 *
 *  • VIEW mode — clean read-only rendered prose (the whole body through <Markdown>);
 *    no editing affordances. (Gated on ReviewModeContext === 'view'.)
 *  • EDIT mode ('review' context value; the toggle labels it "Edit") — a SPLIT PANE:
 *      LEFT  a monospace <textarea> holding the topic's full markdown SOURCE, seeded
 *            from the asset body, with a toolbar above it whose buttons WRAP the current
 *            selection (or insert at the cursor) in CriticMarkup / plain markdown.
 *      RIGHT a LIVE PREVIEW that re-renders (lightly debounced) as you type: the base
 *            markdown via <Markdown>, with the five CriticMarkup forms rendered as
 *            styled tracked-change elements (parseCriticMarkup, the pure Stage-1 module).
 *    Panes stack on narrow widths (CSS).
 *
 * PERSISTENCE (this shell, ADR-0146 "feel first"): Save persists the CriticMarkup-
 * annotated body through the admin asset-write path (api.updateAsset) when the operator
 * is an admin; otherwise Save is local (the edited markdown stays in the pane and a note
 * says it was not written). PER-CHANGE accept/reject persistence — resolving one tracked
 * change back to clean markdown and recording it as a suggestion — is the deliberate
 * FOLLOW-ON; it is NOT wired here. The suggestion store + routes are left intact.
 */

import { useContext, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { Markdown } from './Markdown';
import { ReviewModeContext, SetReviewModeContext } from './ReviewToggle';
import { parseCriticMarkup, type CriticSegment } from '../lib/criticmarkup';
import type { GuidanceAsset } from '../types';

interface ReviewEditorProps {
  /** The asset whose markdown body seeds the editor. Optional metadata (category, fields …)
   *  is carried so Save can write a body-only asset losslessly; a structured asset (fields
   *  authoritative, body derived) Saves LOCAL — see save(). */
  asset: Pick<GuidanceAsset, 'id' | 'category' | 'title' | 'description' | 'body' | 'references'> &
    Partial<Pick<GuidanceAsset, 'fields' | 'provenance'>>;
}

/** A toolbar action: wrap the selection in `before`/`after`, or (arrow forms) build the
 *  wrapper from the selection itself. `caret` places the cursor inside after insert. */
interface ToolAction {
  label: string;
  title: string;
  before: string;
  after: string;
  /** For a substitution: the wrapper is `{~~<sel>~><sel>~~}` so the old + new both seed
   *  from the selection and the author edits the new half. */
  substitute?: boolean;
}

const TOOLS: readonly ToolAction[] = [
  { label: 'Comment', title: 'Comment {>> … <<}', before: '{>>', after: '<<}' },
  { label: 'Insert', title: 'Insert {++ … ++}', before: '{++', after: '++}' },
  { label: 'Delete', title: 'Delete {-- … --}', before: '{--', after: '--}' },
  { label: 'Substitute', title: 'Substitute {~~ old ~> new ~~}', before: '', after: '', substitute: true },
  { label: 'Highlight', title: 'Highlight {== … ==}', before: '{==', after: '==}' },
];

const MD_TOOLS: readonly ToolAction[] = [
  { label: 'B', title: 'Bold **…**', before: '**', after: '**' },
  { label: 'I', title: 'Italic *…*', before: '*', after: '*' },
  { label: 'H2', title: 'Heading ## …', before: '## ', after: '' },
];

/** Apply a toolbar action to `source` given the current selection, returning the new
 *  source and where to place the caret/selection afterwards. Pure — unit-testable. */
export function applyTool(
  source: string,
  selStart: number,
  selEnd: number,
  tool: ToolAction,
): { next: string; selStart: number; selEnd: number } {
  const selected = source.slice(selStart, selEnd);
  let wrapped: string;
  if (tool.substitute) {
    // {~~old~>new~~}: seed both halves from the selection so the author edits the "new" side.
    const seed = selected || 'old';
    wrapped = `{~~${seed}~>${seed}~~}`;
  } else {
    wrapped = `${tool.before}${selected || ''}${tool.after}`;
  }
  const next = source.slice(0, selStart) + wrapped + source.slice(selEnd);
  // Select the wrapped body (or place the caret between the tokens when nothing was selected).
  const innerStart = selStart + tool.before.length + (tool.substitute ? 3 : 0);
  const innerEnd = innerStart + (tool.substitute ? (selected || 'old').length : selected.length);
  return { next, selStart: innerStart, selEnd: innerEnd };
}

/** Render one CriticMarkup segment as a tracked-change element (inline). */
function Segment({ seg }: { seg: CriticSegment }): React.JSX.Element {
  switch (seg.kind) {
    case 'text':
      // Text runs carry real markdown — render inline via <Markdown> (the base renderer).
      return <Markdown>{seg.text}</Markdown>;
    case 'insert':
      return <ins className="cm-ins" title="Insertion">{seg.text}</ins>;
    case 'delete':
      return <del className="cm-del" title="Deletion">{seg.text}</del>;
    case 'highlight':
      return <mark className="cm-mark" title="Highlight">{seg.text}</mark>;
    case 'comment':
      return (
        <span className="cm-comment" title="Comment">
          <span className="cm-comment-glyph" aria-hidden="true">💬</span>
          <span className="cm-comment-body">{seg.text}</span>
        </span>
      );
    case 'substitute':
      return (
        <span className="cm-sub" title="Substitution">
          <del className="cm-del">{seg.oldText}</del>
          <ins className="cm-ins">{seg.newText}</ins>
        </span>
      );
  }
}

/** The live preview: base markdown + CriticMarkup tracked-change rendering. When the body
 *  carries NO CriticMarkup it renders as one clean <Markdown> pass (the common case). */
export function CriticPreview({ source }: { source: string }): React.JSX.Element {
  const segments = useMemo(() => parseCriticMarkup(source), [source]);
  const hasMarkup = segments.some((s) => s.kind !== 'text');
  if (!hasMarkup) {
    return <Markdown>{source}</Markdown>;
  }
  return (
    <div className="cm-preview">
      {segments.map((seg, i) => (
        <Segment seg={seg} key={i} />
      ))}
    </div>
  );
}

export function ReviewEditor({ asset }: ReviewEditorProps): React.JSX.Element {
  const { id: topicId, body } = asset;
  const mode = useContext(ReviewModeContext);
  const setMode = useContext(SetReviewModeContext);
  const { refreshAssets } = useAppData();
  const inEdit = mode === 'review';

  // The editable source, seeded from the body. Re-seed when the underlying asset changes
  // AND the author has not started editing (a dirty pane is never clobbered by a refresh).
  const [source, setSource] = useState(body);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setSource(body);
  }, [body, dirty]);

  // Lightly-debounced preview text so a fast typist doesn't re-render markdown every keystroke.
  const [previewSource, setPreviewSource] = useState(body);
  useEffect(() => {
    const id = window.setTimeout(() => setPreviewSource(source), 120);
    return () => window.clearTimeout(id);
  }, [source]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local' | 'error'>('idle');

  // A toolbar insert rewrites the whole `source` value, which re-renders the controlled
  // textarea and would otherwise snap its scroll back to the top (and drop the selection).
  // Capture the caret + scroll BEFORE the rewrite and restore them in a layout effect that
  // runs after React commits the new value but before paint — so there is no visible jump.
  const pendingRestore = useRef<{ selStart: number; selEnd: number; scrollTop: number } | null>(null);
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const p = pendingRestore.current;
    if (!el || !p) return;
    pendingRestore.current = null;
    // preventScroll: refocusing must NOT scroll the page to the (tall) textarea — that was the
    // "snaps to the bottom of the page" on insert. Restore the textarea's own scroll last so the
    // caret stays exactly where the author was.
    el.focus({ preventScroll: true });
    el.setSelectionRange(p.selStart, p.selEnd);
    el.scrollTop = p.scrollTop;
  }, [source]);

  function runTool(tool: ToolAction): void {
    const el = textareaRef.current;
    if (!el) return;
    const { next, selStart, selEnd } = applyTool(source, el.selectionStart, el.selectionEnd, tool);
    // Keep the author where they were: restore caret/selection AND scroll after the re-render.
    pendingRestore.current = { selStart, selEnd, scrollTop: el.scrollTop };
    setSource(next);
    setDirty(true);
  }

  // A STRUCTURED asset (open-question, principle, …) has authoritative `fields`; its `body`
  // is a read-only DERIVED render, so writing the annotated body back would collapse the
  // structure. For those, Save is LOCAL in this shell (never a lossy structured write). A
  // body-only asset (template / adr) can round-trip its body through updateAsset.
  const isStructured = asset.fields !== undefined && Object.keys(asset.fields).length > 0;

  async function save(): Promise<void> {
    // FOLLOW-ON: per-change accept/reject persistence (resolving one tracked change back to
    // clean markdown + recording it as a suggestion) is NOT wired here. This Save writes the
    // whole CriticMarkup-annotated body via the admin asset-write path (api.updateAsset) for a
    // body-only asset; a structured asset keeps it LOCAL to avoid a lossy body-over-fields write.
    // Either way the edit is never silently lost.
    if (isStructured) {
      setSaveState('local');
      return;
    }
    setSaveState('saving');
    try {
      await api.updateAsset(topicId, {
        id: topicId,
        category: asset.category,
        title: asset.title,
        description: asset.description,
        body: source,
        references: asset.references,
        ...(asset.provenance !== undefined ? { provenance: asset.provenance } : {}),
      });
      setDirty(false);
      setSaveState('saved');
      await refreshAssets();
    } catch {
      // The server refuses a non-admin write; the edit is not lost — it stays in the pane.
      setSaveState('error');
    }
  }

  // Cancel: discard the in-progress edits (revert the source pane to the original asset body)
  // and return to View. Non-destructive-by-surprise — when there are unsaved edits it asks
  // first, so a stray click never silently throws away work.
  function cancel(): void {
    if (dirty && !window.confirm('Discard your edits and return to View?')) return;
    setSource(body);
    setDirty(false);
    setSaveState('idle');
    setMode('view');
  }

  // ── VIEW mode — clean read-only prose ───────────────────────────────────────
  if (!inEdit) {
    return (
      <div className="review-view">
        <Markdown>{body}</Markdown>
      </div>
    );
  }

  // ── EDIT mode — split pane ──────────────────────────────────────────────────
  return (
    <div className="review-editor">
      <div className="review-editor-toolbar" role="toolbar" aria-label="Editing tools">
        <div className="cm-tool-group">
          {TOOLS.map((tool) => (
            <button
              type="button"
              key={tool.label}
              className="cm-tool"
              title={tool.title}
              onClick={() => runTool(tool)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div className="cm-tool-group cm-tool-group-md">
          {MD_TOOLS.map((tool) => (
            <button
              type="button"
              key={tool.label}
              className="cm-tool cm-tool-md"
              title={tool.title}
              onClick={() => runTool(tool)}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <div className="cm-tool-spacer" />
        <button type="button" className="btn small ghost cm-cancel" onClick={cancel}>
          Cancel
        </button>
        <button type="button" className="btn small cm-save" onClick={() => void save()}>
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {saveState !== 'idle' && saveState !== 'saving' && (
        <div className={`cm-save-note cm-save-note-${saveState}`}>
          {saveState === 'saved' && 'Saved to the asset.'}
          {saveState === 'local' &&
            'Kept locally — this is a structured artifact (its fields are authoritative), so the annotated body is not written back in this shell. Per-change accept/reject persistence is the follow-on.'}
          {saveState === 'error' && 'Save failed (admin write required) — your edits are still here; try again.'}
        </div>
      )}

      <div className="review-split">
        <div className="review-pane review-pane-source">
          <label className="review-pane-label" htmlFor="review-source">
            Markdown source
          </label>
          <textarea
            id="review-source"
            ref={textareaRef}
            className="review-source-textarea"
            value={source}
            spellCheck={false}
            aria-label="Markdown source"
            onChange={(e) => {
              setSource(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="review-pane review-pane-preview">
          <label className="review-pane-label">Preview</label>
          <div className="review-preview-body">
            <CriticPreview source={previewSource} />
          </div>
        </div>
      </div>
    </div>
  );
}
