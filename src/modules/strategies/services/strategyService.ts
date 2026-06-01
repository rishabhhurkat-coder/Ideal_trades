import { supabase } from '../../../lib/supabaseClient';
import type { Strategy, StrategyInsert, StrategyUpdate } from '../types/strategy';

const TABLE = 'strategies';

export async function fetchStrategies(): Promise<Strategy[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .is('deleted_at', null)
    .order('id', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function addStrategy(values: StrategyInsert): Promise<Strategy> {
  const { data, error } = await supabase.from(TABLE).insert(values).select('*').single();

  if (error) throw error;
  return data;
}

export async function editStrategy(id: number, values: StrategyUpdate): Promise<Strategy> {
  const { data, error } = await supabase.from(TABLE).update(values).eq('id', id).select('*').single();

  if (error) throw error;
  return data;
}

export async function setStrategyActive(id: number, active: boolean): Promise<Strategy> {
  return editStrategy(id, { active });
}

export async function softDeleteStrategy(id: number): Promise<Strategy> {
  return editStrategy(id, {
    active: false,
    deleted_at: new Date().toISOString(),
  });
}
