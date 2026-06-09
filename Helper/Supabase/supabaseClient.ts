import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function createUnavailableSupabaseClient(): any {
  const unavailableError = new Error('Supabase is not configured.');

  function createUnavailableSchemaClient() {
    return {
      from() {
        return createUnavailableSupabaseClient().from();
      },
    };
  }

  return {
    from() {
      return {
        async select() {
          return { data: null, error: unavailableError };
        },
        async insert() {
          return { data: null, error: unavailableError };
        },
        async upsert() {
          return { data: null, error: unavailableError };
        },
        async delete() {
          return {
            async eq() {
              return { data: null, error: unavailableError };
            },
            async in() {
              return { data: null, error: unavailableError };
            },
          };
        },
        update() {
          return {
            async eq() {
              return { data: null, error: unavailableError };
            },
          };
        },
      };
    },
    schema() {
      return createUnavailableSchemaClient();
    },
  };
}

export const supabase: any = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : createUnavailableSupabaseClient();
