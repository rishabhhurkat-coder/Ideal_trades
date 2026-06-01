import { FormEvent, useEffect, useState } from 'react';
import type { StrategyFormValues } from '../types/strategy';

type StrategyFormProps = {
  initialValues: StrategyFormValues;
  isEditing: boolean;
  saving: boolean;
  onSubmit: (values: StrategyFormValues) => Promise<void>;
  onCancel: () => void;
};

export function StrategyForm({ initialValues, isEditing, saving, onSubmit, onCancel }: StrategyFormProps) {
  const [values, setValues] = useState<StrategyFormValues>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

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
    <form className="strategy-form" onSubmit={handleSubmit}>
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
          <input
            value={values.strategy_type}
            onChange={(event) => setValues((current) => ({ ...current, strategy_type: event.target.value }))}
            placeholder="Intraday"
          />
        </label>

        <label>
          <span>Trade Style</span>
          <input
            value={values.trade_style}
            onChange={(event) => setValues((current) => ({ ...current, trade_style: event.target.value }))}
            placeholder="Options"
          />
        </label>

        <label className="toggle-field">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))}
          />
          <span>Active</span>
        </label>
      </div>

      <div className="form-actions">
        {isEditing ? (
          <button type="button" className="button secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="button primary" disabled={saving || !values.strategy_name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Update Strategy' : 'Add Strategy'}
        </button>
      </div>
    </form>
  );
}
