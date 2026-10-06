# Formatul CSV pentru importul de catalog

Șablonul gol este `templates/catalog_import_template.csv`. Folosește un export oficial aprobat de MONDO/eMondo; nu completa produse sau prețuri prin presupuneri.

## Coloane

| Câmp | Utilizare |
| --- | --- |
| name, slug, category_slug | Denumirea și adresa produsului; categoria trebuie să existe în Supabase. Slug-ul acceptă litere mici, cifre și cratimă. |
| product_code, manufacturer, subtitle, summary, description | Date text aprobate pentru produs. Descrierile au maximum 12.000 de caractere. |
| price_net, price_gross, currency | Prețuri și moneda din exportul companiei. Nu inventa disponibilitate sau prețuri. |
| image_url, image_alt, source_url | Adrese HTTPS și text alternativ descriptiv. Folosește numai imagini și linkuri aprobate de companie. |
| color_options, size_options, standards | Liste separate prin `|`, de exemplu `XS|S|M`. Folosește doar opțiuni verificate. |
| specifications_json | JSON array de specificații simple, de exemplu `[ {"kind":"specification","name":"Material","value":"..."} ]`. Tipurile acceptate: `specification`, `standard`, `material`, `use_case`. |

Valorile JSON trebuie scrise într-un câmp CSV între ghilimele duble, iar ghilimelele interne dublate conform formatului CSV. Importatorul acceptă UTF-8 și câmpuri CSV citate care conțin virgule sau linii noi.

## Executare

Fără `--apply`, scriptul validează CSV-ul și raportează numărul de produse fără să schimbe baza:

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

Cheia service-role se folosește numai în procesul local de import și o citește RLS-bypass. Nu o transmite browserului, nu o scrie în CSV și nu o adăuga în Git. Scriptul nu șterge sau actualizează duplicatele; le sare pentru revizuire separată. Toate produsele importate rămân ciornă și `is_demo=false`; administratorul trebuie să le revizuiască și să le publice.
