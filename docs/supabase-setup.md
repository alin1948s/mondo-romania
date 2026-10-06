# Administrare catalog și cereri MONDO

## Ce este implementat

- Migrarea creează schema PostgreSQL pentru catalog, administratori și cereri de ofertă, cu politici RLS.
- Ruta privată `/admin/` autentifică personalul prin Supabase Auth. Administrarea catalogului permite căutare, editare, publicare/arhivare și asocierea produselor la categorii.
- Produsele catalogului complet sincronizat din eMondo pot fi editate în panou. Sincronizările următoare actualizează produsele de sursă; produsul trecut în administrare manuală își păstrează modificările.
- Cererile trimise de formularul public sunt păstrate în baza de date și pot fi urmărite în panou; funcția server trimite notificarea către adresa de vânzări.
- Cheia secretă este folosită numai dintr-un shell privat sau din secretele funcției server-side. Codul din browser folosește doar cheia publică Supabase.

## Ce lipsește pentru conectarea efectivă

În mediul de lucru nu există încă un proiect Supabase MONDO, URL-ul lui sau cheile de proiect. De aceea migrarea și codul sunt pregătite, dar nu au fost aplicate unei baze reale, catalogul nu a fost încărcat în baza clientului, iar panoul și formularul nu sunt activate. Configurația publică rămâne dezactivată până la conectare.

Solicită proprietarului MONDO proiectul Supabase și domeniul final. Cheia `sb_publishable_...` poate fi introdusă în `config.js`; cheia `sb_secret_...` se configurează privat și nu se trimite în chat, nu se pune în codul site-ului și nu se publică în repository. Cheile vechi `anon`/`service_role` pot fi folosite numai ca tranziție; noile chei Supabase sunt preferate.

## Aplică migrarea și încarcă întregul catalog

1. Proprietarul creează sau selectează proiectul Supabase al clientului și verifică regiunea, proprietarul, backupul și planul ales.
2. Aplică `supabase/migrations/202610060001_mondo_catalog.sql` în SQL Editor-ul proiectului.
3. Din PowerShell-ul local, setează URL-ul proiectului și introdu cheia secretă la promptul ascuns. Nu salva cheia într-un fișier urmărit de Git:

```powershell
$env:MONDO_SUPABASE_URL = "https://<project-ref>.supabase.co"
$secretKey = Read-Host "Supabase secret key" -AsSecureString
$env:MONDO_SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new("", $secretKey).Password
npm run catalog:publish
Remove-Item Env:MONDO_SUPABASE_SECRET_KEY, Env:MONDO_SUPABASE_URL
$secretKey.Dispose()
```

Scriptul verifică snapshot-ul local înainte de scriere și importă cele **1.607 produse** din cele **12 categorii**. Rezultatul confirmă câte produse au fost adăugate sau reîmprospătate. Produsele editate manual și starea lor de publicare sunt păstrate la o sincronizare ulterioară.

## Activează site-ul și panoul

În `config.js`, după migrare și publicarea catalogului, proprietarul configurează:

```js
supabaseUrl: "https://<project-ref>.supabase.co",
supabasePublishableKey: "sb_publishable_...",
catalogMode: "supabase",
adminEnabled: true,
quoteEnabled: true,
quoteEndpoint: "",
turnstileSiteKey: "<cheia publică Turnstile pentru domeniul final>"
```

`quoteEndpoint` poate rămâne gol: website-ul folosește ruta standard `/functions/v1/submit-quote` din proiect. Activează `quoteEnabled` numai după ce funcția și secretele server-side sunt configurate și testate.

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
