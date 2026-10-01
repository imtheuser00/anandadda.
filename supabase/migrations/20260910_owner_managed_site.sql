-- Anand Adda: owner-managed website upgrade
-- Run this file once in Supabase Dashboard -> SQL Editor.
-- It preserves existing rows. It does not delete product, offer, or settings data.

begin;

create extension if not exists pgcrypto;

-- Existing tables are retained and extended in place.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('owner', 'customer')),
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id boolean primary key default true,
  shop_name text,
  hero_text text,
  about_text text,
  address text,
  phone text,
  whatsapp text,
  instagram text,
  maps_url text,
  opening_hours text,
  logo_path text,
  shop_photo_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric,
  category text,
  sizes text[] not null default '{}'::text[],
  description text,
  image_urls text[] not null default '{}'::text[],
  image_paths text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  image_path text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_settings
  add column if not exists logo_path text,
  add column if not exists shop_photo_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.products
  add column if not exists image_paths text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();

alter table public.products
  alter column is_active set default true;

alter table public.offers
  add column if not exists image_path text,
  add column if not exists image_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.offers
  alter column is_active set default true;

create table if not exists public.weekly_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  caption text check (caption is null or char_length(caption) <= 280),
  description text check (description is null or char_length(description) <= 3000),
  image_path text,
  image_url text,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(review_text) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Earlier Anand Adda review records used `message` and `is_approved`.
-- Retain those columns and copy their values into the owner-managed review fields.
alter table public.reviews
  add column if not exists rating smallint default 5 check (rating between 1 and 5),
  add column if not exists review_text text,
  add column if not exists status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  add column if not exists updated_at timestamptz not null default now();

do $reviews$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews' and column_name = 'message'
  ) then
    execute $sql$
      update public.reviews
      set rating = coalesce(rating, 5),
          review_text = coalesce(nullif(review_text, ''), message),
          status = coalesce(status, case when is_approved then 'approved' else 'pending' end)
      where rating is null or review_text is null or review_text = '' or status is null
    $sql$;
  end if;
end;
$reviews$;

-- A single settings record powers the public site.
insert into public.store_settings (id)
values (true)
on conflict (id) do nothing;

-- Keep existing product files usable and make their Storage paths available for later cleanup.
-- Older Anand Adda databases use jsonb for image_urls; new installs use text[].
do $migration$
declare
  image_urls_data_type text;
begin
  select data_type into image_urls_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products'
    and column_name = 'image_urls';

  if image_urls_data_type = 'jsonb' then
    execute $sql$
      update public.products
      set image_paths = array(
        select regexp_replace(image_url, '^.*/product-images/', '')
        from jsonb_array_elements_text(coalesce(image_urls, '[]'::jsonb)) as image_url
      )
      where coalesce(array_length(image_paths, 1), 0) = 0
        and jsonb_array_length(coalesce(image_urls, '[]'::jsonb)) > 0
    $sql$;
  else
    execute $sql$
      update public.products
      set image_paths = array(
        select regexp_replace(image_url, '^.*/product-images/', '')
        from unnest(coalesce(image_urls, '{}'::text[])) as image_url
      )
      where coalesce(array_length(image_paths, 1), 0) = 0
        and coalesce(array_length(image_urls, 1), 0) > 0
    $sql$;
  end if;
end;
$migration$;

-- Ensure legacy null values behave as active content rather than hiding existing data.
update public.products set is_active = true where is_active is null;
update public.offers set is_active = true where is_active is null;

alter table public.products alter column is_active set not null;
alter table public.offers alter column is_active set not null;

-- If an older setup accidentally has several active offers, keep the newest one public.
with ranked_offers as (
  select id, row_number() over (order by created_at desc, id desc) as position
  from public.offers
  where is_active = true
)
update public.offers
set is_active = false
where id in (select id from ranked_offers where position > 1);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

drop trigger if exists anand_adda_store_settings_updated_at on public.store_settings;
create trigger anand_adda_store_settings_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

drop trigger if exists anand_adda_products_updated_at on public.products;
create trigger anand_adda_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists anand_adda_offers_updated_at on public.offers;
create trigger anand_adda_offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

drop trigger if exists anand_adda_weekly_updates_updated_at on public.weekly_updates;
create trigger anand_adda_weekly_updates_updated_at
before update on public.weekly_updates
for each row execute function public.set_updated_at();

drop trigger if exists anand_adda_reviews_updated_at on public.reviews;
create trigger anand_adda_reviews_updated_at
before update on public.reviews
for each row execute function public.set_updated_at();

-- This helper is the single authorization check used by tables and Storage policies.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

