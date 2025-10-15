-- Aggregated analytics helpers for admin dashboard
-- Creates three helper functions exposed via Supabase RPC.

create or replace function public.loyalty_admin_overview(points_per_aed numeric default 2)
returns table (
  total_positive_points numeric,
  total_negative_points numeric,
  net_points numeric,
  issued_this_month numeric,
  redeemed_this_month numeric,
  liability_expiring_30 numeric,
  liability_expiring_60 numeric,
  liability_expiring_90 numeric,
  total_cost_aed numeric,
  issued_this_month_cost_aed numeric,
  total_deal_value_aed numeric,
  issued_this_month_deal_value_aed numeric
)
language plpgsql
as $$
declare
  amount_column text;
  sql text;
begin
  select column_name
  into amount_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'loyalty_points'
    and column_name in (
      'source_amount_aed',
      'transaction_amount_aed',
      'deal_amount_aed',
      'source_value_aed'
    )
  limit 1;

  sql := '
    with base as (
      select
        lp.points,
        lp.status,
        lp.created_time,
        lp.expires_at' ||
        case
          when amount_column is not null then
            ', lp.' || quote_ident(amount_column) || ' as amount_aed'
          else
            ', null::numeric as amount_aed'
        end || '
      from public.loyalty_points lp
      where lp.status = ''posted''
    ),
    totals as (
      select
        coalesce(sum(case when points > 0 then points else 0 end), 0)::numeric as total_positive_points,
        coalesce(sum(case when points < 0 then points else 0 end), 0)::numeric as total_negative_points,
        coalesce(sum(points), 0)::numeric as net_points,
        coalesce(sum(case when points > 0 then points / nullif($1, 0) else 0 end), 0)::numeric as total_cost_aed,
        coalesce(sum(case when amount_aed is not null and points > 0 then amount_aed else 0 end), 0)::numeric as total_deal_value_aed
      from base
    ),
    issued_month as (
      select
        coalesce(sum(case when points > 0 then points else 0 end), 0)::numeric as issued_this_month,
        coalesce(sum(case when points < 0 then points else 0 end), 0)::numeric as redeemed_this_month,
        coalesce(sum(case when points > 0 then points / nullif($1, 0) else 0 end), 0)::numeric as issued_this_month_cost_aed,
        coalesce(sum(case when amount_aed is not null and points > 0 then amount_aed else 0 end), 0)::numeric as issued_this_month_deal_value_aed
      from base
      where created_time >= date_trunc(''month'', now())
    ),
    expiring as (
      select
        coalesce(sum(case when points > 0 and expires_at between now() and now() + interval ''30 days'' then points else 0 end), 0)::numeric as liability_expiring_30,
        coalesce(sum(case when points > 0 and expires_at > now() + interval ''30 days'' and expires_at <= now() + interval ''60 days'' then points else 0 end), 0)::numeric as liability_expiring_60,
        coalesce(sum(case when points > 0 and expires_at > now() + interval ''60 days'' and expires_at <= now() + interval ''90 days'' then points else 0 end), 0)::numeric as liability_expiring_90
      from base
    )
    select
      totals.total_positive_points,
      totals.total_negative_points,
      totals.net_points,
      issued_month.issued_this_month,
      issued_month.redeemed_this_month,
      expiring.liability_expiring_30,
      expiring.liability_expiring_60,
      expiring.liability_expiring_90,
      totals.total_cost_aed,
      issued_month.issued_this_month_cost_aed,
      totals.total_deal_value_aed,
      issued_month.issued_this_month_deal_value_aed
    from totals, issued_month, expiring
  ';

  return query execute sql using points_per_aed;
end;
$$;


create or replace function public.loyalty_admin_channel_breakdown(points_per_aed numeric default 2)
returns table (
  channel text,
  positive_points numeric,
  negative_points numeric,
  net_points numeric,
  transaction_count bigint,
  agent_count bigint,
  expiring_30 numeric,
  expiring_60 numeric,
  expiring_90 numeric,
  points_cost_aed numeric,
  deal_value_aed numeric
)
language plpgsql
as $$
declare
  amount_column text;
  sql text;
