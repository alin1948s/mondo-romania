(() => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/admin") return;

  const config = window.MONDO_CONFIG || {};
  const root = document.querySelector("#main");
  const sessionKey = "mondo-admin-session-v1";
  let session = readSession();
  let profile = null;
  let categories = [];
  let products = [];
  let memberships = [];
  let requests = [];
  let activeTab = "products";
  let searchTerm = "";
  let productPage = 0;
  let busy = false;

  document.body.classList.add("admin-page");
  document.querySelector(".site-header")?.setAttribute("hidden", "");
  document.querySelector(".site-footer")?.setAttribute("hidden", "");
  document.querySelector(".mobile-dock")?.setAttribute("hidden", "");
  document.querySelector(".announcement")?.setAttribute("hidden", "");
  document.title = "Administrare MONDO România";
  const robots = document.querySelector('meta[name="robots"]');
  if (robots) robots.content = "noindex, nofollow";

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(sessionKey) || "null"); } catch { return null; }
  }
  function saveSession(next) {
    session = next;
    if (next) sessionStorage.setItem(sessionKey, JSON.stringify(next));
    else sessionStorage.removeItem(sessionKey);
  }
  function configured() { return Boolean(config.supabaseUrl && config.supabasePublishableKey && config.adminEnabled === true); }
  function baseUrl() { return String(config.supabaseUrl || "").replace(/\/$/, ""); }
  function message(text, type = "info") {
    const node = document.querySelector("#admin-notice");
    if (!node) return;
    node.textContent = text;
    node.dataset.type = type;
    node.hidden = !text;
  }

  async function refreshSession() {
    if (!session?.refresh_token) return false;
    const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) { saveSession(null); return false; }
    saveSession(await response.json());
    return true;
  }

  async function api(path, options = {}, retry = true) {
    const headers = {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(`${baseUrl()}/rest/v1/${path}`, { ...options, headers });
    if (response.status === 401 && retry && await refreshSession()) return api(path, options, false);
    const raw = await response.text();
    let result = null;
    try { result = raw ? JSON.parse(raw) : null; } catch { result = raw; }
    if (!response.ok) throw new Error(result?.message || result?.hint || result?.details || `Supabase a răspuns cu ${response.status}.`);
    return result;
  }

  async function fetchAll(path, retry = true) {
    const results = [];
    const size = 1000;
    for (let offset = 0; ; offset += size) {
      const response = await fetch(`${baseUrl()}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=${size}`, {
        headers: {
          apikey: config.supabasePublishableKey,
          Authorization: `Bearer ${session.access_token}`,
          Range: `${offset}-${offset + size - 1}`,
          "Range-Unit": "items",
        },
      });
      const raw = await response.text();
      let rows;
      try { rows = raw ? JSON.parse(raw) : []; } catch { rows = []; }
      if (response.status === 401 && retry && await refreshSession()) return fetchAll(path, false);
      if (!response.ok) throw new Error(rows?.message || `Supabase a răspuns cu ${response.status}.`);
      results.push(...rows);
      if (rows.length < size) break;
    }
    return results;
  }

  function renderConfigNotice() {
    root.innerHTML = `<section class="admin-login-wrap"><div class="admin-login"><a class="admin-brand" href="/" aria-label="MONDO România"><span class="brand-mark">M</span><span>MONDO <small>ADMINISTRARE</small></span></a><div class="eyebrow">Panou privat</div><h1>Conectarea bazei de date nu este configurată.</h1><p>Panoul rămâne dezactivat până când proiectul Supabase al clientului este conectat, migrarea aplicată și contul de administrator creat.</p><p class="admin-note">Nu introdu parole sau chei secrete în această pagină. Cheia publică poate fi pusă în configurația site-ului; cheia secretă rămâne doar în Supabase și în mediul serverului de sincronizare.</p><a class="button secondary" href="/">Înapoi la website</a></div></section>`;
  }

  function renderLogin(error = "") {
    root.innerHTML = `<section class="admin-login-wrap"><form class="admin-login" id="admin-login-form"><a class="admin-brand" href="/" aria-label="MONDO România"><span class="brand-mark">M</span><span>MONDO <small>ADMINISTRARE</small></span></a><div class="eyebrow">Acces pentru echipa MONDO</div><h1>Autentificare.</h1><p>Conturile de administrare sunt create privat de proprietarul proiectului.</p>${error ? `<p class="admin-alert" role="alert">${escapeHtml(error)}</p>` : ""}<label class="admin-field"><span>E-mail</span><input name="email" type="email" autocomplete="username" required></label><label class="admin-field"><span>Parolă</span><input name="password" type="password" autocomplete="current-password" required></label><button class="button" type="submit" ${busy ? "disabled" : ""}>${busy ? "Se verifică…" : "Autentifică-te"} <span aria-hidden="true">↗</span></button><a class="admin-back" href="/">Înapoi la website</a></form></section>`;
    document.querySelector("#admin-login-form")?.addEventListener("submit", login);
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${baseUrl()}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.supabasePublishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Nu s-a putut autentifica acest cont.");
      saveSession(result);
      await openDashboard();
    } catch (error) { renderLogin(error.message); }
    finally { busy = false; }
  }

  async function checkAccess() {
    const response = await fetch(`${baseUrl()}/auth/v1/user`, {
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
    });
    if (response.status === 401 && await refreshSession()) return checkAccess();
    if (!response.ok) { saveSession(null); return false; }
    profile = await response.json();
    const allowed = await api(`admin_users?select=user_id&user_id=eq.${encodeURIComponent(profile.id)}&limit=1`);
    if (!allowed?.length) { saveSession(null); throw new Error("Contul este autentificat, dar nu are drepturi de administrare MONDO."); }
    return true;
  }

  async function openDashboard() {
    try {
      if (!session?.access_token || !await checkAccess()) return renderLogin();
      renderDashboard();
      await loadActiveTab();
    } catch (error) {
      if (!session?.access_token) return renderLogin(error.message);
      saveSession(null);
      renderLogin(error.message);
    }
  }

  function renderDashboard() {
    root.innerHTML = `<div class="admin-shell"><header class="admin-topbar"><a class="admin-brand" href="/" aria-label="MONDO România"><span class="brand-mark">M</span><span>MONDO <small>ADMINISTRARE</small></span></a><div class="admin-account"><span>${escapeHtml(profile?.email || "Utilizator MONDO")}</span><button class="button secondary small" type="button" data-admin-action="logout">Ieșire</button></div></header><section class="admin-heading"><div><div class="eyebrow">Administrare catalog și vânzări</div><h1>Panou MONDO</h1><p>Modificările produselor publicate apar în catalog după salvare.</p></div></section><div id="admin-notice" class="admin-notice" role="status" hidden></div><nav class="admin-tabs" aria-label="Administrare"><button type="button" data-admin-tab="products" class="${activeTab === "products" ? "active" : ""}">Produse <span id="admin-product-count"></span></button><button type="button" data-admin-tab="requests" class="${activeTab === "requests" ? "active" : ""}">Cereri de ofertă <span id="admin-request-count"></span></button></nav><section id="admin-content" aria-live="polite"><p class="admin-loading">Se încarcă datele…</p></section><div id="admin-modal-root"></div></div>`;
    document.querySelectorAll("[data-admin-tab]").forEach(button => button.addEventListener("click", async () => {
      activeTab = button.dataset.adminTab;
      document.querySelectorAll("[data-admin-tab]").forEach(item => item.classList.toggle("active", item === button));
      await loadActiveTab();
    }));
    document.querySelector("[data-admin-action=logout]")?.addEventListener("click", logout);
    root.addEventListener("click", handleAdminClick);
    root.addEventListener("submit", handleAdminSubmit);
    root.addEventListener("change", handleAdminChange);
  }

  async function loadActiveTab() {
    const content = document.querySelector("#admin-content");
    if (!content) return;
    content.innerHTML = `<p class="admin-loading">Se încarcă…</p>`;
    try {
      if (activeTab === "products") {
        [categories, products, memberships] = await Promise.all([
          api("categories?select=id,name,name_en,slug,sort_order,is_published&order=sort_order.asc,name.asc"),
          fetchAll("products?select=id,category_id,name,slug,product_code,manufacturer,subtitle,summary,description,price_net,price_gross,currency,image_url,image_alt,source_url,color_options,size_options,standards,status,is_demo,source_id,management_mode,updated_at&order=updated_at.desc"),
          fetchAll("product_categories?select=product_id,category_id&order=product_id.asc"),
        ]);
        const memberMap = new Map();
        for (const item of memberships) memberMap.set(item.product_id, [...(memberMap.get(item.product_id) || []), item.category_id]);
        products.forEach(product => { product.categoryIds = [...new Set([product.category_id, ...(memberMap.get(product.id) || [])])]; });
        document.querySelector("#admin-product-count").textContent = products.length.toLocaleString("ro-RO");
        renderProducts();
      } else {
        requests = await api("quote_requests?select=*,quote_request_items(*)&order=created_at.desc&limit=500");
        document.querySelector("#admin-request-count").textContent = requests.length.toLocaleString("ro-RO");
        renderRequests();
      }
      message("");
    } catch (error) {
      content.innerHTML = `<div class="admin-empty"><h2>Datele nu s-au putut încărca.</h2><p>${escapeHtml(error.message)}</p><button class="button secondary" type="button" data-admin-action="reload">Încearcă din nou</button></div>`;
    }
  }

  function filteredProducts() {
    const term = searchTerm.trim().toLocaleLowerCase("ro-RO");
    return products.filter(product => !term || [product.name, product.slug, product.product_code, product.manufacturer, product.source_id].some(value => String(value || "").toLocaleLowerCase("ro-RO").includes(term)));
  }

  function renderProducts() {
    const visible = filteredProducts();
    const pageSize = 50;
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    productPage = Math.min(productPage, pageCount - 1);
    const rows = visible.slice(productPage * pageSize, (productPage + 1) * pageSize);
    const categoryMap = new Map(categories.map(category => [category.id, category.name]));
    document.querySelector("#admin-content").innerHTML = `<div class="admin-toolbar"><label class="admin-search">Caută produs<input id="admin-product-search" type="search" value="${escapeHtml(searchTerm)}" placeholder="Denumire, cod sau slug"></label><span class="admin-muted">${visible.length.toLocaleString("ro-RO")} produse</span><button class="button" type="button" data-admin-action="new-product">Produs nou <span aria-hidden="true">+</span></button></div>${visible.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Produs</th><th>Categorii</th><th>Preț fără TVA</th><th>Stare</th><th>Administrare</th></tr></thead><tbody>${rows.map(product => `<tr><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.product_code || product.slug)}</small></td><td>${(product.categoryIds || [product.category_id]).map(id => categoryMap.get(id)).filter(Boolean).map(escapeHtml).join(", ") || "—"}</td><td>${product.price_net == null ? "—" : `${Number(product.price_net).toLocaleString("ro-RO")} ${escapeHtml(product.currency || "RON")}`}</td><td><span class="admin-status ${escapeHtml(product.status)}">${escapeHtml(product.status)}</span><small>${product.management_mode === "manual" ? "Editat în MONDO" : "Sincronizat eMondo"}</small></td><td><button class="button secondary small" type="button" data-admin-action="edit-product" data-id="${escapeHtml(product.id)}">Editează</button></td></tr>`).join("")}</tbody></table></div><div class="admin-pagination"><button type="button" class="button secondary small" data-admin-action="product-page" data-page="${productPage - 1}" ${productPage <= 0 ? "disabled" : ""}>Anterior</button><span>Pagina ${productPage + 1} din ${pageCount}</span><button type="button" class="button secondary small" data-admin-action="product-page" data-page="${productPage + 1}" ${productPage + 1 >= pageCount ? "disabled" : ""}>Următoarea</button></div>` : `<div class="admin-empty"><h2>Nu am găsit produse.</h2><p>Încearcă alt termen sau creează un produs nou.</p></div>`}`;
    document.querySelector("#admin-product-search")?.addEventListener("input", event => {
      searchTerm = event.target.value;
      productPage = 0;
      const cursor = event.target.selectionStart;
      renderProducts();
      const input = document.querySelector("#admin-product-search");
      input?.focus(); input?.setSelectionRange(cursor, cursor);
    });
  }

  function renderRequests() {
    document.querySelector("#admin-content").innerHTML = requests.length ? `<div class="admin-table-wrap"><table class="admin-table request-table"><thead><tr><th>Dată</th><th>Firmă / contact</th><th>Produse solicitate</th><th>E-mail</th><th>Stare</th></tr></thead><tbody>${requests.map(request => `<tr><td>${new Date(request.created_at).toLocaleString("ro-RO")}</td><td><strong>${escapeHtml(request.company || "Persoană fizică")}</strong><small>${escapeHtml(request.contact_name)} · <a href="mailto:${escapeHtml(request.email)}">${escapeHtml(request.email)}</a>${request.phone ? `<br>${escapeHtml(request.phone)}` : ""}</small></td><td>${(request.quote_request_items || []).map(item => `<div class="admin-order-line"><strong>${escapeHtml(item.product_name)}</strong><span>${escapeHtml(item.variant_label || "Fără variantă indicată")} · ${Number(item.quantity)} buc.</span></div>`).join("") || "Cerere generală"}${request.observations ? `<details class="admin-observations"><summary>Observații</summary><p>${escapeHtml(request.observations)}</p></details>` : ""}</td><td><span class="admin-status ${escapeHtml(request.email_status)}">${escapeHtml(request.email_status)}</span></td><td><select class="admin-status-select" data-admin-action="request-status" data-id="${escapeHtml(request.id)}" aria-label="Schimbă starea cererii de la ${escapeHtml(request.contact_name)}"><option value="new" ${request.status === "new" ? "selected" : ""}>Nouă</option><option value="in_review" ${request.status === "in_review" ? "selected" : ""}>În analiză</option><option value="answered" ${request.status === "answered" ? "selected" : ""}>Răspuns trimis</option><option value="closed" ${request.status === "closed" ? "selected" : ""}>Închisă</option></select></td></tr>`).join("")}</tbody></table></div>` : `<div class="admin-empty"><h2>Nu există cereri salvate.</h2><p>Cererile apar aici după conectarea și activarea formularului Supabase de pe website.</p></div>`;
  }

  function productForm(product = null) {
    const categoryIds = product?.categoryIds || (product?.category_id ? [product.category_id] : []);
    const primaryCategoriesHtml = categories.map(category => `<option value="${escapeHtml(category.id)}" ${product?.category_id === category.id ? "selected" : ""}>${escapeHtml(category.name)}${category.is_published ? "" : " (nepublicată)"}</option>`).join("");
    const categoriesHtml = categories.map(category => `<option value="${escapeHtml(category.id)}" ${categoryIds.includes(category.id) ? "selected" : ""}>${escapeHtml(category.name)}${category.is_published ? "" : " (nepublicată)"}</option>`).join("");
    const splitValues = field => Array.isArray(product?.[field]) ? product[field].join(", ") : "";
    document.querySelector("#admin-modal-root").innerHTML = `<div class="admin-modal-backdrop" data-admin-action="close-modal"><section class="admin-product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div class="admin-modal-head"><div><div class="eyebrow">Catalog MONDO</div><h2 id="product-modal-title">${product ? "Editează produsul" : "Adaugă produs"}</h2></div><button class="admin-modal-close" type="button" data-admin-action="close-modal" aria-label="Închide">×</button></div><form id="admin-product-form" data-id="${escapeHtml(product?.id || "")}"><div class="admin-form-grid"><label class="admin-field wide"><span>Denumire *</span><input name="name" required maxlength="180" value="${escapeHtml(product?.name || "")}"></label><label class="admin-field"><span>Slug URL *</span><input name="slug" required maxlength="180" pattern="[A-Za-z0-9_-]+" value="${escapeHtml(product?.slug || "")}"></label><label class="admin-field"><span>Categorie principală *</span><select name="category_id" required>${primaryCategoriesHtml}</select></label><label class="admin-field wide"><span>Toate categoriile asociate</span><select name="category_ids" multiple size="4">${categoriesHtml}</select><small>Folosește Ctrl pentru mai multe categorii. Categoria principală este inclusă automat.</small></label><label class="admin-field"><span>Cod produs</span><input name="product_code" maxlength="80" value="${escapeHtml(product?.product_code || "")}"></label><label class="admin-field"><span>Producător</span><input name="manufacturer" maxlength="160" value="${escapeHtml(product?.manufacturer || "")}"></label><label class="admin-field"><span>Preț fără TVA (RON)</span><input name="price_net" type="number" min="0" step="0.01" value="${escapeHtml(product?.price_net ?? "")}"></label><label class="admin-field"><span>Preț cu TVA (RON)</span><input name="price_gross" type="number" min="0" step="0.01" value="${escapeHtml(product?.price_gross ?? "")}"></label><label class="admin-field"><span>Stare publicare</span><select name="status"><option value="draft" ${product?.status === "draft" ? "selected" : ""}>Ciornă</option><option value="published" ${product?.status === "published" ? "selected" : ""}>Publicat</option><option value="archived" ${product?.status === "archived" ? "selected" : ""}>Arhivat</option></select></label><label class="admin-field"><span>Adresă imagine (HTTPS)</span><input name="image_url" type="url" value="${escapeHtml(product?.image_url || "")}"></label><label class="admin-field"><span>Text alternativ imagine</span><input name="image_alt" maxlength="240" value="${escapeHtml(product?.image_alt || "")}"></label><label class="admin-field wide"><span>Subtitlu</span><input name="subtitle" maxlength="240" value="${escapeHtml(product?.subtitle || "")}"></label><label class="admin-field wide"><span>Descriere scurtă</span><textarea name="summary" maxlength="12000">${escapeHtml(product?.summary || "")}</textarea></label><label class="admin-field wide"><span>Descriere detaliată</span><textarea name="description" maxlength="12000">${escapeHtml(product?.description || "")}</textarea></label><label class="admin-field"><span>Mărimi (separate prin virgulă)</span><input name="size_options" value="${escapeHtml(splitValues("size_options"))}"></label><label class="admin-field"><span>Culori (separate prin virgulă)</span><input name="color_options" value="${escapeHtml(splitValues("color_options"))}"></label><label class="admin-field"><span>Standarde (separate prin virgulă)</span><input name="standards" value="${escapeHtml(splitValues("standards"))}"></label><label class="admin-field"><span>Link produs oficial (HTTPS)</span><input name="source_url" type="url" value="${escapeHtml(product?.source_url || "")}"></label><label class="admin-field wide admin-check"><input name="management_mode" type="checkbox" ${product?.management_mode === "source" ? "checked" : ""}><span>Sincronizează acest produs din eMondo la următoarea actualizare</span></label></div><div class="admin-form-actions"><button type="button" class="button secondary" data-admin-action="close-modal">Anulează</button><button type="submit" class="button">Salvează produsul ↗</button></div><p class="admin-form-error" id="product-form-error" role="alert"></p></form></section></div>`;
    const form = document.querySelector("#admin-product-form");
    form?.elements.name?.focus();
    document.querySelector("#admin-modal-root .admin-modal-backdrop")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeProductModal(); });
  }

  function closeProductModal() { document.querySelector("#admin-modal-root").innerHTML = ""; }

  async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorNode = document.querySelector("#product-form-error");
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const value = name => String(form.elements[name]?.value || "").trim();
    const list = name => value(name).split(",").map(item => item.trim()).filter(Boolean);
    const parseNumber = name => value(name) === "" ? null : Number(value(name));
    const categoryId = value("category_id");
    const selectedCategoryIds = [categoryId];
    const body = {
      name: value("name"), slug: value("slug"), category_id: categoryId,
      product_code: value("product_code") || null,
      manufacturer: value("manufacturer") || null,
      subtitle: value("subtitle") || null,
      summary: value("summary") || null,
      description: value("description") || null,
      price_net: parseNumber("price_net"), price_gross: parseNumber("price_gross"), currency: "RON",
      image_url: value("image_url") || null, image_alt: value("image_alt") || null,
      source_url: value("source_url") || null,
      size_options: list("size_options"), color_options: list("color_options"), standards: list("standards"),
      status: value("status"), is_demo: false,
      management_mode: form.elements.management_mode.checked ? "source" : "manual",
    };
    try {
      const record = form.dataset.id;
      const saved = record
        ? await api(`products?id=eq.${encodeURIComponent(record)}&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) })
        : await api("products?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
      const id = record || saved?.[0]?.id;
      if (!id) throw new Error("Supabase nu a returnat ID-ul produsului salvat.");
      const selectedCategoryIds = [...new Set([categoryId, ...Array.from(form.elements.category_ids.selectedOptions, option => option.value)])];
      await api(`product_categories?product_id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await api("product_categories", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(selectedCategoryIds.map(category_id => ({ product_id: id, category_id }))) });
      closeProductModal();
      message(body.management_mode === "manual" ? "Produs salvat. Modificările manuale sunt protejate de următoarea sincronizare eMondo." : "Produs salvat pentru sincronizare eMondo.", "success");
      await loadActiveTab();
    } catch (error) {
      errorNode.textContent = error.message;
      button.disabled = false;
    }
  }

  async function changeRequestStatus(event) {
    const select = event.currentTarget;
    const previous = requests.find(item => item.id === select.dataset.id)?.status;
    select.disabled = true;
    try {
      await api(`quote_requests?id=eq.${encodeURIComponent(select.dataset.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: select.value }) });
      const request = requests.find(item => item.id === select.dataset.id);
      if (request) request.status = select.value;
      message("Starea cererii a fost actualizată.", "success");
    } catch (error) {
      select.value = previous;
      message(`Cererea nu s-a putut actualiza: ${error.message}`, "error");
    } finally { select.disabled = false; }
  }

  async function handleAdminClick(event) {
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    const action = button.dataset.adminAction;
    if (action === "new-product") productForm();
    else if (action === "edit-product") productForm(products.find(product => product.id === button.dataset.id));
    else if (action === "close-modal") closeProductModal();
    else if (action === "reload") await loadActiveTab();
    else if (action === "product-page") { productPage = Number(button.dataset.page); renderProducts(); }
  }

  async function handleAdminSubmit(event) {
    if (event.target.id === "admin-product-form") await saveProduct(event);
  }

  async function handleAdminChange(event) {
    if (event.target.matches('[data-admin-action="request-status"]')) await changeRequestStatus(event);
  }

  async function logout() {
    if (session?.access_token) {
      await fetch(`${baseUrl()}/auth/v1/logout`, { method: "POST", headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` } }).catch(() => {});
    }
    saveSession(null);
    profile = null;
    renderLogin();
  }

  if (!configured()) renderConfigNotice();
  else if (session?.access_token) openDashboard();
  else renderLogin();
})();
