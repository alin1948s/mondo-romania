# Administrare catalog și cereri MONDO

## Ce este implementat

- Migrarea creează schema PostgreSQL pentru catalog, administratori și cereri de ofertă, cu politici RLS.
- Ruta privată `/admin/` autentifică personalul prin Supabase Auth. Administrarea catalogului permite căutare, editare, publicare/arhivare și asocierea produselor la categorii.
- Produsele catalogului complet sincronizat din eMondo pot fi editate în panou. Sincronizările următoare actualizează produsele de sursă; produsul trecut în administrare manuală își păstrează modificările.
- Cererile trimise de formularul public sunt păstrate în baza de date și pot fi urmărite în panou; funcția server trimite notificarea către adresa de vânzări.
- Cheia secretă este folosită numai dintr-un shell privat sau din secretele funcției server-side. Codul din browser folosește doar cheia publică Supabase.

## Starea proiectului Supabase

Proiectul Supabase MONDO este creat, migrarea inițială și corecția funcției de sincronizare au fost aplicate, iar `config.js` conține Project URL-ul și cheia publică. Importul a publicat 1.607 produse în 12 categorii. Endpoint-ul public `catalog_public` confirmă 1.607 produse, iar website-ul citește acum catalogul din Supabase. Migrarea de clarificare a relațiilor produs-categorie (`202610060003`) și migrarea de eliminare a tabelelor opționale goale (`202610060004`) sunt pregătite în SQL Editor. Panoul de administrare și formularul de cerere rămân dezactivate până la configurarea contului administratorului și a funcției de ofertare.

Cheia `sb_publishable_...` este destinată browserului și poate rămâne în `config.js`. Cheia `sb_secret_...` se folosește numai dintr-un shell privat sau din secretele funcției server-side: nu se trimite în chat, nu se pune în codul site-ului și nu se publică în repository. Cheile vechi `anon`/`service_role` pot fi folosite numai ca tranziție; noile chei Supabase sunt preferate.

## Clarifică relațiile și sincronizează catalogul

Rulează în SQL Editor-ul Supabase, în ordine:

1. `supabase/migrations/202610060003_clarify_product_category_relationships.sql` elimină legăturile duplicate în care categoria principală era repetată în `product_categories`; păstrează toate produsele, categoriile și legăturile suplimentare.
2. `supabase/migrations/202610060004_remove_unused_catalog_tables.sql` elimină `brands`, `product_translations`, `product_variants`, `product_specifications`, `product_assets` și coloana `products.brand_id`. Migrarea verifică întâi că aceste tabele sunt goale și că produsele nu au brand asociat; se oprește fără modificări dacă găsește date. Păstrează forma view-ului `catalog_public`, folosind `manufacturer` ca text de brand.

Explicația relațiilor este în [data-model.md](data-model.md).

Pentru o instalare nouă, aplică migrațiile `202610060001`, `202610060002`, `202610060003` și `202610060004` în ordine. Catalogul actual este deja importat. La o sincronizare viitoare, din PowerShell-ul local setează URL-ul proiectului și introdu cheia secretă la promptul ascuns; textul promptului nu este cheia. Nu salva cheia într-un fișier urmărit de Git:

```powershell
$env:MONDO_SUPABASE_URL = "https://ziqxbodoirnxdvwidvor.supabase.co"
$secretKey = Read-Host -Prompt "Cheia secretă Supabase (input ascuns)" -AsSecureString
try {
  $env:MONDO_SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new("", $secretKey).Password
  npm.cmd run catalog:publish
} finally {
  Remove-Item Env:MONDO_SUPABASE_SECRET_KEY, Env:MONDO_SUPABASE_URL -ErrorAction SilentlyContinue
  $secretKey.Dispose()
}
```

Scriptul verifică snapshot-ul local înainte de scriere și importă cele **1.607 produse** din cele **12 categorii**. Rezultatul confirmă câte produse au fost adăugate sau reîmprospătate. Produsele editate manual și starea lor de publicare sunt păstrate la o sincronizare ulterioară.

