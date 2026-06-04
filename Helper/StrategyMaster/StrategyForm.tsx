import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { StrategyFormValues } from './strategy';

type StrategyFormProps = {
  initialValues: StrategyFormValues;
  isEditing: boolean;
  saving: boolean;
  onSubmit: (values: StrategyFormValues) => Promise<boolean | void>;
  onCancel: () => void;
};

export function StrategyForm({ initialValues, isEditing, saving, onSubmit, onCancel }: StrategyFormProps) {
  const [values, setValues] = useState<StrategyFormValues>(initialValues);
  const [activeDropdown, setActiveDropdown] = useState<'strategy_type' | 'trade_style' | null>(null);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const strategyTypeOptions = [
    { value: 'TRACK_TRADE', label: 'Track & Trade' },
    { value: 'TRADE', label: 'Trade' },
  ];
  const tradeStyleOptions = [
    { value: 'Positional', label: 'Positional' },
    { value: 'Intraday', label: 'Intraday' },
  ];

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const selectedStrategyTypeLabel = useMemo(
    () => strategyTypeOptions.find((option) => option.value === values.strategy_type)?.label ?? 'Select strategy type',
    [strategyTypeOptions, values.strategy_type],
  );
  const selectedTradeStyleLabel = useMemo(
    () => tradeStyleOptions.find((option) => option.value === values.trade_style)?.label ?? 'Select trade style',
    [tradeStyleOptions, values.trade_style],
  );

  function renderDropdown(
    field: 'strategy_type' | 'trade_style',
    label: string,
    options: Array<{ value: string; label: string }>,
    selectedLabel: string,
  ) {
    return (
      <div className="master-dropdown">
        <button
          className="trade-theme-control master-select master-dropdown-trigger"
          type="button"
          onClick={() => setActiveDropdown((current) => (current === field ? null : field))}
          aria-expanded={activeDropdown === field}
        >
          <span className="master-dropdown-value">{selectedLabel}</span>
          <span className="master-dropdown-caret" aria-hidden="true">
            ▾
          </span>
        </button>
        {activeDropdown === field ? (
          <div className="master-dropdown-menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.value === values[field] ? 'master-dropdown-option active' : 'master-dropdown-option'}
                onClick={() => {
                  setValues((current) => ({ ...current, [field]: option.value }));
                  setActiveDropdown(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      ...values,
      strategy_name: values.strategy_name.trim(),
      strategy_type: values.strategy_type.trim(),
      trade_style: values.trade_style.trim(),
    });
  }

  return (
    <form className="strategy-form" onSubmit={handleSubmit} ref={rootRef}>
      <div className="form-grid">
        <label>
          <span>Strategy Name</span>
          <input
            value={values.strategy_name}
            onChange={(event) => setValues((current) => ({ ...current, strategy_name: event.target.value }))}
            placeholder="Momentum breakout"
            required
          />
        </label>

        <label>
          <span>Strategy Type</span>
          {renderDropdown('strategy_type', 'Strategy Type', strategyTypeOptions, selectedStrategyTypeLabel)}
        </label>

        <label>
          <span>Trade Style</span>
          {renderDropdown('trade_style', 'Trade Style', tradeStyleOptions, selectedTradeStyleLabel)}
        </label>

        <div className="strategy-form-inline-actions">
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))}
            />
            <span>Active</span>
          </label>

          <div className="strategy-form-buttons">
            {isEditing ? (
              <button type="button" className="button secondary" onClick={onCancel} disabled={saving}>
                Cancel
              </button>
            ) : null}
            <button type="submit" className="button primary" disabled={saving || !values.strategy_name.trim()}>
              {saving ? 'Saving...' : isEditing ? 'Update Strategy' : 'Add Strategy'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
