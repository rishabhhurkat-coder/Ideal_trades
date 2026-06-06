import { emaIntradaySchema, ensureDefaultUserId } from '../../../Helper/Supabase/idealTrades';
import type {
  EntryReason,
  ExitReason,
  ReasonInsert,
  TradeTransitionAuditTrail,
  TradeTransitionRule,
  TradeTransitionRuleInsert,
  TransitionAuditInsert,
  TransitionEngineInput,
  TransitionLegOption,
  TransitionPortfolioState,
  TradeTransitionPlan,
  TransitionTriggerOption,
} from './masters';

const ENTRY_REASONS_TABLE = 'entry_reasons';
const EXIT_REASONS_TABLE = 'exit_reasons';
const TRANSITION_RULES_TABLE = 'trade_transition_rules';
const ACTIVITY_LOG_TABLE = 'activity_log';
const TRANSITION_AUDIT_ACTION = 'trade_transition_audit';
const DEFAULT_MASTER_STRATEGY_ID = 'b7e08d6f-58d5-4fd6-9a85-9f6f53b1d001';

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function schemaTable(tableName: string) {
  return emaIntradaySchema().from(tableName);
}

function sortAuditTrail(rows: TradeTransitionAuditTrail[]) {
  return [...rows].sort((current, next) => next.event_timestamp.localeCompare(current.event_timestamp));
}

function sortReasons<T extends { sort_order: number; name: string }>(rows: T[]) {
  return [...rows].sort((current, next) => current.sort_order - next.sort_order || current.name.localeCompare(next.name));
}

function sortTransitionRules(rows: TradeTransitionRule[]) {
  return [...rows].sort((current, next) => current.sort_order - next.sort_order || current.exit_reason.localeCompare(next.exit_reason));
}