-- A database trigger guarantees that publishing a new offer retires every older offer.
create or replace function public.keep_only_one_current_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active then
    update public.offers
    set is_active = false
    where is_active = true and id is distinct from new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_only_one_current_offer() from public;

drop trigger if exists anand_adda_only_one_current_offer on public.offers;
create trigger anand_adda_only_one_current_offer
before insert or update of is_active on public.offers
for each row execute function public.keep_only_one_current_offer();

create unique index if not exists anand_adda_one_active_offer
on public.offers ((true))
where is_active = true;

create index if not exists anand_adda_products_active_created_at
on public.products (created_at desc)
where is_active = true;

create index if not exists anand_adda_weekly_updates_active_published_at
on public.weekly_updates (published_at desc)
where is_active = true;

create index if not exists anand_adda_reviews_approved_created_at
on public.reviews (created_at desc)
where status = 'approved';

-- Reviews are submitted through this restricted function. Public visitors cannot set
-- approval status, back-date reviews, or edit/delete someone else's review.
create or replace function public.submit_review(
  p_customer_name text,
  p_rating smallint,
  p_review_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_review_id uuid;
  cleaned_name text := btrim(coalesce(p_customer_name, ''));
  cleaned_text text := btrim(coalesce(p_review_text, ''));
begin
  if char_length(cleaned_name) not between 2 and 80 then
    raise exception 'Please enter a name between 2 and 80 characters.';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Please choose a rating from 1 to 5.';
  end if;
  if char_length(cleaned_text) not between 10 and 1200 then
    raise exception 'Please write a review between 10 and 1200 characters.';
  end if;
  if exists (
    select 1 from public.reviews
    where customer_name = cleaned_name
      and review_text = cleaned_text
      and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'This review was already received. Thank you!';
  end if;

  insert into public.reviews (customer_name, rating, review_text, status)
  values (cleaned_name, p_rating, cleaned_text, 'pending')
  returning id into new_review_id;

  return new_review_id;
end;
$$;

revoke all on function public.submit_review(text, smallint, text) from public;
grant execute on function public.submit_review(text, smallint, text) to anon, authenticated;

-- Buckets are public only for image delivery. Owner-only object policies protect writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('weekly-update-images', 'weekly-update-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('offer-images', 'offer-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Row Level Security: remove prior policies only from Anand Adda's application tables,
-- then replace them with the required public-read/owner-write model.
alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.weekly_updates enable row level security;
alter table public.reviews enable row level security;

do $$
declare policy_item record;
begin
  for policy_item in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'store_settings', 'products', 'offers', 'weekly_updates', 'reviews')
  loop
    execute format('drop policy if exists %I on public.%I', policy_item.policyname, policy_item.tablename);
  end loop;
end;
$$;

create policy "Profiles: read own role"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "Settings: public read"
on public.store_settings for select to anon, authenticated
using (true);
create policy "Settings: owner manage"
on public.store_settings for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "Products: public read active"
on public.products for select to anon, authenticated
using (is_active = true);
create policy "Products: owner manage"
on public.products for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "Offers: public read current"
on public.offers for select to anon, authenticated
using (is_active = true);
create policy "Offers: owner manage"
on public.offers for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "Weekly updates: public read active"
on public.weekly_updates for select to anon, authenticated
using (is_active = true);
create policy "Weekly updates: owner manage"
on public.weekly_updates for all to authenticated
using (public.is_owner()) with check (public.is_owner());

create policy "Reviews: public read approved"
on public.reviews for select to anon, authenticated
using (status = 'approved');
create policy "Reviews: owner manage"
on public.reviews for all to authenticated
using (public.is_owner()) with check (public.is_owner());

-- Remove any older Storage object policies so no permissive legacy rule can bypass
-- the owner check. This changes policies only; it does not remove stored files.
do $$
declare policy_item record;
begin
  for policy_item in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_item.policyname);
  end loop;
end;
$$;

create policy "Anand Adda media: public read"
on storage.objects for select to anon, authenticated
using (bucket_id in ('product-images', 'site-media', 'weekly-update-images', 'offer-images'));

create policy "Anand Adda media: owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('product-images', 'site-media', 'weekly-update-images', 'offer-images')
  and public.is_owner()
);

create policy "Anand Adda media: owner update"
on storage.objects for update to authenticated
using (
  bucket_id in ('product-images', 'site-media', 'weekly-update-images', 'offer-images')
  and public.is_owner()
)
with check (
  bucket_id in ('product-images', 'site-media', 'weekly-update-images', 'offer-images')
  and public.is_owner()
);

create policy "Anand Adda media: owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('product-images', 'site-media', 'weekly-update-images', 'offer-images')
  and public.is_owner()
);

commit;
