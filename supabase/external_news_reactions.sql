-- Enable reactions for imported (external) news without changing local reactions.
create table if not exists public.external_news_likes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.imported_news(id) on delete cascade,
  visitor_token text not null check (length(visitor_token) between 20 and 100),
  created_at timestamptz not null default now(),
  unique (article_id, visitor_token)
);
alter table public.external_news_likes enable row level security;
grant select, insert on public.external_news_likes to anon, authenticated;
drop policy if exists "Public can read external news likes" on public.external_news_likes;
create policy "Public can read external news likes" on public.external_news_likes for select to anon, authenticated using (true);
drop policy if exists "Visitors can like published external news" on public.external_news_likes;
create policy "Visitors can like published external news" on public.external_news_likes for insert to anon, authenticated
with check (length(visitor_token) between 20 and 100 and exists (
  select 1 from public.imported_news n where n.id = article_id and n.is_published = true
));

create table if not exists public.external_news_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.imported_news(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  content text not null check (char_length(content) between 3 and 1200),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index if not exists external_news_comments_article_status_created_idx
  on public.external_news_comments(article_id, status, created_at desc);
create index if not exists external_news_comments_pending_created_idx
  on public.external_news_comments(created_at) where status = 'pending';
alter table public.external_news_comments enable row level security;
grant select, insert, update, delete on public.external_news_comments to anon, authenticated;
drop policy if exists "Public can read approved external comments and admins all" on public.external_news_comments;
create policy "Public can read approved external comments and admins all" on public.external_news_comments for select to anon, authenticated
using (status = 'approved' or exists (select 1 from public.admins ad where ad.user_id = (select auth.uid())));
drop policy if exists "Visitors can submit pending external comments" on public.external_news_comments;
create policy "Visitors can submit pending external comments" on public.external_news_comments for insert to anon, authenticated
with check (status = 'pending' and reviewed_at is null and reviewed_by is null
  and char_length(display_name) between 2 and 60 and char_length(content) between 3 and 1200
  and exists (select 1 from public.imported_news n where n.id = article_id and n.is_published = true));
drop policy if exists "Admins can review external comments" on public.external_news_comments;
create policy "Admins can review external comments" on public.external_news_comments for update to authenticated
using (exists (select 1 from public.admins ad where ad.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins ad where ad.user_id = (select auth.uid()))
  and status in ('pending','approved','rejected'));
drop policy if exists "Admins can delete external comments" on public.external_news_comments;
create policy "Admins can delete external comments" on public.external_news_comments for delete to authenticated
using (exists (select 1 from public.admins ad where ad.user_id = (select auth.uid())));
