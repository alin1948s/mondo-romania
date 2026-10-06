(() => {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") === "/admin") return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.MONDO_CONFIG || {};
  let products = [];
  let liveCatalog = false;
  let catalogMeta = null;
  let activeCategory = "";
  let activeTerm = "";
  let toastTimer;
  let turnstileWidgetId = null;

  const storage = {
    read(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("Stocarea locală nu este disponibilă în acest browser."); } }
  };
  let language = storage.read("mondo-language-v1", "ro") === "en" ? "en" : "ro";
  const esc = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalizeSearchText = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const EN_COPY = {
    "Sari la conținut": "Skip to content",
    "Protecția muncii": "Occupational safety",
    "Protecția mediului": "Environmental protection",
    "PSI & intervenție": "Fire safety & rescue",
    "ROMÂNIA": "ROMANIA",
    "MONDO România — pagina principală": "MONDO Romania — home page",
    "Navigare principală": "Main navigation",
    "Catalog": "Catalog",
    "Pe activități": "By activity",
    "Echipează-ți echipa": "Equip your team",
    "Despre MONDO": "About MONDO",
    "Schimbă limba în engleză": "Switch language to English",
    "Switch language to Romanian": "Schimbă limba în română",
    "Deschide căutarea": "Open search",
    "Caută produse": "Search products",
    "Lista de echipare": "Equipment list",
    "Lista mea": "My list",
    "Deschide meniul": "Open menu",
    "Navigare rapidă": "Quick navigation",
    "Caută": "Search",
    "Echipează": "Equip",
    "Catalog eMondo": "eMondo catalog",
    "preț eMondo · fără TVA": "eMondo price · excl. VAT",
    "Catalog complet": "Full catalog",
    "Explorează": "Explore",
    "Informații": "Information",
    "Livrare": "Delivery",
    "Retur": "Returns",
    "Termeni și condiții": "Terms and conditions",
    "Garanție": "Warranty",
    "Reclamații": "Complaints",
    "Confidențialitate": "Privacy",
    "Cookies": "Cookies",
    "Sursa oficială ↗": "Official source ↗",
    "Echipamente pentru protecția muncii, protecția mediului și intervenții pentru pompieri.": "Equipment for occupational safety, environmental protection and fire and rescue teams.",
    "MONDO România · Echipamente profesionale": "MONDO Romania · Professional equipment",
    "Navigare după echipament": "Browse by equipment",
    "Găsește categoria": "Find the right",
    "potrivită pentru tine.": "category for you.",
    "Catalog complet cu echipamente pentru protecția muncii, mediu, semnalizare, igienă și intervenție.": "Browse occupational safety, environmental, signage, hygiene and emergency-response equipment.",
    "Un punct de pornire": "A starting point",
    "Ce activitate": "What kind of work",
    "desfășori?": "do you do?",
    "Alege o zonă pentru a explora categoriile și produsele asociate. Selectarea te ajută să navighezi în catalog.": "Choose an area to browse its related categories and products.",
    "Catalogul MONDO": "MONDO catalog",
    "Produse pentru fiecare echipă.": "Equipment for every team.",
    "Vezi catalogul": "Browse catalog",
    "Prețurile sunt preluate din catalogul eMondo și se pot actualiza acolo. Consultă pagina produsului pentru informații comerciale curente.": "Prices come from the eMondo catalog and may change. Visit the product page for current commercial information.",
    "Pentru firme și organizații": "For businesses and organizations",
    "Echipează-ți echipa.": "Equip your team.",
    "Adaugă articole, cantități și detalii despre variante, apoi pregătește o cerere către echipa MONDO.": "Add products, quantities and option details, then prepare a request for MONDO.",
    "Construiește lista": "Build your list",
    "Despre companie": "About the company",
    "MONDO Romania produce și importă echipamente pentru sănătate și securitate în muncă, protecția mediului și intervenții pentru pompieri.": "MONDO Romania manufactures and imports equipment for occupational safety, environmental protection, and fire and rescue teams.",
    "Echipare pentru achiziții": "For business purchasing",
    "Începe cu produsele.": "Start with the products.",
    "Trimite o cerere clară.": "Send a clear request.",
    "Lista păstrează produsele și cantitățile alese și pregătește un e-mail către echipa MONDO.": "Your list keeps the selected products and quantities and prepares an email to MONDO.",
    "Deschide lista de echipare ↗": "Open your equipment list ↗",
    "În echipă": "Add to list",
    "Culori": "Colours",
    "Detalii": "Details",
    "Cod:": "Code:",
    "Adaugă la": "Add to",
    "Scoate din": "Remove from",
    "comparație": "comparison",
    "La cerere": "On request",
    "Comparație": "Comparison",
    "Vezi opțiunile alăturat.": "Compare products side by side.",
    "Șterge comparația ×": "Clear comparison ×",
    "Specificație": "Specification",
    "Categorie": "Category",
    "Cod produs": "Product code",
    "Brand": "Brand",
    "Preț eMondo, fără TVA": "eMondo price, excl. VAT",
    "Mărimi / variante": "Sizes / options",
    "Standarde": "Standards",
    "Consultă pagina oficială": "See the official product page",
    "Prețurile afișate provin din ultima sincronizare a catalogului; consultă eMondo pentru informația curentă.": "Prices shown are from the latest catalog sync; visit eMondo for current information.",
    "Acasă": "Home",
    "Catalog produse": "Product catalog",
    "Echipamente de protecție": "Safety equipment",
    "Explorează produsele din cele 12 categorii MONDO. Prețurile sunt sincronizate din catalogul eMondo.": "Browse products across MONDO’s 12 categories. Prices are synchronized from the eMondo catalog.",
    "Produs sau caracteristică…": "Product or feature…",
    "Filtre +": "Filters +",
    "Filtre −": "Filters −",
    "Sortează": "Sort by",
    "Nume": "Name",
    "Preț crescător": "Price: low to high",
    "Preț descrescător": "Price: high to low",
    "Categorii": "Categories",
    "Toate categoriile": "All categories",
    "Prețurile fără TVA și descrierile au fost sincronizate": "Ex-VAT prices and descriptions were synchronized",
    "Verifică prețul curent, variantele și disponibilitatea pe pagina oficială a produsului.": "Check the current price, options and availability on the official product page.",
    "Catalog complet MONDO: caută și filtrează echipamente de protecție, compară produse și pregătește o listă pentru echipă.": "Full MONDO catalog: search and filter equipment, compare products and prepare a list for your team.",
    "Vezi": "View",
    "Culoare": "Colour",
    "Mărime / variantă": "Size / option",
    "Alege mărimea": "Choose a size",
    "Variantă, mărime sau culoare": "Option, size or colour",
    "Completează dacă este cazul": "Enter if applicable",
    "Cantitate": "Quantity",
    "Adaugă în lista echipei": "Add to your team list",
    "Prețul, disponibilitatea și variantele se pot actualiza.": "Price, availability and options may change.",
    "Verifică pe eMondo ↗": "Check on eMondo ↗",
    "Descriere și caracteristici": "Description and features",
    "Sursă produs:": "Product source:",
    "Produse asociate": "Related products",
    "Alte produse din această categorie.": "More products in this category.",
    "Înapoi la categorie ↗": "Back to category ↗",
    "Adaugă produse în listă.": "Add products to your list.",
    "Continuă în catalog ↗": "Continue browsing ↗",
    "Verifică prețul, disponibilitatea și variantele pe pagina fiecărui produs din eMondo.": "Check price, availability and options on each eMondo product page.",
    "Lista este goală": "Your list is empty",
    "Alege produse din catalog și completează cantitățile pentru echipa ta.": "Choose products from the catalog and enter quantities for your team.",
    "Deschide catalogul ↗": "Open the catalog ↗",
    "Cerere de ofertă": "Quote request",
    "Completează datele de contact și informațiile utile pentru ofertă.": "Enter your contact details and any information needed for a quote.",
    "Firmă / organizație": "Company / organization",
    "Numele companiei": "Company name",
    "Persoană de contact": "Contact person",
    "E-mail": "Email",
    "Telefon": "Phone",
    "Observații": "Notes",
    "Descrie activitatea, produsele sau alte detalii utile.": "Describe your work, products or other useful details.",
    "Pregătește cererea prin e-mail": "Prepare request by email",
    "La trimitere se deschide aplicația ta de e-mail cu cererea pregătită către MONDO. Acest site nu stochează datele formularului.": "Submitting opens your email app with the request addressed to MONDO. This site does not store form data.",
    "Politica de confidențialitate": "Privacy policy",
    "Contact & ofertare": "Contact and quotes",
    "Contact & comandă": "Contact and orders",
    "Spune-ne ce": "Tell us what",
    "echipare cauți.": "equipment you need.",
    "Adaugă produsele în lista de echipare sau contactează direct echipa MONDO.": "Add products to your equipment list or contact the MONDO team directly.",
    "Contactează MONDO ↗": "Contact MONDO ↗",
    "Pregătește o cerere de ofertă ↗": "Prepare a quote request ↗",
    "Instrument pentru achiziții B2B": "B2B purchasing tool",
    "Adaugă produse, cantități și detalii despre mărimea sau varianta solicitată.": "Add products, quantities and requested size or option details.",
    "articole selectate": "selected items",
    "Adaugă un produs în listă sau completează observațiile cu detaliile cererii.": "Add a product to your list or describe the request in the notes.",
    "Aplicația de e-mail este pregătită cu cererea. Verifică și trimite mesajul.": "Your email app is ready with the request. Review and send the message.",
    "404 · Pagina nu a fost găsită": "404 · Page not found",
    "Căutăm altă": "Looking for another",
    "direcție?": "direction?",
    "Produsul sau pagina solicitată nu este disponibilă.": "The product or page you requested could not be found.",
    "Mergi la catalog ↗": "Go to the catalog ↗",
    "Caută în catalog": "Search the catalog",
    "Închide căutarea": "Close search",
    "Închide fereastra": "Close window",
    "Produs, cod sau categorie": "Product, code or category",
    "Vezi rezultate ↗": "Show results ↗",
    "1 variantă": "1 option",
    "mărimi": "sizes",
    "culori": "colours",
    "Produsul a fost adăugat în lista echipei.": "Product added to your team list.",
    "Alege mărimea produsului.": "Choose a product size.",
    "Poți compara cel mult 3 produse odată.": "You can compare up to 3 products at a time.",
    "Produs adăugat la comparație.": "Product added to comparison.",
    "Produs scos din comparație.": "Product removed from comparison.",
    "Verificarea de securitate nu este disponibilă momentan.": "Security verification is temporarily unavailable.",
    "Nu am putut confirma trimiterea. Încearcă din nou sau contactează MONDO prin canalul oficial.": "We could not confirm the request. Please try again or contact MONDO through an official channel."
  };
  const EN_TO_RO = Object.fromEntries(Object.entries(EN_COPY).map(([ro, en]) => [en, ro]));
  const localized = value => language === "en" ? (EN_COPY[value] || value) : (EN_TO_RO[value] || value);
  const localizedColor = value => language === "en" ? ({ "Portocaliu fluorescent": "Fluorescent orange", "Portocaliu": "Orange", "Neon": "High-visibility yellow" }[value] || value) : ({ "Fluorescent orange": "Portocaliu fluorescent", "Orange": "Portocaliu", "High-visibility yellow": "Neon" }[value] || value);
  const localizedVariant = value => String(value || "").split(" · ").map(localizedColor).join(" · ");
  const categoryName = id => language === "en" ? ((window.MONDO_EN_CATEGORY_LABELS || {})[id] || products.find(p => p.category === id)?.categoryLabelEn || (window.MONDO_CATEGORIES || []).find(c => c.id === id)?.name || id || "Products") : ((window.MONDO_CATEGORIES || []).find(c => c.id === id)?.name || id || "Produse");
  const productText = (product, field) => language === "en" ? (product?.translations?.en?.[field] || (window.MONDO_EN_PRODUCTS || {})[product?.id]?.[field] || product?.[field] || "") : (product?.[field] || "");
  function applyLanguage(root = document.body) {
    document.documentElement.lang = language;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let value = localized(trimmed);
      if (language === "en") {
        value = value.replace(/^(\d+) \/ (\d+) produse$/, "$1 / $2 products")
          .replace(/^(\d+) articole selectate$/, "$1 selected items")
          .replace(/^(\d+) produse$/, "$1 products")
          .replace(/^(\d+) mărimi$/, "$1 sizes")
          .replace(/^(\d+) culori$/, "$1 colours");
      }
      if (value !== trimmed) node.nodeValue = raw.replace(trimmed, value);
    }
    const attributes = ["placeholder", "aria-label", "title", "alt"];
    for (const element of root.querySelectorAll?.("[placeholder], [aria-label], [title], [alt]") || []) {
      for (const attribute of attributes) if (element.hasAttribute(attribute)) element.setAttribute(attribute, localized(element.getAttribute(attribute)));
    }
    const switcher = $(".language-switch");
    if (switcher) { switcher.textContent = language === "ro" ? "EN" : "RO"; switcher.setAttribute("aria-label", language === "ro" ? "Schimbă limba în engleză" : "Switch language to Romanian"); switcher.title = language === "ro" ? "English" : "Română"; }
  }
  const money = value => value == null || value === "" || !Number.isFinite(Number(value)) ? localized("La cerere") : `${new Intl.NumberFormat(language === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: 2 }).format(Number(value))} ${language === "en" ? "RON" : "lei"}`;
  const formatPath = path => path.endsWith("/") ? path : `${path}/`;

  function showToast(message) {
    const node = $("#toast");
    if (!node) return;
    node.textContent = localized(message);
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
  }
  function kitLines() { return storage.read("mondo-kit-v1", []); }
  function compareIds() { return storage.read("mondo-compare-v1", []); }
  function updateKitCount() {
    const count = kitLines().reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const node = $("#kit-count");
    if (node) node.textContent = String(count);
  }
  function setMeta(title, description, indexable = false) {
    document.title = `${localized(title)} — MONDO ${language === "en" ? "Romania" : "România"}`;
    const desc = $("meta[name=description]");
    if (desc) desc.content = localized(description);
    const robots = $("meta[name=robots]");
    if (robots) robots.content = indexable && liveCatalog ? "index, follow" : "noindex, nofollow";
    let canonical = $("link[rel=canonical]");
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = `${location.origin}${location.pathname}`;
    document.documentElement.lang = language;
    const oldJson = $("#product-jsonld");
    if (oldJson) oldJson.remove();
  }
  function categoryCounts() {
    const counts = {};
    for (const p of products) for (const category of p.categories || [p.category]) counts[category] = (counts[category] || 0) + 1;
    return counts;
  }
  function footer() {
    return `<div class="footer-inner">
      <div class="footer-top">
        <div><a class="footer-brand" href="/"><span class="brand-mark" aria-hidden="true">M</span><span class="brand-name">MONDO<small>ROMÂNIA</small></span></a><p class="footer-intro">Echipamente pentru protecția muncii, protecția mediului și intervenții pentru pompieri.</p></div>
        <div class="footer-col"><h3>Explorează</h3><a href="/catalog/">Catalog complet</a><a href="/echipeaza/">Echipează-ți echipa</a><a href="/despre/">Despre MONDO</a><a href="https://emondo.ro/" target="_blank" rel="noopener noreferrer">Catalogul eMondo ↗</a></div>
        <div class="footer-col"><h3>Informații</h3><a href="https://emondo.ro/page/livrare" target="_blank" rel="noopener noreferrer">Livrare</a><a href="https://emondo.ro/page/politica-de-retur" target="_blank" rel="noopener noreferrer">Retur</a><a href="https://emondo.ro/page/termeni-si-conditii" target="_blank" rel="noopener noreferrer">Termeni și condiții</a><a href="https://emondo.ro/page/politica-de-confidentialitate" target="_blank" rel="noopener noreferrer">Confidențialitate</a><a href="https://emondo.ro/page/politica-cookies" target="_blank" rel="noopener noreferrer">Cookies</a></div>
      </div>
      <div class="footer-bottom"><span>MONDO România · Echipamente profesionale</span><span>${catalogMeta ? `${products.length.toLocaleString("ro-RO")} produse${catalogMeta.syncedAt ? ` · catalog sincronizat ${new Date(catalogMeta.syncedAt).toLocaleDateString("ro-RO")}` : ""}` : "Catalog eMondo"} · <a href="https://emondo.ro/" target="_blank" rel="noopener noreferrer">Sursa oficială ↗</a></span></div>
    </div>`;
  }
  function shell(html, title, description, indexable = false) {
    $("#main").innerHTML = `<div class="page-main">${html}</div>`;
    $("#site-footer").innerHTML = footer();
    setMeta(title, description, indexable);
    applyLanguage(document.body);
    updateKitCount();
    const nav = $(".desktop-nav");
    if (nav) {
      $$("a", nav).forEach(link => {
        const target = new URL(link.href, location.origin).pathname;
        if (target === location.pathname || (target === "/#activitati" && location.pathname === "/")) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }
  }
  function categoryRows() {
    const counts = categoryCounts();
    return (window.MONDO_CATEGORIES || []).map(c => `<a class="category-row" href="/catalog/?category=${encodeURIComponent(c.id)}"><span class="cat-number">${esc(c.eyebrow)}</span><strong>${esc(categoryName(c.id))}</strong><span class="cat-hint">${counts[c.id] || 0} ${language === "en" ? "products" : "produse"}</span><span class="arrow" aria-hidden="true">↗</span></a>`).join("");
  }
  function productCard(p) {
    const compared = compareIds().includes(p.id);
    const name = productText(p, "name");
    const compareLabel = compared ? `${localized("Scoate din")} ${localized("comparație")}` : `${localized("Adaugă la")} ${localized("comparație")}`;
    const sizes = p.sizes || [];
    const options = sizes.length ? (sizes.length === 1 ? (language === "en" ? "1 option" : "1 variantă") : `${sizes.length} ${language === "en" ? "sizes" : "mărimi"}`) : (p.colors || []).length ? `${p.colors.length} ${language === "en" ? "colours" : "culori"}` : localized("Detalii");
    return `<article class="product-card">
      <a class="product-image" href="/produs/${encodeURIComponent(p.slug)}/" aria-label="${esc(localized("Vezi"))} ${esc(name)}">
        <span class="catalog-label">EMONDO · ${esc(categoryName(p.category))}</span>
        <img src="${esc(p.image || "")}" alt="${esc(language === "en" ? name : p.imageAlt || name)}" loading="lazy" onerror="this.closest('.product-image').classList.add('image-missing');this.remove()">
      </a>
      <div class="product-content">
        <div class="product-category">${esc(categoryName(p.category))}${p.brand ? ` <span>·</span> ${esc(p.brand)}` : ""}</div>
        <h3 class="product-title"><a href="/produs/${encodeURIComponent(p.slug)}/">${esc(name)}</a></h3>
        <div class="product-subtitle">${esc(productText(p, "subtitle") || p.code || "")}</div>
      <div class="product-bottom"><div class="price">${money(p.price)}<small>${localized("preț eMondo · fără TVA")}</small></div>
          <div class="card-actions"><button class="circle-action" type="button" data-action="compare" data-id="${esc(p.id)}" aria-label="${esc(compareLabel)}" aria-pressed="${compared}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v15H5zM9 5V3h6v2M8 10h8M8 14h8"></path></svg></button><button class="button small" type="button" data-action="quick-add" data-id="${esc(p.id)}">${localized("În echipă")} <span aria-hidden="true">+</span></button></div>
        </div>
        <div class="product-code"><span>${p.code ? `${localized("Cod:")} ${esc(p.code)}` : "Catalog eMondo"}</span><span>${esc(options)}</span></div>
      </div>
    </article>`;
  }
  function renderProductsGrid(items) {
    if (!items.length) return `<div class="empty-state"><div class="micro">Catalog MONDO</div><h3>Nu am găsit produse în această selecție.</h3><p>Schimbă categoria sau termenul de căutare pentru a vedea alte produse.</p><a class="button secondary small" href="/catalog/">Vezi toate produsele ↗</a></div>`;
    return `<div class="product-grid">${items.map(productCard).join("")}</div>`;
  }
  function renderPagination(page, totalPages) {
    if (totalPages < 2) return "";
    const urlFor = value => {
      const params = new URLSearchParams(location.search);
      params.set("page", String(value));
      return `/catalog/?${params.toString()}`;
    };
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index).map(value => `<a href="${urlFor(value)}" ${value === page ? 'aria-current="page"' : ""}>${value}</a>`).join("");
    return `<nav class="catalog-pagination" aria-label="Pagini catalog"><a href="${urlFor(Math.max(1, page - 1))}" aria-label="Pagina anterioară" ${page === 1 ? 'aria-disabled="true" tabindex="-1"' : ""}>‹</a>${numbers}<a href="${urlFor(Math.min(totalPages, page + 1))}" aria-label="Pagina următoare" ${page === totalPages ? 'aria-disabled="true" tabindex="-1"' : ""}>›</a></nav>`;
  }
  function renderHome() {
    const featured = products.slice(0, 3);
    const leadProduct = products.find(p => p.image) || products[0];
    const activities = (window.MONDO_ACTIVITIES || []).map((a, i) => `<a class="activity-option" href="/catalog/?category=${encodeURIComponent(a.category)}"><span class="micro">0${i + 1}</span><strong>${esc(language === "en" ? (window.MONDO_EN_ACTIVITIES || [])[i] || a.title : a.title)}</strong><span aria-hidden="true">↗</span></a>`).join("");
    shell(`<section class="hero"><div class="container hero-grid">
      <div class="hero-copy"><div class="eyebrow">MONDO Romania · Echipamente profesionale</div><h1 class="display">Echipare clară.<br><em>Decizii informate.</em></h1><p class="lead">Echipamente pentru protecția muncii, protecția mediului și intervenții PSI. Caută în catalog sau pregătește o listă pentru echipa ta.</p>
        <form class="hero-tools" id="hero-search"><label class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><input name="q" type="search" placeholder="Caută după produs, cod sau categorie" aria-label="Caută în catalog"></label><button class="button" type="submit">Caută produse <span aria-hidden="true">↗</span></button></form>
        <div class="hero-caption"><span>protecția muncii</span><span>mediu</span><span>PSI & intervenție</span></div>
      </div>
        <div class="hero-visual"><span class="visual-index">01 / ECHIPARE</span><span class="vertical-mark">MONDO INDUSTRY · RO</span><img src="${esc(leadProduct?.image || "")}" alt="${esc(language === "en" ? productText(leadProduct, "name") : leadProduct?.imageAlt || "Echipament de protecție din catalogul MONDO")}" fetchpriority="high" onerror="this.remove()"><span class="hero-card-note">CATALOG MONDO</span></div>
    </div></section>
    <div class="container"><div class="domain-line"><div class="domain-cell"><span>01</span> Protecția muncii</div><div class="domain-cell"><span>02</span> Protecția mediului</div><div class="domain-cell"><span>03</span> PSI & intervenție</div></div></div>
    <section class="section" id="categorii"><div class="container"><div class="section-head"><div><div class="eyebrow">Navigare după echipament</div><h2>Găsește categoria<br>potrivită pentru tine.</h2></div><p>Catalog complet cu echipamente pentru protecția muncii, mediu, semnalizare, igienă și intervenție.</p></div><div class="category-list">${categoryRows()}</div></div></section>
    <section class="activity-section" id="activitati"><div class="container activity-grid"><div><div class="eyebrow">Un punct de pornire</div><h2>Ce activitate<br>desfășori?</h2><p>Alege o zonă pentru a explora categoriile și produsele asociate. Selectarea te ajută să navighezi în catalog.</p></div><div class="activity-options">${activities}</div></div></section>
    <section class="section"><div class="container"><div class="section-head"><div><div class="eyebrow">Catalogul MONDO</div><h2>Produse pentru fiecare echipă.</h2></div><a class="text-link" href="/catalog/">Vezi catalogul <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"></path></svg></a></div>${renderProductsGrid(featured)}<p class="catalog-source-note">Prețurile sunt preluate din catalogul eMondo și se pot actualiza acolo. Consultă pagina produsului pentru informații comerciale curente.</p></div></section>
    <section class="container"><div class="feature-band"><div class="feature-image"><span class="corner-label">MONDO / ECHIPARE DE ECHIPĂ</span><img src="${esc(products.find(p => p.category === "imbracaminte")?.image || leadProduct?.image || "")}" alt="Echipament vestimentar din catalogul MONDO" loading="lazy" onerror="this.remove()"><span class="feature-number">02 — LISTĂ B2B</span></div><div class="feature-copy"><div class="eyebrow">Pentru firme și organizații</div><h2>Echipează-ți echipa.</h2><p>Adaugă articole, cantități și detalii despre variante, apoi pregătește o cerere către echipa MONDO.</p><a class="button" href="/echipeaza/">Construiește lista <span aria-hidden="true">↗</span></a></div></div></section>
    <section class="section"><div class="container about-preview"><div><div class="eyebrow">Despre companie</div><h2>MONDO<br>Romania.</h2></div><div><p>MONDO Romania produce și importă echipamente pentru sănătate și securitate în muncă, protecția mediului și intervenții pentru pompieri.</p><p><a class="text-link" href="/despre/">Despre MONDO <span aria-hidden="true">↗</span></a></p></div></div></section>
    <section class="kit-cta"><div class="container kit-cta-inner"><div><div class="eyebrow">Echipare pentru achiziții</div><h2>Începe cu produsele.<br>Trimite o cerere clară.</h2><p>Lista păstrează produsele și cantitățile alese și pregătește un e-mail către echipa MONDO.</p></div><a class="button" href="/echipeaza/">Deschide lista de echipare ↗</a></div></section>`, "Echipamente profesionale de protecție", "Echipamente pentru protecția muncii, protecția mediului și PSI. Explorează categoriile MONDO și pregătește lista de echipare pentru echipă.", true);
  }
  function comparisonHtml() {
    const chosen = compareIds().map(id => products.find(p => p.id === id)).filter(Boolean);
    if (!chosen.length) return "";
    const rows = [
      ["Categorie", p => categoryName(p.category)], ["Cod produs", p => p.code || "—"], ["Brand", p => p.brand || "—"],
      ["Preț eMondo, fără TVA", p => money(p.price)], ["Mărimi / variante", p => (p.sizes || []).join(", ") || "Consultă pagina oficială"],
      ["Culori", p => (p.colors || []).map(localizedColor).join(", ") || "Consultă pagina oficială"], ["Standarde", p => (p.standards || []).join(", ") || "Consultă pagina oficială"]
    ];
    return `<div class="comparison-wrap" id="comparatie"><div class="section-head"><div><div class="eyebrow">${localized("Comparație")}</div><h2>${localized("Vezi opțiunile alăturat.")}</h2></div><button class="text-link" type="button" data-action="clear-compare">${localized("Șterge comparația ×")}</button></div><div class="comparison-table-wrap"><table class="comparison-table"><thead><tr><th scope="col">${localized("Specificație")}</th>${chosen.map(p => `<th scope="col">${esc(productText(p, "name"))}<button type="button" data-action="compare" data-id="${esc(p.id)}" aria-label="${esc(`${localized("Scoate din")} ${productText(p, "name")} ${localized("comparație")}`)}">×</button></th>`).join("")}</tr></thead><tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${localized(label)}</th>${chosen.map(p => `<td>${esc(fn(p))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small-note">Prețurile afișate provin din ultima sincronizare a catalogului; consultă eMondo pentru informația curentă.</p></div>`;
  }
  function renderCatalog() {
    const params = new URLSearchParams(location.search);
    const categoryAliases = { semnalizare: "semnalizare-si-delimitare", "protectia-ochilor": "protectia-ochilor-si-a-fetei", "protectia-auzului": "protectie-auditiva", "lucru-la-inaltime": "lucrul-la-inaltime", "psi-interventie": "echipamente-tehnice" };
    activeCategory = categoryAliases[params.get("category")] || params.get("category") || "";
    activeTerm = params.get("q") || "";
    let items = products.filter(p => (!activeCategory || (p.categories || [p.category]).includes(activeCategory)) && (!activeTerm || normalizeSearchText(`${productText(p, "name")} ${p.name} ${p.code} ${p.brand} ${productText(p, "summary")} ${categoryName(p.category)}`).includes(normalizeSearchText(activeTerm))));
    const sort = params.get("sort") || "name";
    if (sort === "price-asc") items.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") items.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name") items.sort((a, b) => productText(a, "name").localeCompare(productText(b, "name"), language === "en" ? "en" : "ro"));
    const pageSize = 24;
    const totalPages = Math.ceil(items.length / pageSize);
    const page = Math.min(totalPages || 1, Math.max(1, Number(params.get("page")) || 1));
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
    const counts = categoryCounts();
    const filterRows = `<a class="filter-category ${activeCategory ? "" : "active"}" href="/catalog/">${localized("Toate categoriile")} <small>${products.length}</small></a>` + (window.MONDO_CATEGORIES || []).map(c => `<a class="filter-category ${activeCategory === c.id ? "active" : ""}" href="/catalog/?category=${encodeURIComponent(c.id)}">${esc(categoryName(c.id))} <small>${counts[c.id] || 0}</small></a>`).join("");
    shell(`<div class="container"><section class="page-intro"><div class="crumbs"><a href="/">Acasă</a><span>/</span><span>Catalog</span></div><div class="catalog-top"><div><div class="eyebrow">Catalog produse</div><h1>${activeCategory ? esc(categoryName(activeCategory)) : "Echipamente de protecție"}</h1><p>Explorează produsele din cele 12 categorii MONDO. Prețurile sunt sincronizate din catalogul eMondo.</p></div><span class="catalog-count">${items.length} / ${products.length} produse</span></div></section>
      <div class="catalog-toolbar"><label class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><input id="catalog-search" type="search" value="${esc(activeTerm)}" placeholder="Produs sau caracteristică…" aria-label="Caută în catalog"></label><button class="filter-toggle" type="button" aria-expanded="false">Filtre +</button><label class="micro" for="catalog-sort">Sortează</label><select id="catalog-sort" class="select-control" aria-label="Sortează produsele"><option value="name" ${sort === "name" ? "selected" : ""}>Nume</option><option value="price-asc" ${sort === "price-asc" ? "selected" : ""}>Preț crescător</option><option value="price-desc" ${sort === "price-desc" ? "selected" : ""}>Preț descrescător</option></select></div>
      <div class="catalog-layout"><aside class="filter-panel" aria-label="Filtre pe categorii"><div class="filter-title">Categorii</div>${filterRows}</aside><section class="catalog-results" aria-label="Produse">${renderProductsGrid(pageItems)}${renderPagination(page, totalPages)}${comparisonHtml()}</section></div>
      <p class="catalog-source-note">Prețurile fără TVA și descrierile au fost sincronizate ${catalogMeta?.syncedAt ? `la ${new Date(catalogMeta.syncedAt).toLocaleString("ro-RO")}` : "din eMondo"}. Verifică prețul curent, variantele și disponibilitatea pe pagina oficială a produsului.</p></div>`, "Catalog de produse", "Catalog complet MONDO: caută și filtrează echipamente de protecție, compară produse și pregătește o listă pentru echipă.", true);
    const search = $("#catalog-search");
    search?.addEventListener("input", () => {
      const next = new URL(location.href); next.searchParams.set("q", search.value); next.searchParams.set("page", "1"); if (!search.value) next.searchParams.delete("q");
      history.replaceState({}, "", `${next.pathname}${next.search}`);
      const filtered = products.filter(p => (!activeCategory || (p.categories || [p.category]).includes(activeCategory)) && (!search.value || normalizeSearchText(`${productText(p, "name")} ${p.name} ${p.code} ${p.brand} ${productText(p, "summary")} ${categoryName(p.category)}`).includes(normalizeSearchText(search.value))));
      const count = $(".catalog-count"); if (count) count.textContent = `${filtered.length} / ${products.length} ${language === "en" ? "products" : "produse"}`;
      const filteredPages = Math.ceil(filtered.length / pageSize);
      const result = $(".catalog-results"); if (result) { result.innerHTML = `${renderProductsGrid(filtered.slice(0, pageSize))}${renderPagination(1, filteredPages)}${comparisonHtml()}`; applyLanguage(result); }
      activeTerm = search.value;
    });
    $("#catalog-sort")?.addEventListener("change", e => { const next = new URL(location.href); next.searchParams.set("sort", e.target.value); routeTo(`${next.pathname}${next.search}`); });
    $(".filter-toggle")?.addEventListener("click", e => { const panel = $(".filter-panel"); const open = panel.classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", String(open)); e.currentTarget.textContent = localized(open ? "Filtre −" : "Filtre +"); });
  }
  function variantField(p, selected = {}) {
    let html = "";
    if ((p.colors || []).length) html += `<div class="variant-field"><label for="variant-color">${localized("Culoare")}</label><select id="variant-color" ${p.colors.length > 1 ? "required" : ""}>${p.colors.map((c, i) => `<option value="${esc(c)}" ${selected.color === c || (!selected.color && i === 0) ? "selected" : ""}>${esc(localizedColor(c))}</option>`).join("")}</select></div>`;
    if ((p.sizes || []).length) html += `<div class="variant-field"><label for="variant-size">${localized("Mărime / variantă")}</label><select id="variant-size" required><option value="">${localized("Alege mărimea")}</option>${p.sizes.map(s => `<option value="${esc(s)}" ${selected.size === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
    if (!(p.colors || []).length && !(p.sizes || []).length) html += `<div class="variant-field"><label for="variant-request">${localized("Variantă, mărime sau culoare")}</label><input id="variant-request" type="text" maxlength="160" placeholder="${localized("Completează dacă este cazul")}"></div>`;
    return html;
  }
  function renderProduct(p) {
    if (!p) { renderNotFound(); return; }
    const displayName = productText(p, "name");
    shell(`<section class="product-page"><div class="container"><div class="crumbs"><a href="/">Acasă</a><span>/</span><a href="/catalog/?category=${encodeURIComponent(p.category)}">${esc(categoryName(p.category))}</a><span>/</span><span>${esc(displayName)}</span></div>
      <div class="product-detail-grid"><div class="product-detail-image"><span class="catalog-label">EMONDO · ${esc(categoryName(p.category))}</span><img src="${esc(p.image || "")}" alt="${esc(language === "en" ? displayName : p.imageAlt || displayName)}" onerror="this.remove()"><span class="photo-label">IMAGINE DIN CATALOGUL EMONDO</span></div><div class="product-meta"><div class="eyebrow">${esc(categoryName(p.category))}</div><h1 class="product-title">${esc(displayName)}</h1><div class="product-subtitle">${esc(productText(p, "subtitle"))}</div><div class="product-price-large">${money(p.price)}<small>Preț fără TVA · eMondo${catalogMeta?.syncedAt ? ` · ${new Date(catalogMeta.syncedAt).toLocaleDateString("ro-RO")}` : ""}</small></div><p class="small-note">Prețul, disponibilitatea și variantele se pot actualiza. <a class="text-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">Verifică pe eMondo ↗</a></p>
        <div class="product-controls">${variantField(p)}<div class="quantity-row"><label for="product-quantity">Cantitate</label><input id="product-quantity" type="number" min="1" max="999" value="1" inputmode="numeric"></div><button class="button" data-action="product-add" data-id="${esc(p.id)}" type="button">Adaugă în lista echipei <span aria-hidden="true">↗</span></button></div>
        <div class="details-block"><h3>Descriere și caracteristici</h3><div class="product-description">${esc(productText(p, "summary") || productText(p, "subtitle") || "")}</div><div class="product-source">${localized("Sursă produs:")} <a class="text-link" href="${esc(p.sourceUrl || "https://emondo.ro/")}" target="_blank" rel="noopener noreferrer">Vezi pagina oficială eMondo ↗</a></div></div>
      </div></div><section class="section"><div class="section-head"><div><div class="eyebrow">Produse asociate</div><h2>Alte produse din această categorie.</h2></div><a class="text-link" href="/catalog/?category=${encodeURIComponent(p.category)}">Înapoi la categorie ↗</a></div>${renderProductsGrid(products.filter(other => other.id !== p.id && (other.categories || [other.category]).some(category => (p.categories || [p.category]).includes(category))).slice(0, 3))}</section></div></section>`, displayName, productText(p, "summary") || "Detalii produs din catalogul oficial MONDO eMondo.", true);
    if (liveCatalog && p.name && p.price != null && p.code && p.image) {
      const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.code, image: p.image, brand: { "@type": "Brand", name: p.brand || "MONDO" }, offers: { "@type": "Offer", priceCurrency: p.currency || "RON", price: Number(p.price), url: location.href } };
      const script = document.createElement("script"); script.id = "product-jsonld"; script.type = "application/ld+json"; script.textContent = JSON.stringify(ld); document.head.appendChild(script);
    }
  }
  function lineTitle(line) {
    const p = products.find(product => product.id === line.productId);
    return { p, title: productText(p, "name") || line.productName || (language === "en" ? "Product from a previous list" : "Produs din lista anterioară") };
  }
  function renderTeam(formHeading = "Cere o ofertă") {
    const lines = kitLines();
    const rows = lines.map((line, index) => {
      const { p, title } = lineTitle(line);
      return `<div class="team-line"><a class="team-thumb" href="${p ? `/produs/${encodeURIComponent(p.slug)}/` : "/catalog/"}" aria-label="${localized("Vezi")} ${esc(title)}">${p?.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}</a><div class="team-product">${esc(title)}<small>${localized("Cod:")} ${esc(p?.code || line.code || "—")}</small><span class="team-variant">${esc(line.variant ? localizedVariant(line.variant) : localized("Varianta selectată"))}</span></div><label class="micro" for="line-qty-${index}">${localized("Cantitate")}</label><input id="line-qty-${index}" data-action="quantity" data-index="${index}" type="number" min="1" max="999" value="${Number(line.quantity || 1)}" aria-label="${localized("Cantitate pentru")} ${esc(title)}" inputmode="numeric"><button class="remove-line" type="button" data-action="remove-line" data-index="${index}" aria-label="${localized("Elimină")} ${esc(title)} ${localized("din listă")}">×</button></div>`;
    }).join("");
    const quoteBackendReady = Boolean(config.quoteEnabled === true && config.supabaseUrl && config.supabasePublishableKey && config.turnstileSiteKey);
    const modeText = quoteBackendReady
      ? "Cererea se salvează în sistemul MONDO și se transmite către echipa de vânzări."
      : "La trimitere se deschide aplicația ta de e-mail cu cererea pregătită către MONDO. Acest site nu stochează datele formularului.";
    shell(`<section class="team-page"><div class="container"><div class="crumbs"><a href="/">Acasă</a><span>/</span><span>Echipează-ți echipa</span></div><div class="page-intro"><div class="eyebrow">Instrument pentru achiziții B2B</div><h1>Echipează-ți echipa.</h1><p>Adaugă produse, cantități și detalii despre mărimea sau varianta solicitată.</p></div><div class="team-layout"><section><div class="section-head"><div><div class="eyebrow">Lista ta</div><h2>${lines.length ? `${lines.length} ${language === "en" ? (lines.length === 1 ? "selected item" : "selected items") : "articole selectate"}` : "Adaugă produse în listă."}</h2></div><a class="text-link" href="/catalog/">Continuă în catalog ↗</a></div>${lines.length ? `<div class="team-list">${rows}</div><p class="small-note">Verifică prețul, disponibilitatea și variantele pe pagina fiecărui produs din eMondo.</p>` : `<div class="team-empty"><div class="micro">Lista este goală</div><p>Alege produse din catalog și completează cantitățile pentru echipa ta.</p><a class="button secondary small" href="/catalog/">Deschide catalogul ↗</a></div>`}</section>
      <form class="team-form" id="quote-form"><div class="micro">Cerere de ofertă</div><h2>${esc(formHeading)}</h2><p>Completează datele de contact și informațiile utile pentru ofertă.</p><div class="form-field"><label for="quote-company">Firmă / organizație</label><input id="quote-company" name="company" autocomplete="organization" placeholder="Numele companiei"></div><div class="form-field"><label for="quote-name">Persoană de contact <span aria-hidden="true">*</span></label><input id="quote-name" name="contact" autocomplete="name" required maxlength="120"></div><div class="form-field"><label for="quote-email">E-mail <span aria-hidden="true">*</span></label><input id="quote-email" name="email" type="email" autocomplete="email" required maxlength="254"></div><div class="form-field"><label for="quote-phone">Telefon</label><input id="quote-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div><div class="form-field"><label for="quote-notes">Observații</label><textarea id="quote-notes" name="observations" maxlength="2500" placeholder="Descrie activitatea, produsele sau alte detalii utile."></textarea></div>${quoteBackendReady ? `<div id="turnstile-widget" class="turnstile-widget" aria-label="Verificare anti-spam"></div>` : ""}<div class="request-status" id="request-status" role="status" aria-live="polite"></div><button class="button" type="submit">${quoteBackendReady ? "Trimite cererea" : "Pregătește cererea prin e-mail"} <span aria-hidden="true">↗</span></button><p class="small-note" style="margin:12px 0 0">${esc(modeText)} <a href="https://emondo.ro/page/politica-de-confidentialitate" target="_blank" rel="noopener noreferrer">Politica de confidențialitate</a>.</p></form></div></div></section>`, "Echipează-ți echipa", "Creează o listă de produse, adaugă cantități și pregătește o cerere de ofertă MONDO.", false);
    if (quoteBackendReady) mountTurnstile();
    $$("[data-action=quantity]").forEach(input => input.addEventListener("change", e => {
      const list = kitLines(); const index = Number(e.currentTarget.dataset.index); const qty = Math.max(1, Math.min(999, Number(e.currentTarget.value) || 1));
      e.currentTarget.value = String(qty); if (list[index]) list[index].quantity = qty; storage.write("mondo-kit-v1", list); updateKitCount();
    }));
    const quoteForm = $("#quote-form");
    quoteForm?.addEventListener("submit", handleQuoteSubmit);
  }
  function renderAbout() {
    shell(`<section class="about-page"><div class="container"><div class="crumbs"><a href="/">Acasă</a><span>/</span><span>Despre MONDO</span></div><div class="about-hero"><div><div class="eyebrow">Despre companie</div><h1 class="display">MONDO<br><em>Romania.</em></h1><p class="lead">MONDO Romania este producător și importator de echipamente pentru sănătate și securitate în muncă, protecția mediului și intervenții pentru pompieri.</p><p>Explorează cele 12 categorii de echipamente și consultă pagina eMondo pentru prețuri, variante și informații comerciale actuale.</p><a class="button secondary" href="https://www.mondo-romania.ro/" target="_blank" rel="noopener noreferrer">Despre MONDO Romania ↗</a></div><div class="about-visual"><span class="micro">MONDO INDUSTRY · RO</span><strong>Echipamente specializate pentru siguranță.</strong><span class="micro">PROTECȚIA MUNCII / MEDIU / PSI</span></div></div><div class="about-preview"><div><div class="eyebrow">Gama de produse</div><h2>Siguranță<br>pentru fiecare echipă.</h2></div><div><p>Catalogul reunește echipamente profesionale pentru protecția muncii, protecția mediului, semnalizare, curățenie și igienă, echipamente tehnice și activități de intervenție.</p><a class="text-link" href="/catalog/">Deschide catalogul complet ↗</a></div></div></div></section>`, "Despre MONDO", "MONDO Romania produce și importă echipamente pentru protecția muncii, mediu și intervenții PSI.", true);
  }
  function renderContact() {
    const copy = `<section class="info-page"><div class="container"><div class="crumbs"><a href="/">Acasă</a><span>/</span><span>Contact & ofertare</span></div><div class="eyebrow">Contact & comandă</div><h1 class="display">Spune-ne ce<br><em>echipare cauți.</em></h1><p class="lead">Adaugă produsele în lista de echipare sau contactează direct echipa MONDO.</p><div class="info-panel"><h2>MONDO Romania</h2><p><a href="tel:+40333401751">0333 401 751</a></p><p><a href="mailto:comenzi@mondo-romania.ro">comenzi@mondo-romania.ro</a></p><p>Piatra Neamț, Strada Fermelor nr. 23</p><p style="margin-top:15px"><a class="button secondary small" href="https://emondo.ro/contact" target="_blank" rel="noopener noreferrer">Contactează MONDO ↗</a></p></div><div style="margin-top:32px"><a class="button" href="/echipeaza/">Pregătește o cerere de ofertă ↗</a></div></div></section>`;
    shell(copy, "Contact & ofertare", "Contactează MONDO Romania pentru informații despre produse și oferte.", true);
  }
  function renderInfoPage(slug) {
    const pages = {
      livrare: ["Livrare", "Consultă condițiile oficiale de livrare MONDO.", "https://emondo.ro/page/livrare"],
      retur: ["Retururi", "Consultă politica oficială de retur și procedura de schimb.", "https://emondo.ro/page/politica-de-retur"],
      garantie: ["Garanție", "Consultă termenii și condițiile oficiale MONDO.", "https://emondo.ro/page/termeni-si-conditii"],
      reclamatii: ["Reclamații", "Contactează echipa MONDO pentru sesizări și reclamații.", "https://emondo.ro/contact"],
      confidentialitate: ["Confidențialitate", "Consultă politica oficială de confidențialitate.", "https://emondo.ro/page/politica-de-confidentialitate"],
      cookies: ["Cookies", "Consultă politica oficială privind fișierele cookie.", "https://emondo.ro/page/politica-cookies"],
      plata: ["Metode de plată", "Consultă metodele de plată disponibile pe eMondo.", "https://emondo.ro/page/modalitati-de-plata"]
    };
    const [title, description, sourceUrl] = pages[slug] || ["Informații", "Consultă informațiile oficiale MONDO.", "https://emondo.ro/page/termeni-si-conditii"];
    shell(`<section class="info-page"><div class="container"><div class="crumbs"><a href="/">Acasă</a><span>/</span><span>${esc(title)}</span></div><div class="eyebrow">Informații pentru cumpărători</div><h1 class="display">${esc(title)}.</h1><div class="info-panel"><h2>Informații oficiale MONDO</h2><p>${esc(description)}</p><p style="margin-top:20px"><a class="button" href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Deschide pagina oficială ↗</a></p></div><p style="margin-top:24px"><a class="text-link" href="/contact/">Contact MONDO ↗</a></p></div></section>`, title, description, false);
  }
  function renderNotFound() {
    shell(`<section class="info-page"><div class="container"><div class="eyebrow">404 · Pagina nu a fost găsită</div><h1 class="display">Căutăm altă<br><em>direcție?</em></h1><p class="lead">Produsul sau pagina solicitată nu este disponibilă.</p><p style="margin-top:24px"><a class="button" href="/catalog/">Mergi la catalog ↗</a></p></div></section>`, "Pagina nu a fost găsită", "Pagina solicitată nu a fost găsită.", false);
  }

  function routeTo(path) {
    history.pushState({}, "", path);
    closeMobileNav();
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderRoute();
  }
  function renderRoute() {
    const pathname = formatPath(decodeURI(location.pathname));
    if (pathname === "/") return renderHome();
    if (pathname === "/catalog/") return renderCatalog();
    if (pathname === "/echipeaza/") return renderTeam();
    if (pathname === "/despre/") return renderAbout();
    if (pathname === "/contact/") return renderContact();
    if (pathname === "/admin/") return;
    if (pathname.startsWith("/produs/")) {
      const slug = pathname.split("/").filter(Boolean)[1];
      return renderProduct(products.find(p => p.slug === slug));
    }
    if (pathname.startsWith("/informatii/")) return renderInfoPage(pathname.split("/").filter(Boolean)[1]);
    renderNotFound();
  }
  function closeMobileNav() {
    $(".desktop-nav")?.classList.remove("mobile-open");
    $(".menu-toggle")?.setAttribute("aria-expanded", "false");
  }
  function openSearch(initial = "") {
    const root = $("#modal-root");
    root.innerHTML = `<div class="search-drawer open" role="presentation"><div class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="search-heading"><div class="search-dialog-head"><h2 id="search-heading">Caută în catalog</h2><button type="button" class="close-button" data-action="close-search" aria-label="Închide căutarea">×</button></div><form id="global-search"><label class="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg><input name="q" type="search" value="${esc(initial)}" placeholder="Produs, cod sau categorie" aria-label="Caută în catalog"></label><button class="button" type="submit" style="margin-top:12px;width:100%">Vezi rezultate ↗</button></form></div></div>`;
    applyLanguage(root);
    $(".search-drawer input")?.focus();
  }
  function quickAdd(id) {
    const p = products.find(item => item.id === id); if (!p) return;
    const root = $("#modal-root");
    root.innerHTML = `<div class="search-drawer open" data-action="backdrop-close"><div class="search-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-heading"><div class="search-dialog-head"><div><div class="micro">Adaugă în lista echipei</div><h2 id="quick-heading">${esc(productText(p, "name"))}</h2></div><button type="button" class="close-button" data-action="close-search" aria-label="Închide fereastra">×</button></div><form id="quick-add-form" data-id="${esc(p.id)}">${variantField(p)}<div class="quantity-row"><label for="quick-quantity">Cantitate</label><input id="quick-quantity" type="number" min="1" max="999" value="1" required></div><button class="button" type="submit">Adaugă în lista echipei ↗</button></form></div></div>`;
    applyLanguage(root);
    $(".search-drawer input, .search-drawer select")?.focus();
  }
  function addToKit(p, color, size, quantity, requestedVariant = "") {
    const choice = [color, size, requestedVariant].filter(Boolean).join(" · ") || "De verificat cu MONDO";
    const key = `${p.id}|${choice}`;
    const lines = kitLines();
    const existing = lines.find(line => line.key === key);
    if (existing) existing.quantity = Math.min(999, Number(existing.quantity || 0) + Number(quantity || 1));
    else lines.push({ key, productId: p.id, productName: p.name, code: p.code, variant: choice, quantity: Math.max(1, Math.min(999, Number(quantity || 1))) });
    storage.write("mondo-kit-v1", lines); updateKitCount();
    $("#modal-root").innerHTML = "";
    showToast("Produsul a fost adăugat în lista echipei.");
  }
  function toggleCompare(id) {
    let ids = compareIds();
    if (ids.includes(id)) ids = ids.filter(value => value !== id);
    else if (ids.length >= 3) { showToast("Poți compara cel mult 3 produse odată."); return; }
    else ids.push(id);
    storage.write("mondo-compare-v1", ids);
    if (location.pathname.startsWith("/catalog")) renderCatalog();
    else showToast(ids.includes(id) ? "Produs adăugat la comparație." : "Produs scos din comparație.");
  }
  function mountTurnstile() {
    const render = () => {
      const container = $("#turnstile-widget");
      if (!container || !window.turnstile || !config.turnstileSiteKey || container.dataset.widget) return;
      try {
        turnstileWidgetId = window.turnstile.render(container, { sitekey: config.turnstileSiteKey, theme: "light" });
        container.dataset.widget = "mounted";
      } catch (error) { console.error("MONDO Turnstile:", error); }
    };
    if (window.turnstile) { render(); return; }
    if (!document.querySelector('script[data-mondo-turnstile="true"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true; script.defer = true; script.dataset.mondoTurnstile = "true";
      script.addEventListener("load", render, { once: true });
      script.addEventListener("error", () => showQuoteStatus("Verificarea anti-spam nu s-a încărcat. Reîncarcă pagina și încearcă din nou."), { once: true });
      document.head.append(script);
    }
  }
  function showQuoteStatus(message, ok = false) {
    const node = $("#request-status"); if (!node) return;
    node.textContent = message; node.classList.add("visible");
    node.style.color = ok ? "#18382e" : "#765023";
  }
  async function handleQuoteSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const notes = String(data.get("observations") || "").trim();
    const items = kitLines().map(line => {
      const product = products.find(item => item.id === line.productId);
      const name = productText(product, "name") || line.productName;
      return `• ${name}${line.variant ? ` — ${line.variant}` : ""} — ${Number(line.quantity || 1)} buc.`;
    });
    if (!items.length && notes.length < 5) { showQuoteStatus(localized("Adaugă un produs în listă sau completează observațiile cu detaliile cererii.")); return; }
    if (config.quoteEnabled === true && config.supabaseUrl && config.supabasePublishableKey && config.turnstileSiteKey) {
      const token = turnstileWidgetId != null && window.turnstile ? window.turnstile.getResponse(turnstileWidgetId) : "";
      if (!token) { showQuoteStatus("Completează verificarea anti-spam înainte de trimitere."); return; }
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        const payload = {
          company: String(data.get("company") || "").trim(),
          contact: String(data.get("contact") || "").trim(),
          email: String(data.get("email") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          observations: notes,
          turnstileToken: token,
          website: "",
          items: kitLines().map(line => ({
            productId: String(products.find(item => item.id === line.productId)?.id || line.productId),
            variant: line.variant || "",
            quantity: Number(line.quantity || 1)
          }))
        };
        const endpoint = config.quoteEndpoint || `${String(config.supabaseUrl).replace(/\/$/, "")}/functions/v1/submit-quote`;
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || "Cererea nu s-a putut înregistra.");
        storage.write("mondo-kit-v1", []); updateKitCount();
        renderTeam();
        if (result.email_status === "failed") showQuoteStatus(`Cererea ${result.reference || ""} a fost salvată, dar e-mailul nu a fost confirmat. Echipa MONDO trebuie să verifice panoul.`, false);
        else showQuoteStatus(`Cererea a fost salvată și trimisă echipei MONDO. Număr de referință: ${result.reference || "confirmat"}.`, true);
      } catch (error) {
        showQuoteStatus(error.message || "Cererea nu s-a putut trimite.");
        if (window.turnstile && turnstileWidgetId != null) window.turnstile.reset(turnstileWidgetId);
        if (submitButton?.isConnected) submitButton.disabled = false;
      }
      return;
    }
    const subject = `Cerere ofertă MONDO${data.get("company") ? ` · ${String(data.get("company")).trim()}` : ""}`;
    const body = [
      `Firmă / organizație: ${String(data.get("company") || "").trim() || "—"}`,
      `Persoană de contact: ${String(data.get("contact") || "").trim()}`,
      `E-mail: ${String(data.get("email") || "").trim()}`,
      `Telefon: ${String(data.get("phone") || "").trim() || "—"}`,
      "",
      "Produse solicitate:",
      ...(items.length ? items : ["—"]),
      "",
      `Observații: ${notes || "—"}`
    ].join("\n");
    window.location.href = `mailto:${config.salesEmail || "comenzi@mondo-romania.ro"}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showQuoteStatus(language === "en" ? "Your email app is ready with the request. Review and send the message." : "Aplicația de e-mail este pregătită cu cererea. Verifică și trimite mesajul.", true);
  }

  async function fetchSupabaseRows(path) {
    const base = String(config.supabaseUrl || "").replace(/\/$/, "");
    const rows = [];
    const size = 1000;
    for (let offset = 0; ; offset += size) {
      const response = await fetch(`${base}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${size}`, {
        headers: {
          apikey: config.supabasePublishableKey,
          "Accept-Profile": "public",
          Range: `${offset}-${offset + size - 1}`,
          "Range-Unit": "items"
        },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Baza de date nu a putut fi citită (${response.status}).`);
      const batch = await response.json();
      if (!Array.isArray(batch)) throw new Error("Baza de date a returnat un catalog invalid.");
      rows.push(...batch);
      if (batch.length < size) break;
    }
    return rows;
  }

  async function loadSupabaseCatalog() {
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Lipsește URL-ul sau cheia publică Supabase din config.js.");
    const [categoryRows, productRows, syncRows] = await Promise.all([
      fetchSupabaseRows("categories?select=id,source_category_id,name,name_en,slug,sort_order,is_published&is_published=eq.true&order=sort_order.asc,name.asc"),
      fetchSupabaseRows("catalog_public?select=*&order=name.asc"),
      fetchSupabaseRows("catalog_sync_state?select=synced_at,product_count,category_count&id=eq.1")
    ]);
    const orderedCategories = categoryRows.map((category, index) => ({
      id: category.slug,
      name: category.name,
      nameEn: category.name_en || category.name,
      eyebrow: String(index + 1).padStart(2, "0"),
      sourceId: category.source_category_id
    }));
    const categoryBySlug = new Map(orderedCategories.map(category => [category.id, category]));
    products = productRows.map(row => ({
      id: String(row.id),
      sourceId: row.source_id || "",
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle || "",
      code: row.code || "",
      brand: row.brand || "",
      manufacturer: row.manufacturer || "",
      category: row.category,
      categories: Array.isArray(row.categories) && row.categories.length ? row.categories : [row.category],
      price: row.price == null ? null : Number(row.price),
      priceVat: row.price_vat == null ? null : Number(row.price_vat),
      currency: row.currency || "RON",
      image: row.image || "",
      imageAlt: row.image_alt || row.name,
      colors: row.colors || [],
      sizes: row.sizes || [],
      standards: row.standards || [],
      summary: row.summary || row.description || "",
      details: row.details || [],
      sourceUrl: row.source_url || "",
      categoryUrl: row.category_url || `https://emondo.ro/${row.category}/`
    }));
    window.MONDO_CATEGORIES = orderedCategories;
    window.MONDO_EN_CATEGORY_LABELS = Object.fromEntries(orderedCategories.map(category => [category.id, category.nameEn]));
    const listingCount = products.reduce((sum, product) => sum + (product.categories || [product.category]).length, 0);
    catalogMeta = {
      syncedAt: syncRows[0]?.synced_at || null,
      productCount: products.length,
      listingCount,
      source: config.sourceCatalogUrl || "https://emondo.ro"
    };
    if (categoryBySlug.size !== 12) console.warn(`MONDO catalog: expected 12 published categories, received ${categoryBySlug.size}.`);
  }

  async function loadCatalogSnapshot() {
    try {
      if (config.catalogMode === "supabase") {
        await loadSupabaseCatalog();
      } else {
        const response = await fetch("/data/catalog.json", { cache: "no-cache" });
        if (!response.ok) throw new Error(`Catalogul nu a putut fi încărcat (${response.status}).`);
        const snapshot = await response.json();
        if (!Array.isArray(snapshot.products) || !snapshot.products.length || snapshot.products.length !== snapshot.productCount) throw new Error("Catalogul nu conține toate produsele sincronizate.");
        products = snapshot.products;
        catalogMeta = snapshot;
        window.MONDO_CATEGORIES = snapshot.categories.map(({ id, name, nameEn, eyebrow }) => ({ id, name, nameEn, eyebrow }));
        window.MONDO_EN_CATEGORY_LABELS = Object.fromEntries(snapshot.categories.map(category => [category.id, category.nameEn]));
      }
      liveCatalog = true;
      renderRoute();
    } catch (error) {
      products = [];
      liveCatalog = false;
      console.error("MONDO catalog:", error.message);
      shell(`<section class="info-page"><div class="container"><div class="eyebrow">Catalog MONDO</div><h1 class="display">Catalogul se<br><em>încarcă.</em></h1><p class="lead">${esc(error.message || "În acest moment nu putem încărca catalogul.")}</p><p style="margin-top:24px"><a class="button" href="https://emondo.ro/" target="_blank" rel="noopener noreferrer">Deschide catalogul eMondo ↗</a></p></div></section>`, "Catalog MONDO", "Catalogul de produse MONDO.", false);
    }
  }
  document.addEventListener("click", event => {
    const anchor = event.target.closest("a[href]");
    if (anchor && anchor.origin === location.origin && !anchor.pathname.toLowerCase().endsWith(".md") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !anchor.target) {
      event.preventDefault(); routeTo(`${anchor.pathname}${anchor.search}${anchor.hash}`); return;
    }
    const action = event.target.closest("[data-action]"); if (!action) return;
    const kind = action.dataset.action;
    if (kind === "language-toggle") { language = language === "ro" ? "en" : "ro"; storage.write("mondo-language-v1", language); renderRoute(); }
    else if (kind === "quick-add") quickAdd(action.dataset.id);
    else if (kind === "compare") toggleCompare(action.dataset.id);
    else if (kind === "clear-compare") { storage.write("mondo-compare-v1", []); renderCatalog(); }
    else if (kind === "close-search") $("#modal-root").innerHTML = "";
    else if (kind === "backdrop-close" && event.target === action) $("#modal-root").innerHTML = "";
    else if (kind === "remove-line") { const lines = kitLines(); lines.splice(Number(action.dataset.index), 1); storage.write("mondo-kit-v1", lines); renderTeam(); }
    else if (kind === "product-add") {
      const p = products.find(item => item.id === action.dataset.id); const color = $("#variant-color")?.value || ""; const size = $("#variant-size")?.value || "";
      if (p?.sizes?.length && !size) { $("#variant-size")?.focus(); showToast("Alege mărimea produsului."); return; }
      addToKit(p, color, size, $("#product-quantity")?.value || 1, $("#variant-request")?.value.trim() || "");
    }
  });
  document.addEventListener("submit", event => {
    if (event.target.id === "hero-search" || event.target.id === "global-search") {
      event.preventDefault(); const q = new FormData(event.target).get("q"); $("#modal-root").innerHTML = "";
      routeTo(`/catalog/${q ? `?q=${encodeURIComponent(String(q).trim())}` : ""}`);
    }
    if (event.target.id === "quick-add-form") {
      event.preventDefault(); const form = event.target; const p = products.find(item => item.id === form.dataset.id); const color = $("#variant-color", form)?.value || ""; const size = $("#variant-size", form)?.value || ""; const requestedVariant = $("#variant-request", form)?.value.trim() || "";
      if (p?.sizes?.length && !size) { $("#variant-size", form)?.focus(); return; }
      addToKit(p, color, size, $("#quick-quantity", form)?.value || 1, requestedVariant);
    }
  });
  $(".menu-toggle")?.addEventListener("click", event => {
    const nav = $(".desktop-nav"); const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", String(!expanded)); nav?.classList.toggle("mobile-open", !expanded);
  });
  $(".search-toggle")?.addEventListener("click", () => openSearch());
  $(".mobile-search")?.addEventListener("click", () => openSearch());
  window.addEventListener("popstate", renderRoute);
  document.addEventListener("keydown", e => { if (e.key === "Escape") { $("#modal-root").innerHTML = ""; closeMobileNav(); } });

  loadCatalogSnapshot();
})();
