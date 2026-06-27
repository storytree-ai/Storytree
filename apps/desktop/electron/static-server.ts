import { createServer, request as httpRequest, type Server } from "node:http";
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
 * `/api/*` is PROXIED to the thick-local backend sidecar (ADR-0119 §1) when `backendPort` is given —
 * a plain `node:http` request pipe, NO extra deps (the house posture). Without a sidecar (the Step-1
 * shell, or the sidecar not yet started) it falls back to a clean 503 so the studio shows its
 * store-unavailable banner instead of being handed HTML for a JSON fetch.
 */
export function serveStudio(
  distDir: string,
  opts?: { backendPort?: number },
): Promise<{ url: string; server: Server }> {
  const root = normalize(distDir);
  const indexHtml = join(root, "index.html");
  const backendPort = opts?.backendPort;

  const server = createServer((req, res) => {
    const rawPath = (req.url ?? "/").split("?")[0] ?? "/";

    if (rawPath.startsWith("/api/")) {
      if (backendPort === undefined) {
        res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
        res.end('{"error":"no local backend (sidecar not started)"}');
        return;
      }
      // Pipe the full request (method + path + query + headers + body) to the sidecar and stream its
      // response back. A connection error becomes a 502 JSON envelope (never HTML for a JSON fetch).
      const proxyReq = httpRequest(
        {
          host: "127.0.0.1",
          port: backendPort,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        }
        res.end(JSON.stringify({ error: `local backend unreachable: ${err.message}` }));
      });
      req.pipe(proxyReq);
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
