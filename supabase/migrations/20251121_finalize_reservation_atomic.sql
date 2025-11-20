-- Atomic reservation finalization with server-side stock decrement
-- Ensures remaining_stock is decremented in-database and the reservation is cleared only if the row is still reserved by the caller.

drop function if exists public.finalize_reservation_atomic(text, text);

create or replace function public.finalize_reservation_atomic(
  p_unit_id text,
  p_reserved_by text
)
returns table(
  success boolean,
  remaining_stock integer
) as $$
declare
  v_remaining integer;
begin
  with upd as (
    update public.unit_allocations
    set
      reserved_by = null,
      reserved_at = null,
      reserved_ler_code = null,
      reservation_expires_at = null,
      remaining_stock = greatest(coalesce(remaining_stock, 0) - 1, 0),
      released_status = case when greatest(coalesce(remaining_stock, 0) - 1, 0) = 0 then 'Not Released' else released_status end,
      synced_at = now(),
      updated_at = now()
    where id = p_unit_id
      and reserved_by = p_reserved_by
      and (remaining_stock is null or remaining_stock > 0)
    returning remaining_stock
  )
  select remaining_stock into v_remaining from upd;

  if v_remaining is not null then
    return query select true, v_remaining;
  else
    return query select false, null::integer;
  end if;
end;
$$ language plpgsql;
