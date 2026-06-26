import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

/**
 * Serve the COMPILED studio dist over http://127.0.0.1 so its absolute `/assets/…` paths
 * resolve — a `file://` load 404s them (and restricts ES-module loading), leaving a blank
 * window. Hand-rolled `node:http`, NO extra deps (the house posture, mirroring
 * apps/studio/server/serve.ts — which the desktop must NOT import across the surface
 * boundary). This serves the studio's already-public UI only; it carries no source, no
 * engine, no stories (ADR-0090 d.4).
 *
 * `/api/*` is deliberately NOT served — the worker backend is Step 2. A clean 503 lets the
 * studio fall back to its store-unavailable banner (proving the shell renders) instead of
 * being handed HTML for a JSON fetch.
 */
export function serveStudio(distDir: string): Promise<{ url: string; server: Server }> {
  const root = normalize(distDir);
  const indexHtml = join(root, "index.html");

  const server = createServer((req, res) => {
    const rawPath = (req.url ?? "/").split("?")[0] ?? "/";

    if (rawPath.startsWith("/api/")) {
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      res.end('{"error":"no backend in the desktop shell (Step 1; worker wiring is Step 2)"}');
      return;
    }

    const rel = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
    const candidate = normalize(join(root, rel));
    // Traversal guard + SPA fallback: serve the file only if it resolves inside dist and
    // exists; otherwise hand back index.html (the SPA uses hash routing).
    const target =
      candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : indexHtml;

    res.writeHead(200, { "content-type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream" });
    createReadStream(target).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/`, server });
    });
  });
}
