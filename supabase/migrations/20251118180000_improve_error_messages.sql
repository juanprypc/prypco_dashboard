-- Improve user-facing error messages for reservation conflicts

drop function if exists public.create_reservation(text, text, text, integer);

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
  expires_at timestamptz,
  reserved_by_agent text
) as $$
declare
  v_expires_at timestamptz;
  v_current_reserved_by text;
  v_current_expires_at timestamptz;
  v_released_status text;
  v_remaining_stock integer;
begin
  v_expires_at := now() + (p_duration_minutes || ' minutes')::interval;

  -- Use FOR UPDATE to lock the row exclusively
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
  for update;

  -- Check if unit exists
  if not found then
    return query select false, 'This unit is no longer available'::text, p_unit_id, null::timestamptz, null::text;
    return;
  end if;

  -- Check if unit is released
  if v_released_status != 'Available' then
    return query select false, 'This unit is not yet available for booking'::text, p_unit_id, null::timestamptz, null::text;
    return;
  end if;

  -- Check if unit has stock
  if v_remaining_stock is null or v_remaining_stock <= 0 then
    return query select false, 'This unit is sold out'::text, p_unit_id, null::timestamptz, null::text;
    return;
  end if;

  -- Check if already reserved by someone else (and not expired)
  if v_current_reserved_by is not null
     and v_current_reserved_by != p_agent_id
     and v_current_expires_at > now() then
    return query select false, 'Another agent is currently selecting this unit. Please choose a different one.'::text, p_unit_id, v_current_expires_at, v_current_reserved_by;
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
    return query select true, 'Reservation created'::text, p_unit_id, v_expires_at, p_agent_id;
  else
    return query select false, 'Unable to reserve this unit. Please try again.'::text, p_unit_id, null::timestamptz, null::text;
  end if;
end;
$$ language plpgsql;

comment on function public.create_reservation(text, text, text, integer) is 
  'Atomically creates a reservation lock on a unit with user-friendly error messages.';
