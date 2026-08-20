// island.tsx — entry point for the ISLAND evidence page (dev-only).
//
// Same settled-signal contract as the plant page: the capture waits on a signal the page
// publishes rather than sleeping, because this arc has twice captured evidence mid-draw.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The shipped map's real scale on a 2880x1920 display: 1x sprites are already upscaled
 *  about 2x before anyone sees them (ADR-0380 D2). */
const DELIVERED = 2;

function App() {
  return (
    <main>
      <header>
        <h1>The same island, two delivery conventions</h1>
        <p>
          The previous pass answered on a row of plants, which cannot say whether vegetation
          reads as a <em>place</em>. This is the island. Both panels in each pair draw the same{' '}
          <code>buildScene</code> output &mdash; same ground cells, same plants at the same ground
          positions, same banded palette, same light, same orthographic 50&deg; camera. Only the
          rasterisation resolution differs.
        </p>
        <p className="numbers">
          13 hexes &middot; 11 capabilities &middot; all healthy &middot; density is{' '}
          <code>2 + tests &times; 1.9</code> (ADR-0226 D2) &middot; the scene is projected at
          20&deg; and UNPROJECTED before rendering, so the ground is foreshortened exactly once
        </p>
      </header>

      <section>
        <h2>1 &mdash; at the size it is actually delivered</h2>
        <p className="lede">
          The unflattering pair, life size on a 2880&times;1920 display.
        </p>
        <div className="row">
          <IslandPanel
            label="SPRITE — today"
            note={`1 px/unit, upscaled ${DELIVERED}x`}
            pxPerUnit={1}
            displayPxPerUnit={DELIVERED}
          />
          <IslandPanel
            label="LIVE — same scene"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
          />
        </div>
      </section>

      <section>
        <h2>2 &mdash; the same island, zoomed in</h2>
        <p className="lede">
          Where the two conventions part. Same island, bigger map scale each time.
        </p>
        {[4, 8].map((z) => (
          <div className="row zoomrung" key={z}>
            <span className="rung">{z} px / unit</span>
            <IslandPanel
              label="sprite"
              note={`1 px/unit, upscaled ${z}x`}
              pxPerUnit={1}
              displayPxPerUnit={z}
            />
            <IslandPanel label="live" note={`${z} px/unit`} pxPerUnit={z} displayPxPerUnit={z} />
          </div>
        ))}
      </section>

      <section>
        <h2>3 &mdash; the swirls fork: mound vs foliage</h2>
        <p className="lede">
          The owner&rsquo;s read of the first pass was &ldquo;circular swirls&rdquo;, and that is a
          fair description of what a mound IS: every lobe is a sphere scaled on the world axes, so
          the outline is a union of circles and the banded shading lays concentric rings inside
          each one &mdash; the rings <em>are</em> the swirl. <strong>foliage</strong> changes only
          each lobe&rsquo;s orientation and proportion &mdash; flattened into leaf-like discs,
          tilted onto their own axes &mdash; at the same lobe count, same footprint, same triangle
          cost. Everything else is identical.
        </p>
        <div className="row stack">
          <div className="row">
            <IslandPanel label="mound (today)" note="8 px/unit" pxPerUnit={8} displayPxPerUnit={8} style="mound" />
            <IslandPanel label="foliage" note="8 px/unit" pxPerUnit={8} displayPxPerUnit={8} style="foliage" />
          </div>
          <div className="row">
            <IslandPanel
              label="mound — as delivered"
              note={`${DELIVERED} px/unit`}
              pxPerUnit={DELIVERED}
              displayPxPerUnit={DELIVERED}
              style="mound"
            />
            <IslandPanel
              label="foliage — as delivered"
              note={`${DELIVERED} px/unit`}
              pxPerUnit={DELIVERED}
              displayPxPerUnit={DELIVERED}
              style="foliage"
            />
          </div>
        </div>
      </section>

      <section>
        <h2>4 &mdash; the land without vegetation, and one unhealthy capability</h2>
        <p className="lede">
          The bare control tells you how much of the picture is the vegetation at all. The mixed
          island shows the banded material carrying a second status: nothing is snapped, so a
          parcel can only ever emit its own family&rsquo;s colours.
        </p>
        <div className="row">
          <IslandPanel label="bare land" note="8 px/unit, no plants" pxPerUnit={8} displayPxPerUnit={8} plants={false} />
          <IslandPanel
            label="one unhealthy capability"
            note="8 px/unit"
            pxPerUnit={8}
            displayPxPerUnit={8}
            island={{ oddOneOut: { index: 0, status: 'unhealthy' } }}
          />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__stExperimentSettled = true;
  });
});
