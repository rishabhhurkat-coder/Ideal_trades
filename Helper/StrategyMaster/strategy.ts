export type Strategy = {
  id: string;
  user_id: string;
  strategy_name: string;
  strategy_type: string | null;
  trade_style: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StrategyFormValues = {
  strategy_name: string;
  strategy_type: string;
  trade_style: string;
  active: boolean;
};

export type StrategyInsert = StrategyFormValues;

export type StrategyUpdate = Partial<StrategyFormValues> & {
  deleted_at?: string | null;
};

export function formatStrategyType(value: string | null | undefined) {
  if (value === 'TRACK_TRADE') return 'Track & Trade';
  if (value === 'TRADE') return 'Trade';
  return value || '-';
}
