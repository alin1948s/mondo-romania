const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const requiredSecrets = ["APP_ALLOWED_ORIGINS", "SALES_EMAIL", "EMAIL_FROM", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY"];

function corsHeaders(origin: string) {
  const allowed = (Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((v) => v.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function reply(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
}
function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}
function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function getSecretKey(): string {
  const current = Deno.env.get("SUPABASE_SECRET_KEY");
  if (current) return current;
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const entry = keys.default;
    return typeof entry === "string" ? entry : String(entry?.key || "");
  } catch { return ""; }
}
async function supabaseRequest(path: string, method: string, serviceKey: string, body?: unknown) {
  const base = Deno.env.get("SUPABASE_URL");
  const headers: Record<string, string> = { apikey: serviceKey, "Content-Type": "application/json", Prefer: "return=representation" };
  if (serviceKey.startsWith("eyJ")) headers.Authorization = `Bearer ${serviceKey}`;
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) throw new Error(`database_${response.status}`);
  return data;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin);
  if (!cors) return new Response("Origin not allowed", { status: 403, headers: jsonHeaders });
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" }, cors);

  const missing = requiredSecrets.filter((name) => !Deno.env.get(name));
  const serviceKey = getSecretKey();
  if (!Deno.env.get("SUPABASE_URL") || !serviceKey) missing.push("Supabase server credentials");
  if (missing.length) return reply(503, { error: "integration_not_configured", message: "Integrarea de cereri nu este configurată complet." }, cors);

  let input: any;
  try {
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 32_000) return reply(413, { error: "payload_too_large" }, cors);
    input = await request.json();
  } catch { return reply(400, { error: "invalid_json" }, cors); }

  // Honeypot: bots that fill the hidden field receive a generic response and are not stored.
  if (clean(input?.website, 200)) return reply(200, { ok: true }, cors);
  const company = clean(input?.company, 180);
  const contact = clean(input?.contact, 120);
  const email = clean(input?.email, 254);
  const phone = clean(input?.phone, 40);
  const observations = clean(input?.observations, 2500);
  const challengeToken = clean(input?.turnstileToken, 4096);
  const items = Array.isArray(input?.items) ? input.items.slice(0, 40) : [];
  if (!contact || !validEmail(email) || !items.length && observations.length < 5 || Array.isArray(input?.items) && input.items.length > 40) {
    return reply(400, { error: "invalid_request", message: "Verifică datele de contact și produsele cererii." }, cors);
  }
  if (!challengeToken) return reply(400, { error: "challenge_required", message: "Completează verificarea de securitate înainte de trimitere." }, cors);

  const challenge = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: Deno.env.get("TURNSTILE_SECRET_KEY")!, response: challengeToken }),
  }).catch(() => null);
  if (!challenge?.ok) return reply(503, { error: "challenge_unavailable", message: "Verificarea de securitate nu este disponibilă momentan." }, cors);
  const challengeResult = await challenge.json().catch(() => ({}));
  if (!challengeResult.success || challengeResult.hostname && !((Deno.env.get("APP_ALLOWED_ORIGINS") || "").split(",").map((v) => new URL(v.trim()).hostname).includes(challengeResult.hostname))) {
    return reply(400, { error: "challenge_failed", message: "Verificarea de securitate a expirat. Reîncarcă și încearcă din nou." }, cors);
  }

  const productIds: string[] = [];
  for (const item of items) {
    const id = clean(item?.productId, 64);
    const quantity = Number(item?.quantity);
    const isDatabaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const isCatalogSourceId = /^\d{1,20}$/.test(id);
    if ((!isDatabaseId && !isCatalogSourceId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return reply(400, { error: "invalid_item", message: "Un produs sau o cantitate nu este validă." }, cors);
    }
    productIds.push(id);
  }

  try {
    const service = serviceKey;
    const ids = [...new Set(productIds)];
    const databaseIds = ids.filter((id) => id.includes("-"));
    const sourceIds = ids.filter((id) => /^\d+$/.test(id));
    const products = [];
    if (databaseIds.length) products.push(...await supabaseRequest(`products?select=id,source_id,name,product_code,color_options,size_options&status=eq.published&is_demo=eq.false&id=in.(${databaseIds.join(",")})`, "GET", service));
    if (sourceIds.length) products.push(...await supabaseRequest(`products?select=id,source_id,name,product_code,color_options,size_options&status=eq.published&is_demo=eq.false&source_id=in.(${sourceIds.join(",")})`, "GET", service));
    const productMap = new Map<string, any>();
    for (const product of products) {
      productMap.set(product.id, product);
      if (product.source_id) productMap.set(product.source_id, product);
    }
    if (ids.some((id) => !productMap.has(id))) return reply(400, { error: "product_unavailable", message: "Un produs din listă nu mai este publicat." }, cors);
    const validatedItems = [];
    for (const item of items) {
      const product: any = productMap.get(clean(item.productId, 64));
      const label = clean(item.variant, 150);
      const available = [...(product.color_options || []), ...(product.size_options || [])].map((v: string) => clean(v, 80));
      const choices = label && !["Standard", "De verificat cu MONDO"].includes(label) ? label.split(" · ").map((v: string) => v.trim()) : [];
      if (available.length && choices.some((choice: string) => !available.includes(choice))) return reply(400, { error: "variant_unavailable", message: "O variantă din listă nu mai este disponibilă." }, cors);
      validatedItems.push({ product_id: product.id, product_name: product.name, product_code: product.product_code, variant_label: available.length ? choices.join(" · ") || null : label || null, quantity: Number(item.quantity) });
    }

    const [saved] = await supabaseRequest("quote_requests", "POST", service, [{ company: company || null, contact_name: contact, email, phone: phone || null, observations: observations || null, status: "new", email_status: "pending" }]);
    try {
      if (validatedItems.length) await supabaseRequest("quote_request_items", "POST", service, validatedItems.map((item) => ({ ...item, request_id: saved.id })));
    } catch (error) {
      await supabaseRequest(`quote_requests?id=eq.${saved.id}`, "DELETE", service).catch(() => null);
      throw error;
    }

    const lines = validatedItems.map((item) => `• ${item.product_name}${item.product_code ? ` (${item.product_code})` : ""}${item.variant_label ? ` — ${item.variant_label}` : ""} — cantitate: ${item.quantity}`).join("\n") || "Fără produse atașate; cerere generală.";
    const message = [
      `Cerere MONDO ${saved.id}`,
      `Firmă: ${company || "—"}`,
      `Persoană: ${contact}`,
      `E-mail: ${email}`,
      `Telefon: ${phone || "—"}`,
      "",
      "Produse:", lines,
      "", "Observații:", observations || "—",
    ].join("\n");
    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM"), to: [Deno.env.get("SALES_EMAIL")], reply_to: email, subject: `Cerere ofertă MONDO ${saved.id.slice(0, 8)}`, text: message }),
    }).catch(() => null);
    if (!mailResponse?.ok) {
      await supabaseRequest(`quote_requests?id=eq.${saved.id}`, "PATCH", service, { email_status: "failed", email_error: "E-mail provider rejected or did not answer." }).catch(() => null);
      return reply(202, { ok: true, id: saved.id, reference: saved.id.slice(0, 8).toUpperCase(), email_status: "failed", warning: "Cererea a fost salvată, dar e-mailul nu a fost confirmat. Echipa MONDO trebuie să verifice panoul de administrare." }, cors);
    }
    await supabaseRequest(`quote_requests?id=eq.${saved.id}`, "PATCH", service, { email_status: "sent", email_error: null }).catch(() => null);
    return reply(201, { ok: true, id: saved.id, reference: saved.id.slice(0, 8).toUpperCase(), email_status: "sent" }, cors);
  } catch (error) {
    console.error("submit-quote failed", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "request_failed", message: "Cererea nu a putut fi salvată. Încearcă din nou." }, cors);
  }
});
