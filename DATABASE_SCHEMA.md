# Database Schema

Verified live against Supabase project `H&L_Projects` on 2026-06-04.

Schema: `ideal_trades`

All tables in this schema currently have RLS enabled.

## Current Row Counts

| Table | Rows |
| --- | ---: |
| `users` | 1 |
| `strategies` | 4 |
| `entry_reasons` | 7 |
| `exit_reasons` | 9 |
| `trade_transition_rules` | 14 |
| `trades` | 0 |
| `trade_legs` | 0 |
| `activity_log` | 0 |

## Tables

### `ideal_trades.users`

Purpose: canonical user table for the workspace.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `email` text unique
- `display_name` text nullable
- `role_name` text default `'trader'`
- `is_active` boolean default `true`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Relationships:

- Parent of `strategies.user_id`
- Parent of `entry_reasons.user_id`
- Parent of `exit_reasons.user_id`
- Parent of `trade_transition_rules.user_id`
- Parent of `trades.user_id`
- Parent of `trade_legs.user_id`
- Parent of `activity_log.user_id`

### `ideal_trades.strategies`

Purpose: strategy master records used by the Strategy Master page and EMA Intraday navigation.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `user_id` uuid not null
- `strategy_name` text not null
- `strategy_type` text nullable
- `trade_style` text nullable
- `active` boolean default `true`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `user_id` -> `ideal_trades.users.id`

Child references:

- `entry_reasons.strategy_id`
- `exit_reasons.strategy_id`
- `trade_transition_rules.strategy_id`
- `trades.strategy_id`
- `activity_log.strategy_id`

### `emaintraday.entry_reasons`

Purpose: entry reason master data for EMA Intraday.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `strategy_id` uuid nullable
- `user_id` uuid not null
- `name` text not null
- `category` text not null
- `is_active` boolean default `true`
- `sort_order` integer default `1`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `strategy_id` -> `ideal_trades.strategies.id`
- `user_id` -> `ideal_trades.users.id`

Child references:

- `trade_transition_rules.entry_reason_id`
- `trade_legs.entry_reason_id`

### `emaintraday.exit_reasons`

Purpose: exit reason master data for EMA Intraday.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `strategy_id` uuid nullable
- `user_id` uuid not null
- `name` text not null
- `category` text not null
- `is_active` boolean default `true`
- `sort_order` integer default `1`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `strategy_id` -> `ideal_trades.strategies.id`
- `user_id` -> `ideal_trades.users.id`

Child references:

- `trade_transition_rules.exit_reason_id`
- `trade_transition_rules.other_leg_exit_reason_id`
- `trade_legs.exit_reason_id`

### `emaintraday.trade_transition_rules`

Purpose: rules that map strategy, trigger, exit reason, and leg behavior for EMA Intraday transitions.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `strategy_id` uuid nullable
- `user_id` uuid not null
- `trigger_option` text not null, allowed `CE` or `PE`
- `exit_reason_id` uuid nullable
- `entry_reason_id` uuid nullable
- `category` text not null, allowed `Primary` or `EOD`
- `exit_ce_position` boolean default `true`
- `exit_pe_position` boolean default `true`
- `other_leg_exit_reason_id` uuid nullable
- `create_new_leg` boolean default `true`
- `new_leg_option` text nullable, allowed `CE` or `PE`
- `is_active` boolean default `true`
- `sort_order` integer default `1`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `strategy_id` -> `ideal_trades.strategies.id`
- `user_id` -> `ideal_trades.users.id`
- `exit_reason_id` -> `emaintraday.exit_reasons.id`
- `entry_reason_id` -> `emaintraday.entry_reasons.id`
- `other_leg_exit_reason_id` -> `emaintraday.exit_reasons.id`

Behavior notes:

- The UI resolves `exit_reason_id`, `entry_reason_id`, and `other_leg_exit_reason_id` back to names for display.
- The current live dataset has 14 rules and all 14 belong to a strategy link in practice.

### `ideal_trades.trades`

Purpose: trade header table for the broader trade workflow.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `user_id` uuid not null
- `strategy_id` uuid not null
- `trade_date` date not null
- `track_strike` numeric nullable
- `expiry` date nullable
- `status` text default `'open'`, allowed `open`, `closed`, `cancelled`
- `notes` text nullable
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `user_id` -> `ideal_trades.users.id`
- `strategy_id` -> `ideal_trades.strategies.id`

Child references:

- `trade_legs.trade_id`
- `activity_log.trade_id`

### `ideal_trades.trade_legs`

Purpose: leg-level detail rows for trades.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `trade_id` uuid not null
- `user_id` uuid not null
- `leg_no` integer not null
- `option_side` text not null, allowed `CE` or `PE`
- `trade_strike` numeric nullable
- `quantity` numeric nullable
- `entry_reason_id` uuid nullable
- `exit_reason_id` uuid nullable
- `entry_time` time nullable
- `exit_time` time nullable
- `entry_price` numeric nullable
- `exit_price` numeric nullable
- `pl` numeric nullable
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `trade_id` -> `ideal_trades.trades.id`
- `user_id` -> `ideal_trades.users.id`
- `entry_reason_id` -> `emaintraday.entry_reasons.id`
- `exit_reason_id` -> `emaintraday.exit_reasons.id`

Child references:

- `activity_log.trade_leg_id`

### `ideal_trades.activity_log`

Purpose: audit/event log for trade workflow actions.

Columns:

- `id` uuid primary key, default `extensions.uuid_generate_v4()`
- `user_id` uuid nullable
- `strategy_id` uuid nullable
- `trade_id` uuid nullable
- `trade_leg_id` uuid nullable
- `action` text not null
- `details` jsonb default `'{}'::jsonb`
- `created_at` timestamptz default `now()`
- `updated_at` timestamptz default `now()`

Foreign keys:

- `user_id` -> `ideal_trades.users.id`
- `strategy_id` -> `ideal_trades.strategies.id`
- `trade_id` -> `ideal_trades.trades.id`
- `trade_leg_id` -> `ideal_trades.trade_legs.id`

Behavior notes:

- EMA Intraday transition audits write the `trade_transition_audit` action here.
- The table is currently empty.

## Relationship Summary

- `users` is the root identity table.
- `strategies` belongs to `users`.
- `entry_reasons` and `exit_reasons` belong to both `users` and optionally `strategies`.
- `trade_transition_rules` belongs to `users`, optionally to `strategies`, and links to entry/exit reason rows by foreign key.
- `trades` belongs to `users` and `strategies`.
- `trade_legs` belongs to `trades` and `users`, and can point at entry/exit reasons.
- `activity_log` is the event sink and can reference users, strategies, trades, and trade legs.

## Verification Summary

- `users`: 1 row
- `strategies`: 4 rows
- `entry_reasons`: 7 rows
- `exit_reasons`: 9 rows
- `trade_transition_rules`: 14 rows
- `trades`: 0 rows
- `trade_legs`: 0 rows
- `activity_log`: 0 rows