type ReasonRowLike = {
  id: string;
  strategy_id: string | null;
  user_id: string;
  name: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function normalizeReasonRowBase(row: Record<string, unknown>): ReasonRowLike | null {
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.name !== 'string') return null;

  return {
    id: row.id,
    strategy_id: typeof row.strategy_id === 'string' || row.strategy_id === null ? (row.strategy_id as string | null) : null,
    user_id: row.user_id,
    name: row.name,
    category: typeof row.category === 'string' ? row.category : '',
    is_active: Boolean(row.is_active),
    sort_order: typeof row.sort_order === 'number' && Number.isFinite(row.sort_order) ? row.sort_order : 1,
    created_at: typeof row.created_at === 'string' ? row.created_at : nowIso(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : nowIso(),
  };
}

function normalizeEntryReasonRow(row: Record<string, unknown>): EntryReason | null {
  const normalized = normalizeReasonRowBase(row);
  return normalized
    ? {
        ...normalized,
      }
    : null;
}

function normalizeExitReasonRow(row: Record<string, unknown>): ExitReason | null {
  const normalized = normalizeReasonRowBase(row);
  return normalized
    ? {
        ...normalized,
      }
    : null;
}

function reasonLookupMap(rows: Array<{ id: string; name: string }>) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

function normalizeTransitionRuleRow(
  row: Record<string, unknown>,
  entryReasonsById: Map<string, string>,
  exitReasonsById: Map<string, string>,
): TradeTransitionRule | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string' || typeof row.user_id !== 'string' || typeof row.trigger_option !== 'string') return null;

  const exitReasonId = typeof row.exit_reason_id === 'string' ? row.exit_reason_id : null;
  const entryReasonId = typeof row.entry_reason_id === 'string' ? row.entry_reason_id : null;
  const otherLegExitReasonId = typeof row.other_leg_exit_reason_id === 'string' ? row.other_leg_exit_reason_id : null;

  return {
    id: row.id,
    strategy_id: typeof row.strategy_id === 'string' || row.strategy_id === null ? row.strategy_id : null,
    user_id: row.user_id,
    trigger_option: row.trigger_option === 'CE' || row.trigger_option === 'PE' ? row.trigger_option : 'CE',
    exit_reason_id: exitReasonId,
    entry_reason_id: entryReasonId,
    other_leg_exit_reason_id: otherLegExitReasonId,
    category: row.category === 'Primary' || row.category === 'EOD' ? row.category : 'Primary',
    exit_ce_position: Boolean(row.exit_ce_position),
    exit_pe_position: Boolean(row.exit_pe_position),
    create_new_leg: Boolean(row.create_new_leg),
    new_leg_option: row.new_leg_option === 'CE' || row.new_leg_option === 'PE' ? row.new_leg_option : null,
    is_active: Boolean(row.is_active),
    sort_order: Number.isFinite(row.sort_order as number) ? Number(row.sort_order) : 1,
    exit_reason: exitReasonId ? exitReasonsById.get(exitReasonId) ?? '' : '',
    entry_reason: entryReasonId ? entryReasonsById.get(entryReasonId) ?? null : null,
    other_leg_exit_reason: otherLegExitReasonId ? exitReasonsById.get(otherLegExitReasonId) ?? null : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : nowIso(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : nowIso(),
  };
}

async function ensureUserId() {
  return ensureDefaultUserId();
}

async function loadEntryReasonsFromSupabase() {
  const { data, error } = await schemaTable(ENTRY_REASONS_TABLE).select('*').order('sort_order', { ascending: true });
  if (error) throw error;

  const rows: EntryReason[] = (data ?? [])
    .map((row: unknown) => normalizeEntryReasonRow(row as Record<string, unknown>))
    .filter((row: EntryReason | null): row is EntryReason => row !== null);
  return sortReasons(rows);
}

async function loadExitReasonsFromSupabase() {
  const { data, error } = await schemaTable(EXIT_REASONS_TABLE).select('*').order('sort_order', { ascending: true });
  if (error) throw error;

  const rows: ExitReason[] = (data ?? [])
    .map((row: unknown) => normalizeExitReasonRow(row as Record<string, unknown>))
    .filter((row: ExitReason | null): row is ExitReason => row !== null);
  return sortReasons(rows);
}

async function loadTransitionRulesFromSupabase() {
  const [entryReasons, exitReasons, rulesResult] = await Promise.all([
    loadEntryReasonsFromSupabase(),
    loadExitReasonsFromSupabase(),
    schemaTable(TRANSITION_RULES_TABLE).select('*').order('sort_order', { ascending: true }),
  ]);

  if (rulesResult.error) throw rulesResult.error;

  const entryLookup = reasonLookupMap(entryReasons);
  const exitLookup = reasonLookupMap(exitReasons);

  const rows: TradeTransitionRule[] = (rulesResult.data ?? [])
    .map((row: unknown) => normalizeTransitionRuleRow(row as Record<string, unknown>, entryLookup, exitLookup))
    .filter((row: TradeTransitionRule | null): row is TradeTransitionRule => row !== null);

  return sortTransitionRules(rows);
}

function resolveReasonId(rows: Array<EntryReason | ExitReason>, name: string | null) {
  if (!name) return null;
  return rows.find((row) => row.name === name)?.id ?? null;
}

async function resolveTransitionRulePayload(values: TradeTransitionRuleInsert) {
  const [entryReasons, exitReasons, userId] = await Promise.all([
    loadEntryReasonsFromSupabase(),
    loadExitReasonsFromSupabase(),
    ensureUserId(),
  ]);

  const exitReasonId = resolveReasonId(exitReasons, values.exit_reason);
  if (!exitReasonId) throw new Error(`Exit reason "${values.exit_reason}" was not found.`);

  const entryReasonId = resolveReasonId(entryReasons, values.entry_reason);
  const otherLegExitReasonId = resolveReasonId(exitReasons, values.other_leg_exit_reason);

  return {
    user_id: userId,
    strategy_id: values.strategy_id ?? DEFAULT_MASTER_STRATEGY_ID,
    trigger_option: values.trigger_option,
    exit_reason_id: exitReasonId,
    entry_reason_id: entryReasonId,
    category: values.category,
    exit_ce_position: values.exit_ce_position,
    exit_pe_position: values.exit_pe_position,
    other_leg_exit_reason_id: otherLegExitReasonId,
    create_new_leg: values.create_new_leg,
    new_leg_option: values.new_leg_option,
    is_active: values.is_active,
    sort_order: values.sort_order,
  };
}

export async function fetchEntryReasons() {
  return loadEntryReasonsFromSupabase();
}

export async function saveEntryReason(id: string | null, values: ReasonInsert) {
  const userId = await ensureUserId();
  const payload = {
    strategy_id: DEFAULT_MASTER_STRATEGY_ID,
    user_id: userId,
    ...values,
  };

  if (id) {
    const { data, error } = await schemaTable(ENTRY_REASONS_TABLE)
      .update({ ...payload, updated_at: nowIso() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    const normalized = normalizeEntryReasonRow(data as Record<string, unknown>);
    if (!normalized) throw new Error(`Entry reason ${id} was not found.`);
    return normalized as EntryReason;
  }

  const { data, error } = await schemaTable(ENTRY_REASONS_TABLE).insert(payload).select('*').single();
  if (error) throw error;
  const normalized = normalizeEntryReasonRow(data as Record<string, unknown>);
  if (!normalized) throw new Error('Unable to normalize created entry reason.');
  return normalized as EntryReason;
}

export async function deleteEntryReason(id: string) {
  const { error } = await schemaTable(ENTRY_REASONS_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function toggleEntryReasonActive(id: string, isActive: boolean) {
  const { data, error } = await schemaTable(ENTRY_REASONS_TABLE)
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const normalized = normalizeEntryReasonRow(data as Record<string, unknown>);
  if (!normalized) throw new Error(`Entry reason ${id} was not found.`);
  return normalized as EntryReason;
}

export async function fetchExitReasons() {
  return loadExitReasonsFromSupabase();
}

export async function saveExitReason(id: string | null, values: ReasonInsert) {
  const userId = await ensureUserId();
  const payload = {
    strategy_id: DEFAULT_MASTER_STRATEGY_ID,
    user_id: userId,
    ...values,
  };

  if (id) {
    const { data, error } = await schemaTable(EXIT_REASONS_TABLE)
      .update({ ...payload, updated_at: nowIso() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    const normalized = normalizeExitReasonRow(data as Record<string, unknown>);
    if (!normalized) throw new Error(`Exit reason ${id} was not found.`);
    return normalized as ExitReason;
  }

  const { data, error } = await schemaTable(EXIT_REASONS_TABLE).insert(payload).select('*').single();
  if (error) throw error;
  const normalized = normalizeExitReasonRow(data as Record<string, unknown>);
  if (!normalized) throw new Error('Unable to normalize created exit reason.');
  return normalized as ExitReason;
}

export async function deleteExitReason(id: string) {
  const { error } = await schemaTable(EXIT_REASONS_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function toggleExitReasonActive(id: string, isActive: boolean) {
  const { data, error } = await schemaTable(EXIT_REASONS_TABLE)
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const normalized = normalizeExitReasonRow(data as Record<string, unknown>);
  if (!normalized) throw new Error(`Exit reason ${id} was not found.`);
  return normalized as ExitReason;
}

export async function fetchTradeTransitionRules() {
  return loadTransitionRulesFromSupabase();
}

export async function saveTradeTransitionRule(id: string | null, values: TradeTransitionRuleInsert) {
  const payload = await resolveTransitionRulePayload(values);

  if (id) {
    const { data, error } = await schemaTable(TRANSITION_RULES_TABLE)
      .update({ ...payload, updated_at: nowIso() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    const [entryReasons, exitReasons] = await Promise.all([loadEntryReasonsFromSupabase(), loadExitReasonsFromSupabase()]);
    const normalized = normalizeTransitionRuleRow(
      data as Record<string, unknown>,
      reasonLookupMap(entryReasons),
      reasonLookupMap(exitReasons),
    );
    if (!normalized) throw new Error(`Rule ${id} was not found.`);
    return normalized;
  }

  const { data, error } = await schemaTable(TRANSITION_RULES_TABLE).insert(payload).select('*').single();
  if (error) throw error;

  const [entryReasons, exitReasons] = await Promise.all([loadEntryReasonsFromSupabase(), loadExitReasonsFromSupabase()]);
  const normalized = normalizeTransitionRuleRow(
    data as Record<string, unknown>,
    reasonLookupMap(entryReasons),
    reasonLookupMap(exitReasons),
  );
  if (!normalized) throw new Error('Unable to normalize created trade transition rule.');
  return normalized;
}

export async function deleteTradeTransitionRule(id: string) {
  const { error } = await schemaTable(TRANSITION_RULES_TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function toggleTradeTransitionRuleActive(id: string, isActive: boolean) {
  const { data, error } = await schemaTable(TRANSITION_RULES_TABLE)
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  const [entryReasons, exitReasons] = await Promise.all([loadEntryReasonsFromSupabase(), loadExitReasonsFromSupabase()]);
  const normalized = normalizeTransitionRuleRow(
    data as Record<string, unknown>,
    reasonLookupMap(entryReasons),
    reasonLookupMap(exitReasons),
  );
  if (!normalized) throw new Error(`Rule ${id} was not found.`);
  return normalized;
}

function matchesStrategy(ruleStrategyId: string | null, strategyId: string | null) {
  if (strategyId) return ruleStrategyId === strategyId || ruleStrategyId === null;
  return ruleStrategyId === null;
}

function resolvePortfolio(inputPortfolio?: Partial<TransitionPortfolioState>): TransitionPortfolioState {
  return {
    CE: {
      is_open: inputPortfolio?.CE?.is_open ?? true,
      entry_reason: inputPortfolio?.CE?.entry_reason ?? null,
      exit_reason: inputPortfolio?.CE?.exit_reason ?? null,
    },
    PE: {
      is_open: inputPortfolio?.PE?.is_open ?? true,
      entry_reason: inputPortfolio?.PE?.entry_reason ?? null,
      exit_reason: inputPortfolio?.PE?.exit_reason ?? null,
    },
  };
}

function buildActionsFromRule(rule: TradeTransitionRule, portfolio: TransitionPortfolioState): TradeTransitionPlan {
  const actions: TradeTransitionPlan['actions'] = [];
  const createExitAction = (leg: TransitionLegOption, reason: string | null) => {
    const legState = portfolio[leg];
    if (!legState.is_open) return;
    actions.push({
      type: 'exit-leg',
      leg,
      reason,
      entry_reason: null,
    });
  };

  if (rule.exit_ce_position) {
    createExitAction('CE', rule.trigger_option === 'CE' ? rule.exit_reason : rule.other_leg_exit_reason ?? rule.exit_reason);
  }

  if (rule.exit_pe_position) {
    createExitAction('PE', rule.trigger_option === 'PE' ? rule.exit_reason : rule.other_leg_exit_reason ?? rule.exit_reason);
  }

  if (rule.create_new_leg && rule.new_leg_option) {
    actions.push({
      type: 'open-leg',
      leg: rule.new_leg_option,
      reason: null,
      entry_reason: rule.entry_reason,
    });
  }

  return {
    rule,
    actions,
    audit: {
      strategy_id: rule.strategy_id,
      trigger_option: rule.trigger_option,
      exit_reason: rule.exit_reason,
      other_leg_exit_reason: rule.other_leg_exit_reason,
      entry_reason: rule.entry_reason,
      event_timestamp: nowIso(),
    },
  };
}

export async function buildTransitionPlan(input: TransitionEngineInput): Promise<TradeTransitionPlan> {
  const rules = await fetchTradeTransitionRules();
  const portfolio = resolvePortfolio(input.portfolio);
  const matchingRule =
    rules.find(
      (rule) =>
        rule.is_active &&
        rule.trigger_option === input.triggerOption &&
        rule.exit_reason === input.exitReason.trim() &&
        matchesStrategy(rule.strategy_id, input.strategyId ?? null),
    ) ?? null;

  if (!matchingRule) {
    return {
      rule: null,
      actions: [],
      audit: null,
    };
  }

  return buildActionsFromRule(matchingRule, portfolio);
}

export async function executeTransitionPlan(input: TransitionEngineInput): Promise<TradeTransitionPlan> {
  const plan = await buildTransitionPlan(input);
  if (!plan.audit) return plan;

  await recordTransitionAudit(plan.audit);
  return plan;
}

function normalizeAuditTrailRow(row: Record<string, unknown>): TradeTransitionAuditTrail | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.id !== 'string') return null;

  const details = row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : {};

  return {
    id: row.id,
    strategy_id: typeof details.strategy_id === 'string' || details.strategy_id === null ? (details.strategy_id as string | null) : null,
    trigger_option: details.trigger_option === 'CE' || details.trigger_option === 'PE' ? details.trigger_option : 'CE',
    exit_reason: typeof details.exit_reason === 'string' ? details.exit_reason : '',
    other_leg_exit_reason:
      typeof details.other_leg_exit_reason === 'string' || details.other_leg_exit_reason === null
        ? (details.other_leg_exit_reason as string | null)
        : null,
    entry_reason:
      typeof details.entry_reason === 'string' || details.entry_reason === null ? (details.entry_reason as string | null) : null,
    event_timestamp:
      typeof details.event_timestamp === 'string'
        ? details.event_timestamp
        : typeof row.created_at === 'string'
          ? row.created_at
          : nowIso(),
    created_at: typeof row.created_at === 'string' ? row.created_at : nowIso(),
  };
}

export async function recordTransitionAudit(values: TransitionAuditInsert): Promise<TradeTransitionAuditTrail> {
  const userId = await ensureUserId();
  const row = {
    user_id: userId,
    action: TRANSITION_AUDIT_ACTION,
    details: values,
    created_at: values.event_timestamp,
    updated_at: values.event_timestamp,
  };

  const { data, error } = await schemaTable(ACTIVITY_LOG_TABLE).insert(row).select('*').single();
  if (error) throw error;

  const normalized = normalizeAuditTrailRow(data as Record<string, unknown>);
  if (!normalized) throw new Error('Unable to normalize transition audit trail row.');
  return normalized;
}

export async function fetchTransitionAuditTrail() {
  const { data, error } = await schemaTable(ACTIVITY_LOG_TABLE)
    .select('*')
    .eq('action', TRANSITION_AUDIT_ACTION)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows: TradeTransitionAuditTrail[] = (data ?? [])
    .map((row: unknown) => normalizeAuditTrailRow(row as Record<string, unknown>))
    .filter((row: TradeTransitionAuditTrail | null): row is TradeTransitionAuditTrail => row !== null);
  return sortAuditTrail(rows);
}
