-- Create a table to manage admin access requests
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

-- Enable RLS
alter table public.admin_profiles enable row level security;

-- Master Admin Check Function (already exists, but let's ensure it's used)
-- We'll use the hardcoded master email to define who can manage other admins

-- Policy: Anyone logged in can read their own profile
create policy "Users can read own profile"
on public.admin_profiles
for select
to authenticated
using (auth.uid() = id);

-- Policy: Anyone logged in can create their own profile (request access)
create policy "Users can create own profile"
on public.admin_profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Policy: Master admin can manage all profiles
create policy "Master admin can manage profiles"
on public.admin_profiles
for all
to authenticated
using (public.is_primary_admin());

-- Update ticket policies to allow approved admins too
drop policy if exists "Primary admin can read tickets" on public.tickets;
create policy "Approved admins can read tickets"
on public.tickets
for select
to authenticated
using (
  public.is_primary_admin() 
  or exists (
    select 1 from public.admin_profiles 
    where id = auth.uid() and status = 'approved'
  )
);

drop policy if exists "Primary admin can update tickets" on public.tickets;
create policy "Approved admins can update tickets"
on public.tickets
for update
to authenticated
using (
  public.is_primary_admin() 
  or exists (
    select 1 from public.admin_profiles 
    where id = auth.uid() and status = 'approved'
  )
)
with check (
  public.is_primary_admin() 
  or exists (
    select 1 from public.admin_profiles 
    where id = auth.uid() and status = 'approved'
  )
);
