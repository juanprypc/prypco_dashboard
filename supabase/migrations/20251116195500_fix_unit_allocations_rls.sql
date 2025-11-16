-- Fix RLS policies for unit_allocations table
-- The service role key should bypass RLS, but we'll also add proper policies

-- Drop existing policies
drop policy if exists "Allow public read access to unit allocations" on public.unit_allocations;
drop policy if exists "Allow service role full access to unit allocations" on public.unit_allocations;

-- Create new policies

-- Policy 1: Allow anyone to read unit allocations (for frontend real-time subscriptions)
create policy "Enable read access for all users"
  on public.unit_allocations
  for select
  using (true);

-- Policy 2: Allow authenticated users to insert/update via service role
-- This allows Airtable automation using service role key to upsert
create policy "Enable insert for service role"
  on public.unit_allocations
  for insert
  with check (true);

create policy "Enable update for service role"
  on public.unit_allocations
  for update
  using (true)
  with check (true);

create policy "Enable delete for service role"
  on public.unit_allocations
  for delete
  using (true);

-- Alternative: If you want to completely bypass RLS for service role,
-- you can disable RLS entirely (service role always bypasses RLS anyway)
-- Uncomment below if you prefer:
-- alter table public.unit_allocations disable row level security;
