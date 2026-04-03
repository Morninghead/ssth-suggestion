create extension if not exists pgcrypto;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  full_name text not null,
  department text not null,
  production_line text not null default '',
  other_department text not null default '',
  suggestion_type text not null,
  detail text not null,
  cause text not null,
  problem text not null,
  solution text not null,
  before_images text[] not null default '{}',
  after_images text[] not null default '{}',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Completed', 'Rejected')),
  manager_feedback text not null default '',
  after_detail text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists tickets_created_at_idx on public.tickets (created_at desc);

alter table public.tickets enable row level security;

drop policy if exists "Anyone can insert tickets" on public.tickets;
create policy "Anyone can insert tickets"
on public.tickets
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated users can read tickets" on public.tickets;
create policy "Authenticated users can read tickets"
on public.tickets
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can update tickets" on public.tickets;
create policy "Authenticated users can update tickets"
on public.tickets
for update
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can read ticket images" on storage.objects;
create policy "Public can read ticket images"
on storage.objects
for select
to public
using (bucket_id = 'tickets');

drop policy if exists "Anyone can upload ticket images" on storage.objects;
create policy "Anyone can upload ticket images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'tickets');