## Activează site-ul și panoul

Catalogul folosește deja `catalogMode: "supabase"`. Activează separat panoul doar după crearea utilizatorului Auth și inserarea acestuia în `admin_users`:

```js
catalogMode: "supabase",
adminEnabled: true
```

Cheile Supabase sunt deja configurate. Păstrează `quoteEnabled: false` până când funcția `submit-quote`, secretele server-side, Turnstile și domeniul final sunt configurate și verificate. `quoteEndpoint` poate rămâne gol: website-ul folosește ruta standard `/functions/v1/submit-quote` din proiect.

În Supabase Auth, creează contul primului administrator cu acces privat, apoi rulează în SQL Editor, înlocuind adresa cu aceeași adresă de autentificare:

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('admin@mondo-romania.ro')
on conflict (user_id) do nothing;
```

Nu deschide înregistrarea publică pentru administratori. RLS limitează operațiile asupra datelor la utilizatorii înregistrați în `admin_users`.

Înainte de activarea colectării, MONDO trebuie să confirme operatorul de date, informarea de confidențialitate, perioada de păstrare și persoanele care accesează cererile. Pagina legală legată din formular indică în prezent politica eMondo; MONDO trebuie să aprobe formularea pentru noul flux Supabase.

## Funcția de ofertare și e-mail

Configurează secretele pentru Edge Function `submit-quote` din Supabase Dashboard. Nu le publica în fișierele frontend:

- `APP_ALLOWED_ORIGINS` — originile exacte permise, separate prin virgulă, fără slash final (de exemplu `https://mondo-romania.ro,https://www.mondo-romania.ro`).
- `SALES_EMAIL` — adresa aprobată de MONDO pentru cereri.
- `EMAIL_FROM` — expeditor de pe un domeniu verificat la Resend.
- `RESEND_API_KEY` — cheia privată Resend.
- `TURNSTILE_SECRET_KEY` — cheia privată Cloudflare Turnstile pentru domeniul final.
- `SUPABASE_URL` și `SUPABASE_SECRET_KEY` — URL-ul și cheia privată a proiectului.

Deploy-ul funcției necesită Supabase CLI și proiectul corect legat (`supabase link --project-ref <project-ref>`), apoi `supabase functions deploy submit-quote`. Verifică în Dashboard că funcția folosește secretele proiectului clientului. Pentru chei Supabase curente, cheia secretă se trimite drept `apikey`; cheia veche `service_role` folosește și Bearer auth.

## Limitele fluxului de comenzi

Site-ul gestionează **cereri de ofertă**: datele de contact, produsele și cantitățile sunt salvate, iar echipa poate actualiza starea cererii. Nu există comandă confirmată cu plată, checkout, facturare, tarif de transport sau integrare curier. Nu prezenta aceste cereri ca vânzări/comenzi plătite. Un flux de checkout se poate proiecta separat după ce MONDO aprobă procesatorul de plăți și regulile comerciale.

Panoul editează imaginile printr-un URL HTTPS. Nu este configurat upload de fișiere sau spațiu de stocare pentru imagini.

## Verificare înainte de predarea către client

După conectare, testează pe domeniul aprobat: numărul celor 12 categorii și 1.607 produse, căutarea, filtrarea, paginarea API, editarea unui produs, publicarea și arhivarea, păstrarea unei modificări la resynchronizare, autentificarea administratorului, cererea de ofertă în DB, e-mailul, schimbarea stării cererii și respingerea originilor neautorizate. Folosește o cerere internă aprobată și șterge/închide datele de verificare conform deciziei MONDO.

Pentru backup, păstrează dump-ul de schemă și date în afara repository-ului. Nu activa add-on-uri plătite și nu schimba planul fără aprobarea proprietarului proiectului.
