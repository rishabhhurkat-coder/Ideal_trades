import { supabase } from './supabaseClient';

export const IDEAL_TRADES_SCHEMA = 'ideal_trades';
export const DEFAULT_USER_ID = '5f2e4d5f-0f72-4bbd-99bb-49d1c4d2d3a1';
export const DEFAULT_USER_EMAIL = 'ideal-trades@local.dev';
export const DEFAULT_USER_NAME = 'Ideal Trades';

export function idealTradesSchema() {
  if (typeof (supabase as { schema?: (name: string) => unknown }).schema === 'function') {
    return (supabase as { schema: (name: string) => { from: (table: string) => any } }).schema(IDEAL_TRADES_SCHEMA);
  }

  return {
    from: (table: string) => supabase.from(table),
  };
}

export async function ensureDefaultUserId() {
  const users = idealTradesSchema().from('users');
  const { data, error } = await users.select('id').eq('email', DEFAULT_USER_EMAIL).limit(1);
  if (error) throw error;

  const existingUser = Array.isArray(data) ? (data[0] as { id?: string } | undefined) : undefined;
  if (existingUser?.id) return existingUser.id;

  const { data: inserted, error: insertError } = await users
    .insert({
      id: DEFAULT_USER_ID,
      email: DEFAULT_USER_EMAIL,
      display_name: DEFAULT_USER_NAME,
      role_name: 'trader',
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  return (inserted as { id: string }).id;
}
