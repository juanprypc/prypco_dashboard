-- Fix finalize_reservation_atomic ambiguity on remaining_stock/released_status
-- Qualify columns with table alias to avoid Postgres 42702 errors.

drop function if exists public.finalize_reservation_atomic(text, text);

create or replace function public.finalize_reservation_atomic(
  p_unit_id text,
  p_reserved_by text
)
returns table(
  success boolean,
  remaining_stock integer
) as $$
begin
  return query
    with upd as (
      update public.unit_allocations ua
      set
        reserved_by = null,
        reserved_at = null,
        reserved_ler_code = null,
        reservation_expires_at = null,
        remaining_stock = greatest(coalesce(ua.remaining_stock, 0) - 1, 0),
        released_status = case
          when greatest(coalesce(ua.remaining_stock, 0) - 1, 0) = 0 then 'Not Released'
          else ua.released_status
        end,
        synced_at = now(),
        updated_at = now()
      where ua.id = p_unit_id
        and ua.reserved_by = p_reserved_by
        and (ua.remaining_stock is null or ua.remaining_stock > 0)
      returning ua.remaining_stock
    )
    select true, remaining_stock from upd
    union all
    select false, null
    where not exists (select 1 from upd);
end;
$$ language plpgsql;
