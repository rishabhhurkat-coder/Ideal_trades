create schema if not exists ideal_trades;

create table if not exists ideal_trades.ema_intraday_candles (
  scrip text not null,
  trade_date date not null,
  trade_time time not null,
  open numeric(18, 6) not null,
  high numeric(18, 6) not null,
  low numeric(18, 6) not null,
  close numeric(18, 6) not null,
  atm integer,
  ema1000 numeric(18, 6),
  ema_interaction text,
  gap_value numeric(18, 6),
  gap_percent numeric(18, 6),
  gap_status text,
  near_ema numeric(18, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ema_intraday_candles_pkey primary key (scrip, trade_date, trade_time)
);

create index if not exists idx_ema_intraday_candles_trade_date_time
  on ideal_trades.ema_intraday_candles (trade_date, trade_time);

create index if not exists idx_ema_intraday_candles_gap_status
  on ideal_trades.ema_intraday_candles (gap_status);

create index if not exists idx_ema_intraday_candles_ema_interaction
  on ideal_trades.ema_intraday_candles (ema_interaction);

create or replace function ideal_trades.set_ema_intraday_candles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ema_intraday_candles_updated_at on ideal_trades.ema_intraday_candles;

create trigger trg_ema_intraday_candles_updated_at
before update on ideal_trades.ema_intraday_candles
for each row
execute function ideal_trades.set_ema_intraday_candles_updated_at();

alter table ideal_trades.ema_intraday_candles enable row level security;

drop policy if exists "read ema intraday candles" on ideal_trades.ema_intraday_candles;

create policy "read ema intraday candles"
on ideal_trades.ema_intraday_candles
for select
to anon, authenticated
using (true);

grant usage on schema ideal_trades to anon, authenticated, service_role;
grant select on table ideal_trades.ema_intraday_candles to anon, authenticated, service_role;
grant insert, update, delete on table ideal_trades.ema_intraday_candles to service_role;
