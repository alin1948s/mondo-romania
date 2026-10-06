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
const requiredColumns = ["name", "slug", "product_code", "category_slug", "brand_slug", "price_net", "price_gross", "currency", "subtitle", "summary", "description", "manufacturer", "image_url", "image_alt", "source_url", "color_options", "size_options", "standards", "specifications_json", "variants_json", "assets_json"];
const source = await readFile(inputFile, "utf8");
const text = source.replace(/^\uFEFF/, "");
const rows = parseCsv(text);
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
  const variants = jsonCell(row.variants_json, "variants_json", rowNo);
  const specifications = jsonCell(row.specifications_json, "specifications_json", rowNo);
  const assets = jsonCell(row.assets_json, "assets_json", rowNo);
  for (const spec of specifications) if (!spec || typeof spec.name !== "string" || typeof spec.value !== "string" || !["specification", "standard", "material", "use_case"].includes(spec.kind || "specification")) throw new Error(`Rândul ${rowNo}: fiecare specificație are kind, name și value text.`);
  for (const variant of variants) if (!variant || [variant.color, variant.size, variant.variant_code].some(v => v != null && typeof v !== "string") || variant.price_net != null && (!Number.isFinite(Number(variant.price_net)) || Number(variant.price_net) < 0)) throw new Error(`Rândul ${rowNo}: variantă invalidă în variants_json.`);
  for (const asset of assets) {
    if (!asset || !["image", "document"].includes(asset.asset_type)) throw new Error(`Rândul ${rowNo}: asset_type trebuie să fie image sau document.`);
    httpsUrl(asset.source_url, "assets_json.source_url", rowNo, false);
    if (asset.file_size_bytes != null && (!Number.isInteger(Number(asset.file_size_bytes)) || Number(asset.file_size_bytes) < 0 || Number(asset.file_size_bytes) > 10 * 1024 * 1024)) throw new Error(`Rândul ${rowNo}: fișierul referit depășește limita de 10 MB.`);
  }
  const translation = {
    name: bounded(row.name_en, 180, "name_en", rowNo), subtitle: bounded(row.subtitle_en, 240, "subtitle_en", rowNo),
    summary: bounded(row.summary_en, 1500, "summary_en", rowNo), description: bounded(row.description_en, 12000, "description_en", rowNo),
    image_alt: bounded(row.image_alt_en, 240, "image_alt_en", rowNo), details: csvList(row.details_en),
  };
  if (!translation.name && (translation.subtitle || translation.summary || translation.description || translation.image_alt || translation.details.length)) throw new Error(`Rândul ${rowNo}: completează name_en pentru a importa și celelalte câmpuri în engleză.`);
  return {
    source: row, translation,
    product: {
      name: bounded(row.name, 180, "name", rowNo, true), slug, product_code: bounded(row.product_code, 80, "product_code", rowNo),
      category_slug: bounded(row.category_slug, 100, "category_slug", rowNo, true), brand_slug: bounded(row.brand_slug, 100, "brand_slug", rowNo, true),
      price_net: numberCell(row.price_net, "price_net", rowNo), price_gross: numberCell(row.price_gross, "price_gross", rowNo),
      currency: bounded(row.currency || "RON", 3, "currency", rowNo) || "RON", subtitle: bounded(row.subtitle, 240, "subtitle", rowNo),
      summary: bounded(row.summary, 1500, "summary", rowNo), description: bounded(row.description, 12000, "description", rowNo),
      manufacturer: bounded(row.manufacturer, 160, "manufacturer", rowNo), image_url: httpsUrl(row.image_url, "image_url", rowNo),
      image_alt: bounded(row.image_alt, 240, "image_alt", rowNo), source_url: httpsUrl(row.source_url, "source_url", rowNo),
      color_options: csvList(row.color_options), size_options: csvList(row.size_options), standards: csvList(row.standards),
      specifications, status: "draft", is_demo: false,
    }, variants, specifications, assets,
  };
});

if (!apply) {
  console.log(`Dry run valid: ${products.length} products. No data was written.`);
  console.log("Rows will be imported as drafts. Officially review every product, variant, standard, price and asset before publishing.");
  process.exit(0);
}

async function request(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { method, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text(); let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  return data;
}
const [categories, brands] = await Promise.all([
  request("categories?select=id,slug"), request("brands?select=id,slug")
]);
const categoryBySlug = new Map(categories.map(item => [item.slug, item.id]));
const brandBySlug = new Map(brands.map(item => [item.slug, item.id]));
for (const [index, item] of products.entries()) {
  const line = index + 2;
  const categoryId = categoryBySlug.get(item.product.category_slug);
  const brandId = brandBySlug.get(item.product.brand_slug);
  if (!categoryId || !brandId) throw new Error(`Rândul ${line}: category_slug / brand_slug trebuie să existe în baza de date.`);
  item.product.category_id = categoryId; item.product.brand_id = brandId;
  delete item.product.category_slug; delete item.product.brand_slug;
}

let inserted = 0; let duplicates = 0; let childRows = 0; let translationsAdded = 0;
for (let start = 0; start < products.length; start += 100) {
  const batch = products.slice(start, start + 100);
  const result = await request("products?on_conflict=slug", "POST", batch.map(item => item.product));
  inserted += result.length;
  const insertedBySlug = new Map(result.map(item => [item.slug, item]));
  duplicates += batch.length - result.length;
  for (const item of batch) {
    const saved = insertedBySlug.get(item.product.slug); if (!saved) continue;
    const variants = item.variants.map(variant => ({ product_id: saved.id, variant_code: bounded(variant.variant_code, 100, "variant_code", 0), color: bounded(variant.color, 80, "variant color", 0), size: bounded(variant.size, 80, "variant size", 0), price_net: variant.price_net == null ? null : Number(variant.price_net), is_published: false }));
    const specifications = item.specifications.map(spec => ({ product_id: saved.id, kind: spec.kind || "specification", name: bounded(spec.name, 120, "specificație name", 0, true), value: bounded(spec.value, 1000, "specificație value", 0, true) }));
    const assets = item.assets.map(asset => ({ product_id: saved.id, asset_type: asset.asset_type, source_url: new URL(asset.source_url).href, alt_text: bounded(asset.alt_text, 240, "alt_text", 0), label: bounded(asset.label, 180, "asset label", 0), mime_type: bounded(asset.mime_type, 100, "mime_type", 0), file_size_bytes: asset.file_size_bytes == null ? null : Number(asset.file_size_bytes), is_primary: asset.is_primary === true }));
    if (variants.length) await request("product_variants", "POST", variants);
    if (specifications.length) await request("product_specifications", "POST", specifications);
    if (assets.length) await request("product_assets", "POST", assets);
    childRows += variants.length + specifications.length + assets.length;
    const translation = item.translation;
    if (translation.name) {
      await request("product_translations?on_conflict=product_id,locale", "POST", [{ product_id: saved.id, locale: "en", ...translation }]);
      translationsAdded++;
    }
  }
}
console.log(`Import complete: ${inserted} new drafts; ${duplicates} existing slugs skipped; ${translationsAdded} English translations and ${childRows} variants/specifications/assets added.`);
console.log("No product was published. Review and publish through /admin/ after confirming all data with MONDO.");
