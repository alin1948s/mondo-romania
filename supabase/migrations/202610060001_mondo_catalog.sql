-- MONDO catalog and quote requests. Run in Supabase SQL Editor or with Supabase CLI.
-- This migration creates an empty production schema; it does not insert product or test data.
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  source_category_id bigint unique,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  source_id text unique,
  management_mode text not null default 'source' check (management_mode in ('source','manual')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  slug text not null unique check (slug ~ '^[A-Za-z0-9_-]+$'),
  subtitle text,
  product_code text,
  manufacturer text,
  summary text,
  description text,
  price_net numeric(12,2) check (price_net is null or price_net >= 0),
  price_gross numeric(12,2) check (price_gross is null or price_gross >= 0),
  currency char(3) not null default 'RON',
  image_url text check (image_url is null or image_url ~ '^https://'),
  image_alt text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  color_options text[] not null default '{}',
  size_options text[] not null default '{}',
  standards text[] not null default '{}',
  specifications jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products add column if not exists source_id text unique;
alter table public.products add column if not exists management_mode text not null default 'source' check (management_mode in ('source','manual'));
alter table public.categories add column if not exists source_category_id bigint unique;

-- English fields live separately so translated catalog content can be reviewed and maintained independently.
create table if not exists public.product_translations (
  product_id uuid not null references public.products(id) on delete cascade,
  locale text not null check (locale = 'en'),
  name text not null,
  subtitle text,
  summary text,
  description text,
  image_alt text,
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (product_id, locale)
);
alter table public.categories add column if not exists name_en text;

create index if not exists products_public_category_idx on public.products(category_id, status, is_demo);
create index if not exists products_source_id_idx on public.products(source_id) where source_id is not null;
create index if not exists products_brand_idx on public.products(brand_id);
create index if not exists products_name_search_idx on public.products using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(product_code,'')));

-- Normalized variants support real SKU-level choices and per-variant pricing.
-- color_options / size_options on products are lightweight UI caches; keep them in sync with this table.
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_code text,
  color text,
  size text,
  price_net numeric(12,2) check (price_net is null or price_net >= 0),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (product_id, color, size)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id, is_published, sort_order);

create table if not exists public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);
create index if not exists product_categories_category_idx on public.product_categories(category_id, product_id);

create table if not exists public.catalog_sync_state (
  id smallint primary key default 1 check (id = 1),
  source text not null default 'https://emondo.ro',
  synced_at timestamptz not null default now(),
  product_count integer not null default 0 check (product_count >= 0),
  category_count integer not null default 0 check (category_count >= 0)
);
alter table public.catalog_sync_state enable row level security;
drop policy if exists catalog_sync_state_public_read on public.catalog_sync_state;
create policy catalog_sync_state_public_read on public.catalog_sync_state for select to anon, authenticated using (true);
grant select on public.catalog_sync_state to anon, authenticated;

create table if not exists public.product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null default 'specification' check (kind in ('specification','standard','material','use_case')),
  name text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_specifications_product_idx on public.product_specifications(product_id, sort_order);

-- Only HTTPS source URLs are accepted here. This prototype has no file-upload endpoint.
create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  asset_type text not null check (asset_type in ('image','document')),
  source_url text not null check (source_url ~ '^https://'),
  alt_text text,
  label text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 0 and 10485760),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_assets_product_idx on public.product_assets(product_id, asset_type, sort_order);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  company text,
  contact_name text not null,
  email text not null,
  phone text,
  observations text,
  status text not null default 'new' check (status in ('new','in_review','answered','closed')),
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
  email_error text,
  created_at timestamptz not null default now()
);
create index if not exists quote_requests_created_idx on public.quote_requests(created_at desc);

create table if not exists public.quote_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_code text,
  variant_label text,
  quantity integer not null check (quantity between 1 and 999),
  created_at timestamptz not null default now()
);
create index if not exists quote_items_request_idx on public.quote_request_items(request_id);

create or replace function public.is_mondo_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function public.is_mondo_admin() from public;
grant execute on function public.is_mondo_admin() to authenticated;
grant execute on function public.is_mondo_admin() to anon;

alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_translations enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_specifications enable row level security;
alter table public.product_assets enable row level security;
alter table public.admin_users enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_items enable row level security;

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated using (is_published or public.is_mondo_admin());
drop policy if exists categories_admin_manage on public.categories;
create policy categories_admin_manage on public.categories for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists brands_public_read on public.brands;
create policy brands_public_read on public.brands for select to anon, authenticated using (
  (is_published and exists (select 1 from public.products p where p.brand_id = brands.id and p.status = 'published' and p.is_demo = false))
  or public.is_mondo_admin()
);
drop policy if exists brands_admin_manage on public.brands;
create policy brands_admin_manage on public.brands for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (status = 'published' and is_demo = false or public.is_mondo_admin());
drop policy if exists products_admin_manage on public.products;
create policy products_admin_manage on public.products for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists product_categories_public_read on public.product_categories;
create policy product_categories_public_read on public.product_categories for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.is_demo = false)
  or public.is_mondo_admin()
);
drop policy if exists product_categories_admin_manage on public.product_categories;
create policy product_categories_admin_manage on public.product_categories for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists product_translations_public_read on public.product_translations;
create policy product_translations_public_read on public.product_translations for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.is_demo = false)
  or public.is_mondo_admin()
);
drop policy if exists product_translations_admin_manage on public.product_translations;
create policy product_translations_admin_manage on public.product_translations for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists variants_public_read on public.product_variants;
create policy variants_public_read on public.product_variants for select to anon, authenticated using (
  is_published and exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.is_demo = false)
  or public.is_mondo_admin()
);
drop policy if exists variants_admin_manage on public.product_variants;
create policy variants_admin_manage on public.product_variants for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists specifications_public_read on public.product_specifications;
create policy specifications_public_read on public.product_specifications for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.is_demo = false)
  or public.is_mondo_admin()
);
drop policy if exists specifications_admin_manage on public.product_specifications;
create policy specifications_admin_manage on public.product_specifications for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists assets_public_read on public.product_assets;
create policy assets_public_read on public.product_assets for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'published' and p.is_demo = false)
  or public.is_mondo_admin()
);
drop policy if exists assets_admin_manage on public.product_assets;
create policy assets_admin_manage on public.product_assets for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists admin_users_self_or_admin_read on public.admin_users;
create policy admin_users_self_or_admin_read on public.admin_users for select to authenticated using (user_id = auth.uid() or public.is_mondo_admin());
drop policy if exists admin_users_admin_manage on public.admin_users;
create policy admin_users_admin_manage on public.admin_users for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

drop policy if exists quotes_admin_read on public.quote_requests;
create policy quotes_admin_read on public.quote_requests for select to authenticated using (public.is_mondo_admin());
drop policy if exists quotes_admin_update on public.quote_requests;
create policy quotes_admin_update on public.quote_requests for update to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());
drop policy if exists quotes_admin_delete on public.quote_requests;
create policy quotes_admin_delete on public.quote_requests for delete to authenticated using (public.is_mondo_admin());
drop policy if exists quote_items_admin_read on public.quote_request_items;
create policy quote_items_admin_read on public.quote_request_items for select to authenticated using (public.is_mondo_admin());
drop policy if exists quote_items_admin_manage on public.quote_request_items;
create policy quote_items_admin_manage on public.quote_request_items for all to authenticated using (public.is_mondo_admin()) with check (public.is_mondo_admin());

grant select on public.categories, public.brands, public.products, public.product_categories, public.product_variants, public.product_specifications, public.product_assets, public.product_translations to anon, authenticated;
grant insert, update, delete on public.categories, public.brands, public.products, public.product_categories, public.product_variants, public.product_specifications, public.product_assets, public.product_translations to authenticated;
grant select, update, delete on public.quote_requests to authenticated;
grant select, insert, update, delete on public.quote_request_items to authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.admin_users to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at before update on public.categories for each row execute function public.touch_updated_at();
drop trigger if exists brands_touch_updated_at on public.brands;
create trigger brands_touch_updated_at before update on public.brands for each row execute function public.touch_updated_at();
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists product_translations_touch_updated_at on public.product_translations;
create trigger product_translations_touch_updated_at before update on public.product_translations for each row execute function public.touch_updated_at();
drop trigger if exists variants_touch_updated_at on public.product_variants;
create trigger variants_touch_updated_at before update on public.product_variants for each row execute function public.touch_updated_at();

-- A single public, RLS-respecting projection keeps the storefront in sync with admin edits.
create or replace view public.catalog_public with (security_invoker = true) as
select
  p.id::text as id,
  p.source_id,
  p.slug,
  p.name,
  p.subtitle,
  p.product_code as code,
  coalesce(b.name, '') as brand,
  p.manufacturer,
  c.slug as category,
  array(
    select distinct memberships.slug
    from (
      select c.slug
      union all
      select member_category.slug
      from public.product_categories pc
      join public.categories member_category on member_category.id = pc.category_id
      where pc.product_id = p.id and member_category.is_published
    ) memberships
    order by memberships.slug
  ) as categories,
  p.price_net as price,
  p.price_gross as price_vat,
  p.currency,
  p.image_url as image,
  p.image_alt as image_alt,
  p.color_options as colors,
  p.size_options as sizes,
  p.standards,
  p.summary,
  p.description,
  string_to_array(coalesce(p.description, ''), E'\n') as details,
  p.source_url as source_url,
  ('https://emondo.ro/' || c.slug || '/') as category_url
from public.products p
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
where p.status = 'published' and p.is_demo = false and c.is_published;
grant select on public.catalog_public to anon, authenticated;

