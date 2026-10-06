import { readFile } from "node:fs/promises";

const [inputFile, ...args] = process.argv.slice(2);
const apply = args.includes("--apply");
if (!inputFile) {
  console.error("Usage: node scripts/import-products.mjs <MONDO-approved.csv> [--apply]");
  console.error("Without --apply the importer validates the CSV and prints a dry-run summary.");
  process.exit(2);
}
const baseUrl = (process.env.MONDO_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.MONDO_SUPABASE_SERVICE_ROLE_KEY || "";
if (apply && (!baseUrl || !serviceKey)) {
  console.error("Set MONDO_SUPABASE_URL and MONDO_SUPABASE_SERVICE_ROLE_KEY in this local shell before using --apply.");
  process.exit(2);
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(value => value.trim())) rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Error("CSV invalid: ghilimelele nu sunt închise.");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); if (row.some(value => value.trim())) rows.push(row); }
  if (!rows.length) throw new Error("CSV-ul nu conține antet.");
  const headers = rows.shift().map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim());
  if (new Set(headers).size !== headers.length) throw new Error("CSV invalid: există nume de coloane repetate.");
  return rows.map((cells, rowIndex) => {
    if (cells.length !== headers.length) throw new Error(`Rândul ${rowIndex + 2}: ${cells.length} valori, dar antetul are ${headers.length} coloane.`);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index].trim()]));
  });
}
const requiredColumns = ["name", "slug", "category_slug", "product_code", "price_net", "price_gross", "currency", "subtitle", "summary", "description", "manufacturer", "image_url", "image_alt", "source_url", "color_options", "size_options", "standards", "specifications_json"];
const source = await readFile(inputFile, "utf8");
const rows = parseCsv(source.replace(/^\uFEFF/, ""));
const header = Object.keys(rows[0] || {});
const missingColumns = requiredColumns.filter(name => !header.includes(name));
if (missingColumns.length) throw new Error(`Lipsesc coloanele: ${missingColumns.join(", ")}`);
if (rows.length > 10000) throw new Error("Import oprit: maximum 10.000 rânduri per execuție.");

const slugSet = new Set();
function csvList(value) { return value ? value.split("|").map(v => v.trim()).filter(Boolean) : []; }
function jsonCell(value, field, rowNo) {
  if (!value) return [];
  try { const result = JSON.parse(value); if (!Array.isArray(result)) throw new Error("not array"); return result; }
  catch { throw new Error(`Rândul ${rowNo}: ${field} trebuie să fie un JSON array.`); }
}
function httpsUrl(value, field, rowNo, optional = true) {
  if (!value && optional) return null;
  try { const url = new URL(value); if (url.protocol !== "https:") throw new Error(); return url.href; }
  catch { throw new Error(`Rândul ${rowNo}: ${field} trebuie să fie un URL https valid.`); }
}
function numberCell(value, field, rowNo) {
  if (!value) return null;
  const result = Number(value.replace(",", "."));
  if (!Number.isFinite(result) || result < 0) throw new Error(`Rândul ${rowNo}: ${field} trebuie să fie un număr pozitiv.`);
  return result;
}
function bounded(value, max, field, rowNo, required = false) {
  const result = String(value || "").trim();
  if (required && !result) throw new Error(`Rândul ${rowNo}: ${field} este obligatoriu.`);
  if (result.length > max) throw new Error(`Rândul ${rowNo}: ${field} depășește ${max} caractere.`);
  return result || null;
}

const products = rows.map((row, index) => {
  const rowNo = index + 2;
  const slug = bounded(row.slug, 180, "slug", rowNo, true);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Rândul ${rowNo}: slug-ul acceptă litere mici, cifre și cratimă.`);
  if (slugSet.has(slug)) throw new Error(`Rândul ${rowNo}: slug duplicat în fișier (${slug}).`);
  slugSet.add(slug);
  const specifications = jsonCell(row.specifications_json, "specifications_json", rowNo);
  for (const spec of specifications) if (!spec || typeof spec.name !== "string" || typeof spec.value !== "string" || !["specification", "standard", "material", "use_case"].includes(spec.kind || "specification")) throw new Error(`Rândul ${rowNo}: fiecare specificație are kind, name și value text.`);
  return {
    category_slug: bounded(row.category_slug, 100, "category_slug", rowNo, true),
    product: {
      name: bounded(row.name, 180, "name", rowNo, true), slug, product_code: bounded(row.product_code, 80, "product_code", rowNo),
      price_net: numberCell(row.price_net, "price_net", rowNo), price_gross: numberCell(row.price_gross, "price_gross", rowNo),
      currency: bounded(row.currency || "RON", 3, "currency", rowNo) || "RON", subtitle: bounded(row.subtitle, 240, "subtitle", rowNo),
      summary: bounded(row.summary, 12000, "summary", rowNo), description: bounded(row.description, 12000, "description", rowNo),
      manufacturer: bounded(row.manufacturer, 160, "manufacturer", rowNo), image_url: httpsUrl(row.image_url, "image_url", rowNo),
      image_alt: bounded(row.image_alt, 240, "image_alt", rowNo), source_url: httpsUrl(row.source_url, "source_url", rowNo),
      color_options: csvList(row.color_options), size_options: csvList(row.size_options), standards: csvList(row.standards),
      specifications, status: "draft", is_demo: false,
    },
  };
});

if (!apply) {
  console.log(`Dry run valid: ${products.length} products. No data was written.`);
  console.log("Rows will be imported as drafts. Review every product, specification, standard and price before publishing.");
  process.exit(0);
}

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text(); let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  return data;
}
const categories = await request("categories?select=id,slug");
const categoryBySlug = new Map(categories.map(item => [item.slug, item.id]));
for (const [index, item] of products.entries()) {
  const categoryId = categoryBySlug.get(item.category_slug);
  if (!categoryId) throw new Error(`Rândul ${index + 2}: category_slug trebuie să existe în baza de date.`);
  item.product.category_id = categoryId;
  delete item.category_slug;
}

let inserted = 0; let duplicates = 0;
for (let start = 0; start < products.length; start += 100) {
  const batch = products.slice(start, start + 100);
  const result = await request("products?on_conflict=slug", "POST", batch.map(item => item.product));
  inserted += result.length;
  duplicates += batch.length - result.length;
}
console.log(`Import complete: ${inserted} new drafts; ${duplicates} existing slugs skipped.`);
console.log("No product was published. Review and publish through /admin/ after confirming all data with MONDO.");
