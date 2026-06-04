export type MasterTimestamp = string;

export type TransitionTriggerOption = 'CE' | 'PE';
export type TransitionLegOption = 'CE' | 'PE';
export type TransitionRuleCategory = 'Primary' | 'EOD';

export type MasterRowBase = {
  id: string;
  is_active: boolean;
  sort_order: number;
  created_at: MasterTimestamp;
  updated_at: MasterTimestamp;
};

export type EntryReason = MasterRowBase & {
  strategy_id: string | null;
  user_id: string;
  name: string;
  category: string;
};

export type ExitReason = MasterRowBase & {
  strategy_id: string | null;
  user_id: string;
  name: string;
  category: string;
};

export type TradeTransitionRule = MasterRowBase & {
  strategy_id: string | null;
  user_id: string;
  trigger_option: TransitionTriggerOption;
  exit_reason_id: string | null;
  entry_reason_id: string | null;
  other_leg_exit_reason_id: string | null;
  category: TransitionRuleCategory;
  exit_ce_position: boolean;
  exit_pe_position: boolean;
  create_new_leg: boolean;
  new_leg_option: TransitionLegOption | null;
  is_active: boolean;
  sort_order: number;
  exit_reason: string;
  entry_reason: string | null;
  other_leg_exit_reason: string | null;
};

export type TradeTransitionAuditTrail = {
  id: string;
  strategy_id: string | null;
  trigger_option: TransitionTriggerOption;
  exit_reason: string;
  other_leg_exit_reason: string | null;
  entry_reason: string | null;
  event_timestamp: MasterTimestamp;
  created_at: MasterTimestamp;
};

export type ReasonInsert = {
  name: string;
  category: string;
  is_active: boolean;
  sort_order: number;
};

export type ReasonUpdate = Partial<ReasonInsert>;

export type TradeTransitionRuleInsert = {
  strategy_id: string | null;
  trigger_option: TransitionTriggerOption;
  exit_reason: string;
  category: TransitionRuleCategory;
  exit_ce_position: boolean;
  exit_pe_position: boolean;
  other_leg_exit_reason: string | null;
  create_new_leg: boolean;
  new_leg_option: TransitionLegOption | null;
  entry_reason: string | null;
  is_active: boolean;
  sort_order: number;
};

export type TradeTransitionRuleUpdate = Partial<TradeTransitionRuleInsert>;

export type TransitionAuditInsert = {
  strategy_id: string | null;
  trigger_option: TransitionTriggerOption;
  exit_reason: string;
  other_leg_exit_reason: string | null;
  entry_reason: string | null;
  event_timestamp: MasterTimestamp;
};

export type TransitionLegState = {
  is_open: boolean;
  entry_reason: string | null;
  exit_reason: string | null;
};

export type TransitionPortfolioState = Record<TransitionLegOption, TransitionLegState>;

export type TransitionAction = {
  type: 'exit-leg' | 'open-leg';
  leg: TransitionLegOption;
  reason: string | null;
  entry_reason: string | null;
};

export type TradeTransitionPlan = {
  rule: TradeTransitionRule | null;
  actions: TransitionAction[];
  audit: TransitionAuditInsert | null;
};

export type TransitionEngineInput = {
  strategyId?: string | null;
  triggerOption: TransitionTriggerOption;
  exitReason: string;
  portfolio?: TransitionPortfolioState;
  eventTimestamp?: MasterTimestamp;
};
