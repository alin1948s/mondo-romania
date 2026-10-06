# MONDO România

Website responsiv pentru catalogul MONDO, cu căutare, categorii, comparație de produse, listă de echipare, panou de administrare și cereri de ofertă.

Versiunea publică folosește catalogul real eMondo și nu inventează stocuri sau variante.

## Catalog

Snapshot-ul din `data/catalog.json` conține **1.607 produse unice** din **1.692 listări**, organizate în **12 categorii**. Prețurile sunt fără TVA; eMondo rămâne sursa pentru informațiile comerciale curente.

Sincronizează local cu Node.js 20+:

```powershell
npm run catalog:sync
```

Comanda actualizează snapshot-ul, categoriile și sitemap-ul. După conectarea Supabase, `npm run catalog:publish` publică snapshot-ul verificat în baza clientului.

## Administrare și cereri

Codul panoului `/admin/`, migrarea PostgreSQL Supabase, publicarea catalogului și Edge Function pentru cereri de ofertă este pregătit. Activarea reală așteaptă proiectul și cheile clientului; până atunci site-ul rămâne în modul snapshot, iar formularul indică explicit că deschide aplicația de e-mail.

Panoul este proiectat să administreze produsele și cererile de ofertă primite. Acestea nu sunt comenzi cu plată: nu este inclus checkout, procesator de plăți, facturare sau integrare de livrare. Pașii de conectare și limitele sunt în [docs/supabase-setup.md](docs/supabase-setup.md).

## Rulare locală

```powershell
npm run dev
```

Deschide `http://127.0.0.1:4173`. Hostingul trebuie să trimită rutele curate către `index.html`; configurația Netlify include fallback-ul.

## Fișiere principale

- `app.js`, `admin.js`, `styles.css`, `index.html`, `config.js` — interfața, panoul și configurația publică.
- `data/catalog.json` — catalogul sincronizat.
- `scripts/sync-emondo-catalog.mjs` — sincronizează catalogul eMondo.
- `scripts/publish-catalog-to-supabase.mjs` — publică snapshot-ul în proiectul Supabase.
- `supabase/migrations/` și `supabase/functions/submit-quote/` — schema și procesarea cererilor.
- `netlify.toml`, `robots.txt`, `sitemap.xml` — setări pentru hosting și indexare.
