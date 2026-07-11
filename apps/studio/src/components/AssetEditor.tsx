import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { slugify } from '../lib/markdown';
import { missingSections, requiredSections, templateIdFor } from '../lib/templates';
import {
  fieldSpecsFor,
  isStructuredCategory,
  missingRequiredFields,
  renderFieldsPreview,
  type EditorFieldSpec,
} from '../lib/knowledgeFields';
import { assetHref, libraryHref, navigate } from '../lib/route';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_GLOSS,
  type AssetCategory,
  type AssetInput,
} from '../types';
import { Markdown } from './Markdown';

interface AssetEditorProps {
  mode: 'new' | 'edit';
  id?: string;
}

interface FormState {
  id: string;
  category: AssetCategory;
  title: string;
  description: string;
  /** Body for a body-only category (template / adr); for structured kinds the body is derived from `fields`. */
  body: string;
  /** Per-kind structured field values (keyed by KIND_SPECS field name) for a structured Knowledge kind. */
  fields: Record<string, string>;
  references: string;
  provenance: string;
}

const EMPTY: FormState = {
  id: '',
  category: 'pattern',
  title: '',
  description: '',
  body: '',
  fields: {},
  references: '',
  provenance: '',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A clean UI label from a KIND_SPECS heading (drop the bold markers and trailing period). */
function labelFor(spec: EditorFieldSpec): string {
  return spec.heading.replace(/\*\*/g, '').replace(/\.\s*$/, '');
}

export function AssetEditor({ mode, id }: AssetEditorProps): React.JSX.Element {
  const { assets, refreshAssets } = useAppData();
  const arcDisplay = useArcDisplay(); // option label only — the option VALUE stays `arc` (ADR-0183 D1)
  const existing = mode === 'edit' ? assets.find((a) => a.id === id) : undefined;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [idTouched, setIdTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && existing) {
      setForm({
        id: existing.id,
        category: existing.category,
        title: existing.title,
        description: existing.description,
        body: existing.body,
        fields: { ...(existing.fields ?? {}) },
        references: existing.references.join(', '),
        provenance: existing.provenance ?? '',
      });
      setIdTouched(true);
    } else if (mode === 'new') {
      setForm(EMPTY);
      setIdTouched(false);
    }
  }, [mode, existing]);

  const structured = isStructuredCategory(form.category);
  const specs = useMemo(() => fieldSpecsFor(form.category), [form.category]);

  // The markdown shown in the preview (and, for a structured unit, sent as the derived body):
  // derived from the per-kind fields for a structured kind, else the authored body.
  const previewBody = useMemo(
    () => (structured ? renderFieldsPreview(form.category, form.fields) : form.body),
    [structured, form.category, form.fields, form.body],
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setField(field: string, value: string): void {
    setForm((f) => ({ ...f, fields: { ...f.fields, [field]: value } }));
  }

  // For new assets, derive the slug from the title until the user edits it.
  function onTitle(value: string): void {
    setForm((f) => ({
      ...f,
      title: value,
      id: mode === 'new' && !idTouched ? slugify(value) : f.id,
    }));
  }

  // Pre-fill the body from the seeded `template-<category>` scaffold. Offered only for a
  // body-only category (a structured kind shows its per-kind fields with inline placeholders).
  const templateAsset =
    mode === 'new' && !structured && form.category !== 'template'
      ? assets.find((a) => a.id === templateIdFor(form.category))
      : undefined;

  function startFromTemplate(): void {
    if (!templateAsset) return;
    if (form.body.trim() && !window.confirm(`Replace the current body with the ${form.category} template?`)) {
      return;
    }
    set('body', templateAsset.body);
    setError('');
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError('');

    const provenance = form.provenance.trim();
    const common = {
      id: form.id.trim(),
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      references: splitList(form.references),
      ...(provenance ? { provenance } : {}),
    };

    let input: AssetInput;
    if (structured) {
      // Option C: persist the per-kind fields directly. Required fields must be present; the body
      // is the derived render (the store re-derives it on read, so it never becomes authoritative).
      const missing = missingRequiredFields(form.category, form.fields);
      if (missing.length > 0) {
        const names = missing.map((s) => `“${labelFor(s)}”`).join(', ');
        setError(
          `A ${form.category} must fill the ${names} field${missing.length > 1 ? 's' : ''} before it can be saved` +
            (form.category === 'guardrail'
              ? ' — name the gate / schema / DB constraint / code path that makes it non-bypassable, or it is a pattern, not a guardrail.'
              : '.'),
        );
        return;
      }
      const fields: Record<string, string> = {};
      for (const spec of specs) {
        const value = (form.fields[spec.field] ?? '').trim();
        if (value) fields[spec.field] = value;
      }
      input = { ...common, body: previewBody, fields };
    } else {
      // Body-only category (template / adr): the authored markdown body is the source.
      const missing = missingSections(form.body, requiredSections(form.category));
      if (missing.length > 0) {
        const sections = missing.map((s) => `“${s}”`).join(', ');
        setError(
          `A ${form.category} must include the ${sections} section${missing.length > 1 ? 's' : ''} before it can be saved.`,
        );
        return;
      }
      input = { ...common, body: form.body };
    }

    setBusy(true);
    try {
      const saved =
        mode === 'edit' && id
          ? await api.updateAsset(id, input)
          : await api.createAsset(input);
      await refreshAssets();
      navigate(assetHref(saved.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'edit' && !existing) {
    return (
      <div className="pad error-box">
        <h2>Artifact not found</h2>
        <p className="muted">
          Can’t edit <code>{id}</code>. <a href={libraryHref()}>Back to the Library</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="editor pad">
      <div className="doc-crumb muted small">
        <a href={libraryHref()}>library</a> / {mode === 'new' ? 'new artifact' : `edit ${id}`}
      </div>
      <h1>{mode === 'new' ? 'New artifact' : `Edit “${existing?.title}”`}</h1>

      <form className="editor-grid" onSubmit={save}>
        <div className="editor-fields">
          <label className="field">
            <span>Title</span>
            <input value={form.title} onChange={(e) => onTitle(e.target.value)} required />
          </label>

          <label className="field">
            <span>
              Id <small className="muted">(kebab-case slug — the filename-style key)</small>
            </span>
            <input
              value={form.id}
              onChange={(e) => {
                setIdTouched(true);
                set('id', e.target.value);
              }}
              disabled={mode === 'edit'}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value as AssetCategory)}
            >
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {kindLabel(c, arcDisplay)} — {ASSET_CATEGORY_GLOSS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>
              Description <small className="muted">(one line: what it is / when to inject it)</small>
            </span>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              required
            />
          </label>

          {structured ? (
            // Option C: one input per structured field. The fields ARE the source; the body is derived.
            <>
              <p className="field-hint muted small">
                Structured {form.category} — each field is stored separately (no freeform body), so
                editing never loses structure.
              </p>
              {specs.map((spec) => (
                <label className="field" key={spec.field}>
                  <span>
                    {labelFor(spec)}{' '}
                    <small className="muted">
                      {spec.required ? '(required)' : '(optional — leave blank to omit)'}
                    </small>
                  </span>
                  <textarea
                    className="mono"
                    value={form.fields[spec.field] ?? ''}
                    onChange={(e) => setField(spec.field, e.target.value)}
                    rows={spec.lead ? 2 : 4}
                    placeholder={spec.placeholder.replace(/^_|_$/g, '')}
                    {...(spec.required ? { required: true } : {})}
                  />
                </label>
              ))}
            </>
          ) : (
            <div className="field">
              <div className="field-label-row">
                <span>Body (markdown)</span>
                {templateAsset && (
                  <button type="button" className="btn small" onClick={startFromTemplate}>
                    Start from the {form.category} template
                  </button>
                )}
              </div>
              <textarea
                className="mono"
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
                rows={16}
                required
              />
              {requiredSections(form.category).length > 0 && (
                <p className="field-hint muted small">
                  Required section{requiredSections(form.category).length > 1 ? 's' : ''}:{' '}
                  {requiredSections(form.category)
                    .map((s) => `“${s}”`)
                    .join(', ')}{' '}
                  — enforced on save.
                </p>
              )}
            </div>
          )}

          <label className="field">
            <span>
              Sources{' '}
              <small className="muted">
                (comma-separated; <code>doc:&lt;relpath&gt;</code> or <code>asset:&lt;id&gt;</code> —
                grouped by type when shown)
              </small>
            </span>
            <input value={form.references} onChange={(e) => set('references', e.target.value)} />
          </label>

          <label className="field">
            <span>
              Provenance{' '}
              <small className="muted">
                (optional: origin / "still open" prose a bare pointer can't carry)
              </small>
            </span>
            <textarea
              value={form.provenance}
              onChange={(e) => set('provenance', e.target.value)}
              rows={2}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <div className="editor-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : mode === 'new' ? 'Create artifact' : 'Save changes'}
            </button>
            <a className="btn ghost" href={mode === 'edit' && id ? assetHref(id) : libraryHref()}>
              Cancel
            </a>
          </div>
        </div>

        <div className="editor-preview">
          <div className="preview-label muted small">Preview</div>
          <div className="asset-body">
            {previewBody.trim() ? <Markdown>{previewBody}</Markdown> : <p className="muted">Nothing yet.</p>}
          </div>
        </div>
      </form>
    </div>
  );
}
