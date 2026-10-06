import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".sql": "text/plain; charset=utf-8"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end("Bad path"); return; }
  const privatePrefixes = ["/docs/", "/supabase/", "/scripts/", "/templates/"];
  const privateFiles = new Set(["/README.md", "/package.json", "/server.mjs"]);
  if (privatePrefixes.some(prefix => pathname.startsWith(prefix)) || privateFiles.has(pathname) || [".md", ".sql", ".csv", ".mjs"].includes(extname(pathname).toLowerCase())) {
    response.writeHead(404).end("Not found"); return;
  }
  const target = resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    const info = await stat(target);
    if (info.isFile()) {
      const body = await readFile(target);
      response.writeHead(200, { "Content-Type": mime[extname(target).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
      response.end(body); return;
    }
  } catch { /* Clean application routes fall back to the shared page shell below. */ }
  if (extname(pathname)) { response.writeHead(404).end("Not found"); return; }
  try {
    const body = await readFile(resolve(root, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
    response.end(body);
  } catch { response.writeHead(500).end("Unable to load site"); }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, "127.0.0.1", () => console.log(`MONDO site ready at http://127.0.0.1:${port}`));
