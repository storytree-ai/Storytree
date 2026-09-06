# prep/ — the engine, r3f and web edits, held here while their capabilities were fenced

TEMPORARY. These are exact-anchor patch scripts for the files this branch could not write while
`render-core` (geo-sweep) and `r3f-world-spike` (wheat-pale) were held by live siblings on
2026-09-06. Apply in this order once the claims are yours, then DELETE this directory:

    python3 prep/engine-patch.py   # packages/forest-world/src: hex.ts, sizing.ts, coast.ts, scene.ts, index.ts
    python3 prep/r3f-patch.py      # packages/forest-world-r3f/src/land-per-capability.ts (+ test): freeze the tuned basis
    python3 prep/web-patch.py      # web/src/scripts/forest-snapshot-map.ts — at engine-sync time, in the web repo

`tile-model.mjs <scene.json>` is the lever model the README's part-one table was produced from.
The studio side (packer, bridge, export driver, harness page and drivers) is already applied on
this branch and compiles once the engine patch lands.
