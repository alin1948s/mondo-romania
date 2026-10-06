begin;

-- Keep the primary category in products.category_id; product_categories is only for secondary memberships.
delete from public.product_categories pc
using public.products p
where pc.product_id = p.id
  and pc.category_id = p.category_id;

comment on column public.products.category_id is 'Primary category. Additional categories are stored in product_categories.';
comment on table public.product_categories is 'Secondary category memberships only; the primary category belongs in products.category_id.';

create or replace function public.prevent_primary_product_category_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.products p
    where p.id = new.product_id
      and p.category_id = new.category_id
  ) then
    raise exception 'Primary category belongs in products.category_id; product_categories stores additional categories only';
  end if;
  return new;
end;
$$;

drop trigger if exists product_categories_reject_primary on public.product_categories;
drop trigger if exists product_categories_reject_primary_insert on public.product_categories;
drop trigger if exists product_categories_reject_primary_update on public.product_categories;
create trigger product_categories_reject_primary_insert
before insert on public.product_categories
for each row execute function public.prevent_primary_product_category_link();
create trigger product_categories_reject_primary_update
before update of product_id, category_id on public.product_categories
for each row execute function public.prevent_primary_product_category_link();

create or replace function public.remove_primary_product_category_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is distinct from old.category_id then
    delete from public.product_categories pc
    where pc.product_id = new.id
      and pc.category_id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists products_remove_primary_category_link on public.products;
create trigger products_remove_primary_category_link
after update of category_id on public.products
for each row execute function public.remove_primary_product_category_link();

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
        if category_slug <> product_row->>'category' then
          insert into public.product_categories(product_id, category_id)
          select v_product_id, c.id from public.categories c where c.slug = category_slug
          on conflict do nothing;
        end if;
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

commit;
