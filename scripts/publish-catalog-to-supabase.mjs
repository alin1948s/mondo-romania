import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(ROOT, "data/catalog.json");
const projectUrl = String(process.env.MONDO_SUPABASE_URL || "").replace(/\/$/, "");
const apiKey = process.env.MONDO_SUPABASE_SECRET_KEY || process.env.MONDO_SUPABASE_SERVICE_ROLE_KEY || "";

if (!projectUrl || !apiKey) {
  console.error("Set MONDO_SUPABASE_URL and MONDO_SUPABASE_SECRET_KEY in the local shell before publishing the catalog.");
  process.exit(2);
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (!Array.isArray(catalog.categories) || catalog.categories.length !== 12 || !Array.isArray(catalog.products) || catalog.products.length !== catalog.productCount) {
  throw new Error("Catalog snapshot incomplete; no database changes were made.");
}

const headers = {
  apikey: apiKey,
  "Content-Type": "application/json",
  "Content-Profile": "public",
  "Accept-Profile": "public",
};
// Legacy service_role keys are JWTs; current sb_secret keys are API keys and must not be sent as bearer tokens.
if (apiKey.startsWith("eyJ")) headers.Authorization = `Bearer ${apiKey}`;

const response = await fetch(`${projectUrl}/rest/v1/rpc/sync_emondo_catalog`, {
  method: "POST",
  headers,
  body: JSON.stringify({ p_catalog: catalog }),
  signal: AbortSignal.timeout(120_000),
});
const text = await response.text();
let result;
try { result = text ? JSON.parse(text) : null; } catch { result = text; }
if (!response.ok) throw new Error(`Supabase catalog sync failed (${response.status}): ${JSON.stringify(result).slice(0, 900)}`);
console.log(`Catalog published: ${result.products} products (${result.inserted} new, ${result.updated} source-managed refreshed), ${result.categories} categories.`);
console.log("Manual product edits and publication status were preserved. Review the website after sync.");
