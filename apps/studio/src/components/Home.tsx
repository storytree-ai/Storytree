import { useAppData } from '../lib/appData';
import { docHref, libraryHref } from '../lib/route';

export function Home(): React.JSX.Element {
  const { docs, assets, comments } = useAppData();
  const open = comments.filter((c) => !c.resolved).length;
  const firstAdr = docs.find((d) => d.group === 'Decisions');

  return (
    <div className="home pad">
      <h1>storytree studio</h1>
      <p className="lede">
        The foundation surface — a <strong>forum</strong> over the project’s record. Documents and
        Library artifacts are <em>topics</em>; comments are <em>posts</em>. The{' '}
        <a href="#/tree">story forest</a> renders the work hierarchy itself (ADR-0036).
      </p>

      <div className="stat-row">
        <Stat n={assets.length} label="Library artifacts" href={libraryHref()} />
        <Stat n={docs.length} label="documents" href={firstAdr ? docHref(firstAdr.id) : undefined} />
        <Stat n={open} label="open comments" />
      </div>

      <div className="cap-grid">
        <CapCard title="Read the record">
          The ADRs are kept as <em>history</em> — the justification record — alongside the glossary,
          open-questions, and the research notes. Rendered with stable section anchors and in-corpus
          cross-links. Start in the sidebar.
        </CapCard>
        <CapCard title="Annotate">
          Select any text to attach a comment to that exact span — it highlights inline, like a word
          processor. Comment on a whole document, a section, or a selection; resolve when addressed.
          Highlights re-anchor to the text, so they survive edits.
        </CapCard>
        <CapCard title="Library">
          Modular, injectable <em>artifacts</em> — <code>definition</code> / <code>principle</code> /{' '}
          <code>pattern</code> / <code>guardrail</code> / <code>techstack</code> units, browsable and
          searchable. The durable guidance is synthesised from the ADRs; each artifact cites the ADR
          it came from.
        </CapCard>
      </div>

      <p className="muted small">
        Note: an “artifact” is deliberately not a bare <code>asset</code> — the glossary reserves
        that for tree/game art. See the studio README for the data model and design choices.
      </p>
    </div>
  );
}

function Stat({
  n,
  label,
  href,
}: {
  n: number;
  label: string;
  href?: string | undefined;
}): React.JSX.Element {
  const inner = (
    <>
      <span className="stat-n">{n}</span>
      <span className="stat-label">{label}</span>
    </>
  );
  return href ? (
    <a className="stat" href={href}>
      {inner}
    </a>
  ) : (
    <div className="stat">{inner}</div>
  );
}

function CapCard({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="cap-card">
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
