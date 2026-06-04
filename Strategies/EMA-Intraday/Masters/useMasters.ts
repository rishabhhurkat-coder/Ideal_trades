import { useCallback, useEffect, useState } from 'react';
import type {
  EntryReason,
  ExitReason,
  ReasonInsert,
  TradeTransitionAuditTrail,
  TradeTransitionRule,
  TradeTransitionRuleInsert,
} from './masters';
import {
  deleteEntryReason,
  deleteExitReason,
  deleteTradeTransitionRule,
  fetchEntryReasons,
  fetchExitReasons,
  fetchTradeTransitionRules,
  fetchTransitionAuditTrail,
  saveEntryReason,
  saveExitReason,
  saveTradeTransitionRule,
  toggleEntryReasonActive,
  toggleExitReasonActive,
  toggleTradeTransitionRuleActive,
} from './mastersService';

type Status = 'idle' | 'loading' | 'saving';

export function useMasters() {
  const [entryReasons, setEntryReasons] = useState<EntryReason[]>([]);
  const [exitReasons, setExitReasons] = useState<ExitReason[]>([]);
  const [transitionRules, setTransitionRules] = useState<TradeTransitionRule[]>([]);
  const [auditTrail, setAuditTrail] = useState<TradeTransitionAuditTrail[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const loadMasters = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const [nextEntryReasons, nextExitReasons, nextTransitionRules, nextAuditTrail] = await Promise.all([
        fetchEntryReasons(),
        fetchExitReasons(),
        fetchTradeTransitionRules(),
        fetchTransitionAuditTrail(),
      ]);

      setEntryReasons(nextEntryReasons);
      setExitReasons(nextExitReasons);
      setTransitionRules(nextTransitionRules);
      setAuditTrail(nextAuditTrail);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Unable to load masters.');
    } finally {
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  const runSave = useCallback(async (work: () => Promise<void>, fallbackMessage: string) => {
    setStatus('saving');
    setError(null);

    try {
      await work();
      await loadMasters();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : fallbackMessage);
    } finally {
      setStatus('idle');
    }
  }, [loadMasters]);

  const saveEntry = useCallback(
    async (id: string | null, values: ReasonInsert) =>
      runSave(() => saveEntryReason(id, values).then(() => undefined), 'Unable to save entry reason.'),
    [runSave],
  );

  const saveExit = useCallback(
    async (id: string | null, values: ReasonInsert) =>
      runSave(() => saveExitReason(id, values).then(() => undefined), 'Unable to save exit reason.'),
    [runSave],
  );

  const saveRule = useCallback(
    async (id: string | null, values: TradeTransitionRuleInsert) =>
      runSave(() => saveTradeTransitionRule(id, values).then(() => undefined), 'Unable to save trade transition rule.'),
    [runSave],
  );

  const toggleEntry = useCallback(
    async (id: string, isActive: boolean) => runSave(() => toggleEntryReasonActive(id, isActive).then(() => undefined), 'Unable to update entry reason.'),
    [runSave],
  );

  const toggleExit = useCallback(
    async (id: string, isActive: boolean) => runSave(() => toggleExitReasonActive(id, isActive).then(() => undefined), 'Unable to update exit reason.'),
    [runSave],
  );

  const toggleRule = useCallback(
    async (id: string, isActive: boolean) => runSave(() => toggleTradeTransitionRuleActive(id, isActive).then(() => undefined), 'Unable to update rule.'),
    [runSave],
  );

  const deleteEntry = useCallback(
    async (id: string) => runSave(() => deleteEntryReason(id), 'Unable to delete entry reason.'),
    [runSave],
  );

  const deleteExit = useCallback(
    async (id: string) => runSave(() => deleteExitReason(id), 'Unable to delete exit reason.'),
    [runSave],
  );

  const deleteRule = useCallback(
    async (id: string) => runSave(() => deleteTradeTransitionRule(id), 'Unable to delete trade transition rule.'),
    [runSave],
  );

  return {
    auditTrail,
    deleteEntry,
    deleteExit,
    deleteRule,
    entryReasons,
    error,
    exitReasons,
    loadMasters,
    saveEntry,
    saveExit,
    saveRule,
    status,
    toggleEntry,
    toggleExit,
    toggleRule,
    transitionRules,
  };
}
