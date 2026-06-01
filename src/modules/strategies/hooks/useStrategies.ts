import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addStrategy,
  editStrategy,
  fetchStrategies,
  setStrategyActive,
  softDeleteStrategy,
} from '../services/strategyService';
import type { Strategy, StrategyFormValues } from '../types/strategy';

type Status = 'idle' | 'loading' | 'saving';

const emptyForm: StrategyFormValues = {
  strategy_name: '',
  strategy_type: '',
  trade_style: '',
  active: true,
};

export function useStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const loadStrategies = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      setStrategies(await fetchStrategies());
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Unable to load strategies.');
    } finally {
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  const saveStrategy = useCallback(
    async (values: StrategyFormValues) => {
      setStatus('saving');
      setError(null);
      try {
        if (editingStrategy) {
          await editStrategy(editingStrategy.id, values);
        } else {
          await addStrategy(values);
        }
        setEditingStrategy(null);
        await loadStrategies();
      } catch (currentError) {
        setError(currentError instanceof Error ? currentError.message : 'Unable to save strategy.');
      } finally {
        setStatus('idle');
      }
    },
    [editingStrategy, loadStrategies],
  );

  const toggleActive = useCallback(
    async (strategy: Strategy) => {
      setStatus('saving');
      setError(null);
      try {
        await setStrategyActive(strategy.id, !strategy.active);
        await loadStrategies();
      } catch (currentError) {
        setError(currentError instanceof Error ? currentError.message : 'Unable to update strategy.');
      } finally {
        setStatus('idle');
      }
    },
    [loadStrategies],
  );

  const removeStrategy = useCallback(
    async (strategy: Strategy) => {
      setStatus('saving');
      setError(null);
      try {
        await softDeleteStrategy(strategy.id);
        await loadStrategies();
      } catch (currentError) {
        setError(currentError instanceof Error ? currentError.message : 'Unable to delete strategy.');
      } finally {
        setStatus('idle');
      }
    },
    [loadStrategies],
  );

  const formValues = useMemo<StrategyFormValues>(() => {
    if (!editingStrategy) return emptyForm;

    return {
      strategy_name: editingStrategy.strategy_name,
      strategy_type: editingStrategy.strategy_type ?? '',
      trade_style: editingStrategy.trade_style ?? '',
      active: editingStrategy.active,
    };
  }, [editingStrategy]);

  return {
    strategies,
    status,
    error,
    editingStrategy,
    formValues,
    saveStrategy,
    setEditingStrategy,
    toggleActive,
    removeStrategy,
    loadStrategies,
  };
}
