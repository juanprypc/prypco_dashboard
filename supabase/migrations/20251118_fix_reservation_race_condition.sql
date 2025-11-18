-- Fix critical race condition in create_reservation function
-- Bug: SELECT-then-UPDATE allows 2 users to reserve same unit with different LERs
-- Fix: Use SELECT...FOR UPDATE to acquire exclusive lock before checking/updating

-- Drop the old function
drop function if exists public.create_reservation(text, text, text, integer);

-- Create the fixed version with proper locking
create or replace function public.create_reservation(
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

  -- CRITICAL FIX: Use FOR UPDATE to lock the row exclusively
  -- This prevents concurrent transactions from reading the same state
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
  where id = p_unit_id
  for update;  -- <-- ADDED: Exclusive lock on this row

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

  -- Now update (we already hold the lock, so this is safe)
  update public.unit_allocations
  set
    reserved_by = p_agent_id,
    reserved_at = now(),
    reserved_ler_code = p_ler_code,
    reservation_expires_at = v_expires_at,
    updated_at = now()
  where id = p_unit_id;

  -- The update should always succeed since we hold the lock and passed all checks
  if found then
    return query select true, 'Reservation created'::text, p_unit_id, v_expires_at;
  else
    -- This should never happen, but handle it gracefully
    return query select false, 'Failed to acquire reservation lock'::text, p_unit_id, null::timestamptz;
  end if;
end;
$$ language plpgsql;

-- Add comment explaining the fix
comment on function public.create_reservation(text, text, text, integer) is 
  'Atomically creates a reservation lock on a unit. Uses SELECT...FOR UPDATE to prevent race conditions where 2 users could reserve the same unit simultaneously.';
