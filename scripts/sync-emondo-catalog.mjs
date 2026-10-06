import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://emondo.ro";
const OUTPUT = resolve(ROOT, "data/catalog.json");
const ROOT_CATEGORY_IDS = new Set([42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]);
const CATEGORY_LABELS = {
  incaltaminte: ["Încălțăminte", "Safety footwear"],
  imbracaminte: ["Îmbrăcăminte", "Workwear"],
  manusi: ["Mănuși", "Protective gloves"],
  "protectia-capului": ["Protecția capului", "Head protection"],
  "protectia-ochilor-si-a-fetei": ["Protecția ochilor și a feței", "Eye and face protection"],
  "protectie-respiratorie": ["Protecție respiratorie", "Respiratory protection"],
  "protectie-auditiva": ["Protecția auzului", "Hearing protection"],
  "lucrul-la-inaltime": ["Lucrul la înălțime", "Working at height"],
  "semnalizare-si-delimitare": ["Semnalizare și delimitare", "Signs and marking"],
  "protectia-mediului": ["Protecția mediului", "Environmental protection"],
  "echipamente-tehnice": ["Echipamente tehnice", "Technical equipment"],
  "curatenie-si-igiena": ["Curățenie și igienă", "Cleaning and hygiene"]
};
const HTML_ENTITIES = {
  icirc: "î", acirc: "â", Icirc: "Î", Acirc: "Â", eacute: "é", auml: "ä", Uuml: "Ü", Oslash: "Ø", Omega: "Ω",
  asymp: "≈", bdquo: "„", bull: "•", deg: "°", divide: "÷", frac14: "¼", ge: "≥", hellip: "…", ldquo: "“", le: "≤",
  mdash: "—", middot: "·", minus: "−", mu: "μ", ndash: "–", ordm: "º", permil: "‰", plusmn: "±", raquo: "»", rarr: "→",
  rdquo: "”", reg: "®", rlm: "", shy: "", sup2: "²", times: "×", trade: "™"
};

const requestHeaders = {
  accept: "application/json",
  "x-requested-with": "XMLHttpRequest",
  referer: `${ORIGIN}/`
};

async function getJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise(resolveWait => setTimeout(resolveWait, attempt * 1_000));
    }
  }
  throw lastError;
}

function cleanText(value = "") {
  return String(value)
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z][a-z0-9]+);/gi, (entity, name) => HTML_ENTITIES[name] ?? HTML_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function categoryPageCount(paginationHTML = "") {
  const pages = [...paginationHTML.matchAll(/[?&]page=(\d+)/g)].map(match => Number(match[1]));
  return Math.max(1, ...pages);
}

function parsePrice(value) {
  if (value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function concurrencyPool(items, limit, worker) {
  let cursor = 0;
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }));
}

const { categories: sourceCategories = [] } = await getJson(`${ORIGIN}/categories`);
const categories = sourceCategories
  .filter(category => ROOT_CATEGORY_IDS.has(Number(category.id)))
  .map((category, index) => {
    const labels = CATEGORY_LABELS[category.slug] || [category.name, category.name];
    return { id: category.slug, sourceId: Number(category.id), name: labels[0], nameEn: labels[1], sourceName: category.name, eyebrow: String(index + 1).padStart(2, "0") };
  });

if (categories.length !== ROOT_CATEGORY_IDS.size) {
  throw new Error(`Expected 12 main catalog categories, found ${categories.length}. The source structure may have changed.`);
}

const pages = [];
await concurrencyPool(categories, 3, async category => {
  const first = await getJson(`${ORIGIN}/category-products/${category.sourceId}`);
  const pageCount = categoryPageCount(first.paginationHTML);
  pages.push({ category, page: 1, result: first });
  for (let page = 2; page <= pageCount; page += 1) pages.push({ category, page });
  console.log(`${category.name}: ${pageCount} pagini, ${first.products?.length || 0} produse pe prima pagină`);
});

const pending = pages.filter(page => !page.result);
await concurrencyPool(pending, 4, async entry => {
  entry.result = await getJson(`${ORIGIN}/category-products/${entry.category.sourceId}?page=${entry.page}`);
  if (!Array.isArray(entry.result.products)) throw new Error(`Invalid products payload for category ${entry.category.sourceId}, page ${entry.page}`);
  console.log(`Pagină ${entry.page} · ${entry.category.name}: ${entry.result.products.length} produse`);
});

const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
pages.sort((a, b) => categoryOrder.get(a.category.id) - categoryOrder.get(b.category.id) || a.page - b.page);

const uniqueProducts = new Map();
let listingCount = 0;
for (const { category, result } of pages) {
  const rows = result?.products;
  if (!Array.isArray(rows)) throw new Error(`Missing products for category ${category.sourceId}`);
  listingCount += rows.length;
  for (const source of rows) {
    const id = String(source.id || "").trim();
    const slug = String(source.slug || "").trim();
    const name = cleanText(source.name);
    if (!id || !slug || !name) continue;
    const description = cleanText(source.description || source.shortDescription || "");
    const shortDescription = cleanText(source.shortDescription || description);
    const price = parsePrice(source.special_price) ?? parsePrice(source.price);
    const item = {
      id,
      slug,
      name,
      subtitle: shortDescription === name ? "" : shortDescription.slice(0, 220),
      code: "",
      brand: "",
      manufacturer: "",
      category: category.id,
      sourceCategoryId: category.sourceId,
      categories: [category.id],
      price,
      priceVat: parsePrice(String(source.priceWithTax || "").match(/[\d.,]+/)?.[0]?.replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")),
      currency: "RON",
      image: source.image || "",
      imageAlt: name,
      colors: [],
      sizes: [],
      standards: [],
      summary: description.slice(0, 12_000),
      details: description.split(/\n+/).map(line => line.trim()).filter(line => line.length > 10).slice(0, 24),
      sourceUrl: `${ORIGIN}/${slug}`,
      categoryUrl: `${ORIGIN}/${category.id}/`
    };
    const existing = uniqueProducts.get(id);
    if (!existing) uniqueProducts.set(id, item);
    else {
      if (!existing.categories.includes(category.id)) existing.categories.push(category.id);
      if (!existing.image && item.image) existing.image = item.image;
      if (existing.price == null && item.price != null) existing.price = item.price;
    }
  }
}

const products = [...uniqueProducts.values()].sort((a, b) => a.name.localeCompare(b.name, "ro"));
const categoryProductCounts = Object.fromEntries(categories.map(category => [
  category.id,
  products.filter(product => product.categories.includes(category.id)).length
]));
const catalog = {
  source: ORIGIN,
  syncedAt: new Date().toISOString(),
  sourceCategoryCount: categories.length,
  listingCount,
  productCount: products.length,
  categoryProductCounts,
  categories,
  products
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(catalog)}\n`, "utf8");
await import("./build-catalog-assets.mjs");
console.log(`Catalog salvat: ${products.length} produse unice din ${listingCount} listări în ${OUTPUT}`);
