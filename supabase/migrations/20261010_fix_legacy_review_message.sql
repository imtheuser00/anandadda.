-- Safe repair for the existing Anand Adda project.
-- It keeps every existing review and simply makes the obsolete `message` field optional.
-- The current review form saves content in `review_text`.
do $legacy_review_message$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'message'
      and is_nullable = 'NO'
  ) then
    execute 'alter table public.reviews alter column message drop not null';
  end if;
end;
$legacy_review_message$;
