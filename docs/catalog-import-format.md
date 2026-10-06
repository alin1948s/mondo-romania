# Formatul CSV pentru importul de catalog

Șablonul gol este templates/catalog_import_template.csv. Solicită un export oficial de la MONDO/eMondo; nu completa mii de produse manual și nu presupune API public.

## Coloane

| Câmp | Cerință |
| --- | --- |
| name, slug, category_slug, brand_slug | Obligatorii. Slug: litere mici, cifre și cratimă. Categoria și brandul trebuie să existe deja în Supabase. |
| product_code, manufacturer, subtitle, summary, description | Text aprobat din datele produsului; descrierea este limitată la 12.000 caractere. |
| price_net, price_gross, currency | Valori din exportul companiei. Păstrează moneda; nu inventa disponibilitate ori prețuri. |
| image_url, source_url | URL-uri HTTPS. Folosește imagini și documente aprobate de companie. |
| image_alt | Text alternativ descriptiv. |
| name_en, subtitle_en, summary_en, description_en, image_alt_en, details_en | Opționale și introduse numai după revizuirea textului englezesc. Completează name_en dacă furnizezi orice alt câmp EN. `details_en` este o listă separată prin `|`. Traducerile se salvează în `product_translations`, cu RLS pentru produse publicate și administratorii MONDO. |
| color_options, size_options, standards | Liste delimitate prin |, de ex. XS|S|M. Folosește doar opțiuni verificate. |
| specifications_json | JSON array de { "kind":"specification", "name":"Material", "value":"..." }. kind: specification, standard, material, use_case. |
| variants_json | JSON array exact, de ex. [ {"variant_code":"SKU-1","color":"neon","size":"M","price_net":12.5} ]. Varianta nu este publicată automat. |
| assets_json | JSON array de imagini/documente găzduite pe URL HTTPS. asset_type este image sau document; fișierul referit este limitat la 10 MB dacă dimensiunea este cunoscută. |

Valorile JSON trebuie scrise într-un câmp CSV între ghilimele duble, iar ghilimelele interne dublate conform formatului CSV. Importatorul acceptă UTF-8 și câmpuri CSV citate care conțin virgule sau linii noi.

## Executare

Fără --apply, scriptul validează și raportează rândurile fără să schimbe baza:

~~~powershell
node scripts/import-products.mjs .\catalog_mondo.csv
~~~

După aprobarea exportului și verificarea proiectului:

~~~powershell
$env:MONDO_SUPABASE_URL = "https://PROJECT_REF.supabase.co"
$env:MONDO_SUPABASE_SERVICE_ROLE_KEY = "CHEIE_SECRETĂ_SERVER_SIDE"
node scripts/import-products.mjs .\catalog_mondo.csv --apply
Remove-Item Env:\MONDO_SUPABASE_URL
Remove-Item Env:\MONDO_SUPABASE_SERVICE_ROLE_KEY
~~~

Cheia service-role se folosește numai în procesul local de import și o citește RLS-bypass. Nu o transmite browserului, nu o scrie în CSV și nu o adăuga în Git. Scriptul nu șterge sau actualizează duplicatele; le sare pentru revizuire separată. Toate produsele importate rămân draft și is_demo=false; administratorul trebuie să le revizuiască și să le publice.