-- Only the local server-side catalog sync may write source records. It preserves manual product edits and publication status.
create or replace function public.sync_emondo_catalog(p_catalog jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_row jsonb;
  product_row jsonb;
  category_id uuid;
  v_product_id uuid;
  current_mode text;
  category_slug text;
  inserted_products integer := 0;
  updated_products integer := 0;
  category_count integer := 0;
  was_existing boolean;
begin
  if jsonb_typeof(p_catalog->'categories') <> 'array' or jsonb_typeof(p_catalog->'products') <> 'array' then
    raise exception 'Invalid catalog payload';
  end if;

  for category_row in select value from jsonb_array_elements(p_catalog->'categories') loop
    insert into public.categories(name, name_en, slug, source_category_id, sort_order, is_published)
    values (
      left(coalesce(category_row->>'name', ''), 160),
      left(coalesce(category_row->>'nameEn', ''), 160),
      category_row->>'id',
      nullif(category_row->>'sourceId', '')::bigint,
      nullif(category_row->>'eyebrow', '')::integer,
      true
    )
    on conflict (slug) do update set
      name = excluded.name,
      name_en = excluded.name_en,
      source_category_id = excluded.source_category_id,
      sort_order = excluded.sort_order;
    category_count := category_count + 1;
  end loop;

  for product_row in select value from jsonb_array_elements(p_catalog->'products') loop
    select c.id into category_id from public.categories c where c.slug = product_row->>'category';
    if category_id is null then raise exception 'Unknown primary category for product %', product_row->>'slug'; end if;
    select exists(select 1 from public.products p where p.source_id = product_row->>'id') into was_existing;

    insert into public.products as current_product (
      source_id, management_mode, category_id, name, slug, subtitle, product_code, manufacturer,
      summary, description, price_net, price_gross, currency, image_url, image_alt,
      color_options, size_options, standards, status, is_demo, source_url
    ) values (
      product_row->>'id', 'source', category_id,
      left(coalesce(product_row->>'name', ''), 180),
      product_row->>'slug', nullif(left(coalesce(product_row->>'subtitle', ''), 240), ''),
      nullif(left(coalesce(product_row->>'code', ''), 80), ''),
      nullif(left(coalesce(product_row->>'manufacturer', ''), 160), ''),
      nullif(left(coalesce(product_row->>'summary', ''), 12000), ''),
      nullif(left(coalesce(product_row->>'summary', ''), 12000), ''),
      nullif(product_row->>'price', '')::numeric,
      nullif(product_row->>'priceVat', '')::numeric,
      coalesce(nullif(product_row->>'currency', ''), 'RON'),
      nullif(product_row->>'image', ''),
      nullif(left(coalesce(product_row->>'imageAlt', ''), 240), ''),
      array(select jsonb_array_elements_text(coalesce(product_row->'colors', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(product_row->'sizes', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(product_row->'standards', '[]'::jsonb))),
      'published', false, nullif(product_row->>'sourceUrl', '')
    )
    on conflict (source_id) do update set
      category_id = excluded.category_id,
      name = excluded.name,
      slug = excluded.slug,
      subtitle = excluded.subtitle,
      product_code = excluded.product_code,
      manufacturer = excluded.manufacturer,
      summary = excluded.summary,
      description = excluded.description,
      price_net = excluded.price_net,
      price_gross = excluded.price_gross,
      currency = excluded.currency,
      image_url = excluded.image_url,
      image_alt = excluded.image_alt,
      color_options = excluded.color_options,
      size_options = excluded.size_options,
      standards = excluded.standards,
      source_url = excluded.source_url
    where current_product.management_mode = 'source';

    select p.id, p.management_mode into v_product_id, current_mode
    from public.products p where p.source_id = product_row->>'id';
    if current_mode = 'source' then
      if was_existing then updated_products := updated_products + 1; else inserted_products := inserted_products + 1; end if;
      delete from public.product_categories pc where pc.product_id = v_product_id;
      for category_slug in select jsonb_array_elements_text(coalesce(product_row->'categories', '[]'::jsonb)) loop
        insert into public.product_categories(product_id, category_id)
        select v_product_id, c.id from public.categories c where c.slug = category_slug
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  insert into public.catalog_sync_state(id, source, synced_at, product_count, category_count)
  values (1, coalesce(p_catalog->>'source', 'https://emondo.ro'), now(), jsonb_array_length(p_catalog->'products'), category_count)
  on conflict (id) do update set
    source = excluded.source,
    synced_at = excluded.synced_at,
    product_count = excluded.product_count,
    category_count = excluded.category_count;

  return jsonb_build_object('categories', category_count, 'inserted', inserted_products, 'updated', updated_products, 'products', jsonb_array_length(p_catalog->'products'));
end;
$$;
revoke all on function public.sync_emondo_catalog(jsonb) from public, anon, authenticated;
grant execute on function public.sync_emondo_catalog(jsonb) to service_role;

-- Never grant anon insert on quote tables. The submit-quote Edge Function validates the payload,
-- stores the request, and emails only to a company-confirmed address using server-only secrets.
