-- Supabase migration: unit_allocations table for real-time unit availability
-- This table serves as a real-time cache of Airtable's loyalty_unit_allocation table
-- with additional reservation locking mechanism to prevent double-booking

-- Create unit_allocations table
create table if not exists public.unit_allocations (
  -- Core fields from Airtable
  id text primary key,                          -- Airtable record ID
  catalogue_id text,                            -- Link to catalogue item
  unit_type text,
  max_stock integer,
  points integer,
  picture_url text,
  price_aed numeric,
  property_price numeric,
  damac_island_code text,
  br_type text,
  remaining_stock integer,
  plot_area_sqft numeric,
  saleable_area_sqft numeric,
  released_status text,                         -- 'Available' | 'Not Released'

  -- Reservation lock fields
  reserved_by text,                             -- Agent ID who reserved this unit
  reserved_at timestamptz,                      -- When the reservation was created
  reserved_ler_code text,                       -- LER code used for this reservation
  reservation_expires_at timestamptz,           -- Auto-expire after 5 minutes

  -- Metadata
  synced_at timestamptz not null default now(), -- Last sync from Airtable
  updated_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists unit_allocations_catalogue_id_idx
  on public.unit_allocations(catalogue_id);

create index if not exists unit_allocations_released_status_idx
  on public.unit_allocations(released_status);

create index if not exists unit_allocations_reservation_expires_idx
  on public.unit_allocations(reservation_expires_at)
  where reservation_expires_at is not null;

create index if not exists unit_allocations_reserved_by_idx
  on public.unit_allocations(reserved_by)
  where reserved_by is not null;

create index if not exists unit_allocations_damac_island_code_idx
  on public.unit_allocations(damac_island_code)
  where damac_island_code is not null;

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger update_unit_allocations_updated_at
  before update on public.unit_allocations
  for each row
  execute function update_updated_at_column();

-- Function to expire old reservations
create or replace function expire_reservations()
returns table(expired_count bigint) as $$
  with expired as (
    update public.unit_allocations
    set
      reserved_by = null,
      reserved_at = null,
      reserved_ler_code = null,
      reservation_expires_at = null,
      updated_at = now()
    where
      reservation_expires_at is not null
      and reservation_expires_at < now()
    returning id
  )
  select count(*) from expired;
$$ language sql;

-- Function to create a reservation (with atomic check and lock)
create or replace function create_reservation(
  p_unit_id text,
  p_agent_id text,
  p_ler_code text,
  p_duration_minutes integer default 5
)
returns table(
  success boolean,
  message text,
  unit_id text,
  expires_at timestamptz
) as $$
declare
  v_expires_at timestamptz;
  v_current_reserved_by text;
  v_current_expires_at timestamptz;
  v_released_status text;
  v_remaining_stock integer;
begin
  v_expires_at := now() + (p_duration_minutes || ' minutes')::interval;

  -- First, check the current state
  select
    reserved_by,
    reservation_expires_at,
    released_status,
    remaining_stock
  into
    v_current_reserved_by,
    v_current_expires_at,
    v_released_status,
    v_remaining_stock
  from public.unit_allocations
  where id = p_unit_id;

  -- Check if unit exists
  if not found then
    return query select false, 'Unit not found'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  -- Check if unit is released
  if v_released_status != 'Available' then
    return query select false, 'Unit not released'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  -- Check if unit has stock
  if v_remaining_stock is null or v_remaining_stock <= 0 then
    return query select false, 'Unit sold out'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  -- Check if already reserved by someone else (and not expired)
  if v_current_reserved_by is not null
     and v_current_reserved_by != p_agent_id
     and v_current_expires_at > now() then
    return query select false, 'Unit already reserved'::text, p_unit_id, v_current_expires_at;
    return;
  end if;

  -- Try to acquire the reservation lock
  update public.unit_allocations
  set
    reserved_by = p_agent_id,
    reserved_at = now(),
    reserved_ler_code = p_ler_code,
    reservation_expires_at = v_expires_at,
    updated_at = now()
  where id = p_unit_id
    -- Double-check conditions in case of race condition
    and (reserved_by is null or reserved_by = p_agent_id or reservation_expires_at < now())
    and released_status = 'Available'
    and (remaining_stock is not null and remaining_stock > 0);

  if found then
    return query select true, 'Reservation created'::text, p_unit_id, v_expires_at;
  else
    return query select false, 'Failed to acquire reservation lock'::text, p_unit_id, null::timestamptz;
  end if;
end;
$$ language plpgsql;

-- Function to release a reservation
create or replace function release_reservation(
  p_unit_id text,
  p_agent_id text
)
returns boolean as $$
  update public.unit_allocations
  set
    reserved_by = null,
    reserved_at = null,
    reserved_ler_code = null,
    reservation_expires_at = null,
    updated_at = now()
  where id = p_unit_id
    and reserved_by = p_agent_id
  returning true;
$$ language sql;

-- Enable Row Level Security (optional - configure based on your needs)
alter table public.unit_allocations enable row level security;

-- Policy: Allow public read access to unit allocations
create policy "Allow public read access to unit allocations"
  on public.unit_allocations
  for select
  using (true);

-- Policy: Allow service role to insert/update/delete
create policy "Allow service role full access to unit allocations"
  on public.unit_allocations
  for all
  using (auth.role() = 'service_role');

-- Enable real-time for this table
alter publication supabase_realtime add table public.unit_allocations;

-- Comments for documentation
comment on table public.unit_allocations is 'Real-time cache of Airtable unit allocations with reservation locking';
comment on column public.unit_allocations.reserved_by is 'Agent ID who has reserved this unit (5-minute lock)';
comment on column public.unit_allocations.reservation_expires_at is 'When the reservation lock expires';
comment on column public.unit_allocations.released_status is 'Whether unit is Available or Not Released';
comment on function expire_reservations() is 'Expires reservations older than their expiry time';
comment on function create_reservation(text, text, text, integer) is 'Atomically creates a reservation lock on a unit';
comment on function release_reservation(text, text) is 'Releases a reservation lock from a unit';
