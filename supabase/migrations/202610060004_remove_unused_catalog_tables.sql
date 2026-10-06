begin;

-- Protect against dropping data if any optional table or brand relation was populated after review.
do $$
begin
  if exists (select 1 from public.brands limit 1) then
    raise exception 'Cannot remove public.brands: it contains rows.';
  end if;
  if exists (select 1 from public.product_translations limit 1) then
    raise exception 'Cannot remove public.product_translations: it contains rows.';
  end if;
  if exists (select 1 from public.product_variants limit 1) then
    raise exception 'Cannot remove public.product_variants: it contains rows.';
  end if;
  if exists (select 1 from public.product_specifications limit 1) then
    raise exception 'Cannot remove public.product_specifications: it contains rows.';
  end if;
  if exists (select 1 from public.product_assets limit 1) then
    raise exception 'Cannot remove public.product_assets: it contains rows.';
  end if;
  if exists (select 1 from public.products where brand_id is not null limit 1) then
    raise exception 'Cannot remove products.brand_id: at least one product references a brand.';
  end if;
end;
$$;

drop view if exists public.catalog_public;

alter table public.products drop column brand_id;
drop table public.product_translations;
drop table public.product_variants;
drop table public.product_specifications;
drop table public.product_assets;
drop table public.brands;

comment on column public.products.manufacturer is 'Manufacturer/brand display text imported from the catalog source.';

-- Keep the storefront response shape stable; brand is now the product's manufacturer text.
create view public.catalog_public with (security_invoker = true) as
select
  p.id::text as id,
  p.source_id,
  p.slug,
  p.name,
  p.subtitle,
  p.product_code as code,
  coalesce(p.manufacturer, '') as brand,
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
where p.status = 'published' and p.is_demo = false and c.is_published;

grant select on public.catalog_public to anon, authenticated;

commit;
