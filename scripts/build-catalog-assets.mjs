import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(resolve(ROOT, "data/catalog.json"), "utf8"));
if (!Array.isArray(catalog.categories) || catalog.categories.length !== 12 || !Array.isArray(catalog.products) || catalog.products.length !== catalog.productCount) {
  throw new Error("Catalogul sincronizat nu este complet; data.js și sitemap.xml nu au fost actualizate.");
}

const categories = catalog.categories.map(({ id, name, nameEn, eyebrow }) => ({ id, name, eyebrow }));
const activities = [
  { id: "incaltaminte", title: "Construcții & amenajări", note: "Echipare pentru lucru pe șantier", category: "incaltaminte" },
  { id: "imbracaminte", title: "Logistică & depozit", note: "Echipare pentru depozit și transport", category: "imbracaminte" },
  { id: "protectia-capului", title: "Producție & mentenanță", note: "Protecție pentru activități tehnice", category: "protectia-capului" },
  { id: "echipamente-tehnice", title: "PSI & intervenție", note: "Echipamente pentru intervenție", category: "echipamente-tehnice" }
];
const categoryTranslations = Object.fromEntries(catalog.categories.map(({ id, nameEn }) => [id, nameEn]));
const dataJs = [
  `window.MONDO_CATEGORIES = ${JSON.stringify(categories)};`,
  "window.MONDO_PRODUCTS = [];",
  `window.MONDO_ACTIVITIES = ${JSON.stringify(activities)};`,
  `window.MONDO_EN_CATEGORY_LABELS = ${JSON.stringify(categoryTranslations)};`,
  "window.MONDO_EN_PRODUCTS = {};",
  `window.MONDO_EN_ACTIVITIES = ${JSON.stringify(["Construction & fitting", "Logistics & warehousing", "Production & maintenance", "Fire & rescue"])};`,
  ""
].join("\n");
await writeFile(resolve(ROOT, "data.js"), dataJs, "utf8");

const site = "https://mondo-romania.ro";
const lastmod = catalog.syncedAt.slice(0, 10);
const paths = ["/", "/catalog/", "/echipeaza/", "/despre/", "/contact/", "/informatii/livrare/", "/informatii/retur/", "/informatii/garantie/", "/informatii/reclamatii/", "/informatii/confidentialitate/", "/informatii/cookies/", "/informatii/plata/"];
for (const product of catalog.products) paths.push(`/produs/${encodeURIComponent(product.slug)}/`);
const urlRows = paths.map(path => `  <url><loc>${site}${path}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
await writeFile(resolve(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlRows}\n</urlset>\n`, "utf8");
console.log(`Resurse pregătite: ${categories.length} categorii și ${catalog.products.length} pagini de produs în sitemap.`);
