-- Fix check_and_reserve_balance to avoid FOR UPDATE with aggregate
-- and keep LER/pending protections intact.

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

  -- Lock matching loyalty point rows, then sum
  select sum(points) into v_total_points
  from (
    select points
    from public.loyalty_points
    where status = 'posted'
      and (expires_at is null or expires_at >= now())
      and (
        (p_agent_id is not null and agent_id = p_agent_id)
        or (p_agent_code is not null and lower(agent_code) = lower(p_agent_code))
      )
    for update
  ) locked_points;
  v_total_points := coalesce(v_total_points, 0);

  -- Sum pending holds (no lock needed; short-lived rows)
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
