-- Enforce single-use LER across pending redemptions and reservations
-- 1) Unique constraint on active pending LERs
-- 2) Guard in balance reservation to block duplicate LER
-- 3) Guard in reservation function to block duplicate LER across units

-- Unique index (pending redemptions)
create unique index if not exists pending_redemptions_ler_code_unique
  on public.pending_redemptions (ler_code)
  where ler_code is not null;

-- Recreate check_and_reserve_balance with LER guard and cleanup of expired pendings
drop function if exists public.check_and_reserve_balance(text, text, integer, text, text);

create or replace function public.check_and_reserve_balance(
  p_agent_id text,
  p_agent_code text,
  p_required_points integer,
  p_unit_allocation_id text default null,
  p_ler_code text default null
)
returns table(
  success boolean,
  message text,
  pending_id uuid,
  available_balance integer,
  required_points integer
) as $$
declare
  v_total_points integer;
  v_pending_points integer;
  v_available integer;
  v_new_pending_id uuid;
  v_normalised_ler text;
begin
  -- Clean up expired pending holds so the unique index doesn't block fresh requests
  perform public.expire_pending_redemptions();

  v_normalised_ler := case
    when p_ler_code is null then null
    else trim(p_ler_code)
  end;

  -- Block duplicate LER while a pending hold exists
  if v_normalised_ler is not null then
    perform 1 from public.pending_redemptions
    where ler_code = v_normalised_ler
      and expires_at > now()
    limit 1;
    if found then
      return query select
        false,
        'This LER is already being processed. Please try a different LER.'::text,
        null::uuid,
        null::integer,
        p_required_points;
      return;
    end if;
  end if;

  -- Lock and calculate total posted points for this agent
  select coalesce(sum(points), 0) into v_total_points
  from public.loyalty_points
  where status = 'posted'
    and (expires_at is null or expires_at >= now())
    and (
      (p_agent_id is not null and agent_id = p_agent_id)
      or (p_agent_code is not null and lower(agent_code) = lower(p_agent_code))
    )
  for update;

  -- Calculate pending points (already reserved by other in-flight requests)
  select coalesce(sum(points), 0) into v_pending_points
  from public.pending_redemptions
  where expires_at > now()
    and (
      (p_agent_id is not null and agent_id = p_agent_id)
      or (p_agent_code is not null and lower(agent_code) = lower(p_agent_code))
    );

  -- Calculate available balance
  v_available := v_total_points - v_pending_points;

  if v_available < p_required_points then
    return query select
      false,
      'Insufficient balance'::text,
      null::uuid,
      v_available,
      p_required_points;
    return;
  end if;

  -- Reserve the points by creating a pending redemption
  insert into public.pending_redemptions (
    agent_id,
    agent_code,
    points,
    unit_allocation_id,
    ler_code
  )
  values (
    p_agent_id,
    p_agent_code,
    p_required_points,
    p_unit_allocation_id,
    v_normalised_ler
  )
  returning id into v_new_pending_id;

  return query select
    true,
    'Balance reserved'::text,
    v_new_pending_id,
    v_available,
    p_required_points;
end;
$$ language plpgsql;

-- Recreate create_reservation with LER collision protection
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
  expires_at timestamptz
) as $$
declare
  v_expires_at timestamptz;
  v_current_reserved_by text;
  v_current_expires_at timestamptz;
  v_released_status text;
  v_remaining_stock integer;
  v_ler_conflict text;
begin
  v_expires_at := now() + (p_duration_minutes || ' minutes')::interval;

  -- Check for active reservation using the same LER on any unit
  select id into v_ler_conflict
  from public.unit_allocations
  where reserved_ler_code = p_ler_code
    and reservation_expires_at is not null
    and reservation_expires_at > now()
    and id <> p_unit_id
  limit 1;

  if v_ler_conflict is not null then
    return query select false, 'This LER is already reserved on another unit.'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  -- Lock the target unit row
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

  if not found then
    return query select false, 'This unit is no longer available'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  if v_released_status != 'Available' then
    return query select false, 'This unit is not yet available for booking'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  if v_remaining_stock is null or v_remaining_stock <= 0 then
    return query select false, 'This unit is sold out'::text, p_unit_id, null::timestamptz;
    return;
  end if;

  if v_current_reserved_by is not null
     and v_current_reserved_by != p_agent_id
     and v_current_expires_at > now() then
    return query select false, 'Another agent is currently selecting this unit. Please choose a different one.'::text, p_unit_id, v_current_expires_at;
    return;
  end if;

  update public.unit_allocations
  set
    reserved_by = p_agent_id,
    reserved_at = now(),
    reserved_ler_code = p_ler_code,
    reservation_expires_at = v_expires_at,
    updated_at = now()
  where id = p_unit_id;

  if found then
    return query select true, 'Reservation created'::text, p_unit_id, v_expires_at;
  else
    return query select false, 'Unable to reserve this unit. Please try again.'::text, p_unit_id, null::timestamptz;
  end if;
end;
$$ language plpgsql;