begin
  select column_name
  into amount_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'loyalty_points'
    and column_name in (
      'source_amount_aed',
      'transaction_amount_aed',
      'deal_amount_aed',
      'source_value_aed'
    )
  limit 1;

  sql := '
    with base as (
      select
        coalesce(nullif(trim(channel), ''''), ''Unattributed'') as channel,
        lp.points,
        lp.status,
        lp.agent_id,
        lp.created_time,
        lp.expires_at' ||
        case
          when amount_column is not null then
            ', lp.' || quote_ident(amount_column) || ' as amount_aed'
          else
            ', null::numeric as amount_aed'
        end || '
      from public.loyalty_points lp
      left join lateral unnest(coalesce(lp.source_channel, array[''Unattributed''])) channel(channel) on true
      where lp.status = ''posted''
    )
    select
      channel,
      coalesce(sum(case when points > 0 then points else 0 end), 0)::numeric as positive_points,
      coalesce(sum(case when points < 0 then points else 0 end), 0)::numeric as negative_points,
      coalesce(sum(points), 0)::numeric as net_points,
      count(*)::bigint as transaction_count,
      count(distinct agent_id)::bigint as agent_count,
      coalesce(sum(case when points > 0 and expires_at between now() and now() + interval ''30 days'' then points else 0 end), 0)::numeric as expiring_30,
      coalesce(sum(case when points > 0 and expires_at > now() + interval ''30 days'' and expires_at <= now() + interval ''60 days'' then points else 0 end), 0)::numeric as expiring_60,
      coalesce(sum(case when points > 0 and expires_at > now() + interval ''60 days'' and expires_at <= now() + interval ''90 days'' then points else 0 end), 0)::numeric as expiring_90,
      coalesce(sum(case when points > 0 then points / nullif($1, 0) else 0 end), 0)::numeric as points_cost_aed,
      coalesce(sum(case when amount_aed is not null and points > 0 then amount_aed else 0 end), 0)::numeric as deal_value_aed
    from base
    group by channel
    order by channel
  ';

  return query execute sql using points_per_aed;
end;
$$;


create or replace function public.loyalty_admin_monthly(points_per_aed numeric default 2, months integer default 12)
returns table (
  month_start date,
  channel text,
  positive_points numeric,
  negative_points numeric,
  net_points numeric,
  points_cost_aed numeric,
  deal_value_aed numeric
)
language plpgsql
as $$
declare
  amount_column text;
  sql text;
begin
  select column_name
  into amount_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'loyalty_points'
    and column_name in (
      'source_amount_aed',
      'transaction_amount_aed',
      'deal_amount_aed',
      'source_value_aed'
    )
  limit 1;

  sql := '
    with base as (
      select
        date_trunc(''month'', lp.created_time)::date as month_start,
        coalesce(nullif(trim(channel), ''''), ''Unattributed'') as channel,
        lp.points,
        lp.status' ||
        case
          when amount_column is not null then
            ', lp.' || quote_ident(amount_column) || ' as amount_aed'
          else
            ', null::numeric as amount_aed'
        end || '
      from public.loyalty_points lp
      left join lateral unnest(coalesce(lp.source_channel, array[''Unattributed''])) channel(channel) on true
      where lp.status = ''posted''
        and lp.created_time >= date_trunc(''month'', now()) - (greatest($2::int, 1) - 1) * interval ''1 month''
    )
    select
      month_start,
      channel,
      coalesce(sum(case when points > 0 then points else 0 end), 0)::numeric as positive_points,
      coalesce(sum(case when points < 0 then points else 0 end), 0)::numeric as negative_points,
      coalesce(sum(points), 0)::numeric as net_points,
      coalesce(sum(case when points > 0 then points / nullif($1, 0) else 0 end), 0)::numeric as points_cost_aed,
      coalesce(sum(case when amount_aed is not null and points > 0 then amount_aed else 0 end), 0)::numeric as deal_value_aed
    from base
    group by month_start, channel
    order by month_start, channel
  ';

  return query execute sql using points_per_aed, months;
end;
$$;
