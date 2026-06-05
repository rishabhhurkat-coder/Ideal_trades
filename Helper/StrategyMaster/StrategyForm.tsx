import { createPortal } from 'react-dom';
import { FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
  const [dropdownAnchor, setDropdownAnchor] = useState<{
    field: 'strategy_type' | 'trade_style';
    rect: DOMRect;
  } | null>(null);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
      const target = event.target as Node;
      if (!rootRef.current.contains(target) && !menuRef.current?.contains(target)) {
        setActiveDropdown(null);
        setDropdownAnchor(null);
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
    const isOpen = activeDropdown === field && dropdownAnchor?.field === field;

    function openOrCloseDropdown(event: ReactMouseEvent<HTMLButtonElement>) {
      const rect = event.currentTarget.getBoundingClientRect();
      setActiveDropdown((current) => {
        const next = current === field ? null : field;
        setDropdownAnchor(next ? { field: next, rect } : null);
        return next;
      });
    }

    const dropdownMenu =
      isOpen && dropdownAnchor
        ? (() => {
            const estimatedHeight = 16 + options.length * 42 + Math.max(0, options.length - 1) * 4;
            const gap = 8;
            const viewportMargin = 8;
            const rect = dropdownAnchor.rect;
            const canFitBelow = rect.bottom + gap + estimatedHeight <= window.innerHeight - viewportMargin;
            const top = canFitBelow
              ? rect.bottom + gap
              : Math.max(viewportMargin, rect.top - gap - estimatedHeight);
            const left = Math.min(
              Math.max(viewportMargin, rect.left),
              Math.max(viewportMargin, window.innerWidth - rect.width - viewportMargin),
            );

            return createPortal(
              <div
                ref={menuRef}
                className="master-dropdown-menu"
                role="listbox"
                aria-label={label}
                style={{
                  position: 'fixed',
                  top,
                  left,
                  right: 'auto',
                  width: rect.width,
                  zIndex: 1000,
                }}
              >
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={option.value === values[field] ? 'master-dropdown-option active' : 'master-dropdown-option'}
                    onClick={() => {
                      setValues((current) => ({ ...current, [field]: option.value }));
                      setActiveDropdown(null);
                      setDropdownAnchor(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>,
              document.body,
            );
          })()
        : null;

    return (
      <div className="master-dropdown">
        <button
          className="trade-theme-control master-select master-dropdown-trigger"
          type="button"
          onClick={openOrCloseDropdown}
          aria-expanded={activeDropdown === field}
        >
          <span className="master-dropdown-value">{selectedLabel}</span>
          <span className="master-dropdown-caret" aria-hidden="true">
            v
          </span>
        </button>
        {dropdownMenu}
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
