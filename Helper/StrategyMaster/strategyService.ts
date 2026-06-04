import { ensureDefaultUserId, idealTradesSchema } from '../Supabase/idealTrades';
import type { Strategy, StrategyInsert, StrategyUpdate } from './strategy';

const TABLE = 'strategies';

function isDev() {
  return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
}

function logSupabase(message: string, details?: Record<string, unknown>) {
  if (!isDev()) return;
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
}

function getStrategiesQuery() {
  return idealTradesSchema().from(TABLE);
}

function normalizeStrategyRow(row: Partial<Strategy> | null | undefined): Strategy | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.strategy_name !== 'string') return null;

  return {
    id: row.id,
    user_id: row.user_id,
    strategy_name: row.strategy_name,
    strategy_type: typeof row.strategy_type === 'string' ? row.strategy_type : null,
    trade_style: typeof row.trade_style === 'string' ? row.trade_style : null,
    active: Boolean(row.active),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

function sortStrategies(strategies: Strategy[]) {
  return [...strategies].sort((current, next) => {
    const currentTime = current.created_at || '';
    const nextTime = next.created_at || '';
    return currentTime.localeCompare(nextTime) || current.strategy_name.localeCompare(next.strategy_name);
  });
}

async function loadStrategiesFromSupabase() {
  const { data, error } = await getStrategiesQuery().select('*').order('created_at', { ascending: true });
  if (error) throw error;

  const normalized = (data ?? [])
    .map((row: unknown) => normalizeStrategyRow(row as Partial<Strategy>))
    .filter((row: Strategy | null): row is Strategy => row !== null);
  return sortStrategies(normalized);
}

async function ensureUserId() {
  return ensureDefaultUserId();
}

async function insertStrategy(values: StrategyInsert): Promise<Strategy> {
  const userId = await ensureUserId();
  const { data, error } = await getStrategiesQuery()
    .insert({
      user_id: userId,
      ...values,
    })
    .select('*')
    .single();

  if (error) throw error;

  const created = normalizeStrategyRow(data as Partial<Strategy>);
  if (!created) throw new Error('Unable to normalize created strategy.');
  logSupabase('[SUPABASE] strategy created', { id: created.id, strategy_name: created.strategy_name });
  return created;
}

async function updateStrategyRow(id: string, values: StrategyUpdate): Promise<Strategy> {
  const { data, error } = await getStrategiesQuery().update(values).eq('id', id).select('*').single();
  if (error) throw error;

  const updated = normalizeStrategyRow(data as Partial<Strategy>);
  if (!updated) throw new Error('Unable to normalize updated strategy.');
  logSupabase('[SUPABASE] strategy updated', { id: updated.id, strategy_name: updated.strategy_name });
  return updated;
}

async function deleteStrategyRow(id: string): Promise<void> {
  const { error } = await getStrategiesQuery().delete().eq('id', id);
  if (error) throw error;
  logSupabase('[SUPABASE] strategy deleted', { id });
}

export async function loadStrategies(): Promise<Strategy[]> {
  const strategies = await loadStrategiesFromSupabase();
  logSupabase('[SUPABASE] strategies loaded', { count: strategies.length });
  return strategies;
}

export async function createStrategy(values: StrategyInsert): Promise<Strategy> {
  return insertStrategy(values);
}

export async function updateStrategy(id: string, values: StrategyUpdate): Promise<Strategy> {
  return updateStrategyRow(id, values);
}

export async function deleteStrategy(id: string): Promise<void> {
  await deleteStrategyRow(id);
}

export async function setStrategyActive(id: string, active: boolean): Promise<Strategy> {
  return updateStrategy(id, { active });
}

export async function fetchStrategies(): Promise<Strategy[]> {
  return loadStrategies();
}

export async function addStrategy(values: StrategyInsert): Promise<Strategy> {
  return createStrategy(values);
}

export async function editStrategy(id: string, values: StrategyUpdate): Promise<Strategy> {
  return updateStrategy(id, values);
}

export async function softDeleteStrategy(id: string): Promise<Strategy> {
  const strategies = await loadStrategiesFromSupabase();
  const deleted = strategies.find((strategy) => strategy.id === id) ?? null;
  await deleteStrategyRow(id);

  if (deleted) return deleted;

  const now = new Date().toISOString();
  return {
    id,
    user_id: await ensureUserId(),
    strategy_name: 'Deleted Strategy',
    strategy_type: null,
    trade_style: null,
    active: false,
    created_at: now,
    updated_at: now,
  };
}
