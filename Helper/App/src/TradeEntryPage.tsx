import { type CSSProperties, useState } from 'react';

type TradeSide = 'CE' | 'PE';

type TradeCellState = {
  option: TradeSide;
  entryTime: string;
  strike: string;
  entryPrice: string;
  entryReason: string;
  exitTime: string;
  exitPrice: string;
  exitReason: string;
  pnl: string;
};

type TradeCardState = {
  id: string;
  title: string;
  expanded: boolean;
  rows: TradeCellState[];
};

type SummaryCard = {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad' | 'pill';
  pillLabel?: string;
  editable?: boolean;
  valueOnly?: boolean;
};

const DEFAULT_TRADE_QUANTITY = '130';

const INITIAL_HEADER_CARDS: SummaryCard[] = [
  { label: 'Trade Date', value: '02-Jun-26' },
  { label: 'Expiry Date', value: '02-Jun-26' },
  { label: 'DTE', value: '0' },
  { label: 'Track Strike', value: '23,300' },
  { label: 'EMA Status', value: 'Far EMA', tone: 'pill', pillLabel: 'Far EMA', valueOnly: true },
  { label: 'Gap Status', value: 'GAP DN - 132', tone: 'bad', pillLabel: 'GAP DN - 132', valueOnly: true },
  { label: 'Quantity', value: DEFAULT_TRADE_QUANTITY, editable: true },
  { label: 'Total P&L Amount', value: '--' },
];

function createRow(option: TradeSide): TradeCellState {
  return {
    option,
    entryTime: '09:18',
    strike: '',
    entryPrice: '',
    entryReason: '',
    exitTime: '09:18',
    exitPrice: '',
    exitReason: '',
    pnl: '',
  };
}

function createTradeCard(index: number, expanded = false): TradeCardState {
  return {
    id: `trade-${index}`,
    title: `Trade ${index}`,
    expanded,
    rows: [createRow('CE'), createRow('PE')],
  };
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 5h2v14h-2zM5 11h14v2H5z" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 11h14v2H5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function getTradeOptionStyle(option: TradeSide) {
  if (option === 'CE') {
    return { color: '#DC2626', fontWeight: 700 } as const;
  }

  return { color: '#16A34A', fontWeight: 700 } as const;
}

function TradeOptionValue({ option }: { option: TradeSide }) {
  return <span style={getTradeOptionStyle(option)}>{option}</span>;
}

function parseCurrencyInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPnlTone(value: string | number | null | undefined) {
  const parsedValue =
    typeof value === 'number'
      ? Number.isFinite(value)
        ? value
        : null
      : typeof value === 'string'
        ? parseCurrencyInput(value)
        : null;

  if (parsedValue === null || parsedValue === 0) return 'neutral' as const;
  return parsedValue > 0 ? ('positive' as const) : ('negative' as const);
}

function getPnlTextStyle(value: string | number | null | undefined): CSSProperties {
  const tone = getPnlTone(value);
  return tone === 'neutral'
    ? { color: 'inherit', fontWeight: 400 }
    : {
        color: tone === 'positive' ? '#16A34A' : '#DC2626',
        fontWeight: 700,
      };
}

function formatIndianCurrency(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  return `${value < 0 ? '-' : ''}₹${formatted}`;
}

function SummaryCardView({
  card,
  quantity,
  onQuantityChange,
}: {
  card: SummaryCard;
  quantity: string;
  onQuantityChange: (value: string) => void;
}) {
  return (
    <div className={`trade-summary-card${card.valueOnly ? ' trade-summary-card--value-only' : ''}`}>
      {card.valueOnly ? null : <span className="trade-summary-label">{card.label}</span>}
      <div className="trade-summary-value-wrap">
        {card.editable ? (
          <input
            className="trade-summary-quantity-input"
            type="text"
            inputMode="numeric"
            aria-label={card.label}
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
          />
        ) : card.tone === 'pill' || card.tone === 'bad' ? (
          <span className={`trade-summary-pill trade-summary-pill--${card.tone}`}>{card.pillLabel ?? card.value}</span>
        ) : (
          <strong className="trade-summary-value">{card.value}</strong>
        )}
      </div>
    </div>
  );
}

type TradeEntryPageProps = {
  onClose?: () => void;
  onBackToExpiry?: () => void;
  onSaveAndExit?: () => void;
  saving?: boolean;
  embedded?: boolean;
};

export function TradeEntryPage({ onClose, onBackToExpiry, onSaveAndExit, saving = false, embedded = false }: TradeEntryPageProps) {
  const [quantity, setQuantity] = useState(DEFAULT_TRADE_QUANTITY);
  const [cards, setCards] = useState<TradeCardState[]>([
    createTradeCard(1, true),
    createTradeCard(2, false),
    createTradeCard(3, false),
  ]);

  function recalculateRowPnl(row: TradeCellState, quantityValue: string) {
    const qty = parseCurrencyInput(quantityValue);
    const entryPrice = parseCurrencyInput(row.entryPrice);
    const exitPrice = parseCurrencyInput(row.exitPrice);
    if (qty === null || entryPrice === null || exitPrice === null) {
      return { ...row, pnl: '' };
    }

    return {
      ...row,
      pnl: (qty * (entryPrice - exitPrice)).toFixed(2),
    };
  }

  function recalculateCardPnls(card: TradeCardState, quantityValue: string) {
    return {
      ...card,
      rows: card.rows.map((row) => recalculateRowPnl(row, quantityValue)),
    };
  }

  function getCardTotalPnl(card: TradeCardState) {
    const total = card.rows.reduce((sum, row) => {
      const pnlValue = parseCurrencyInput(row.pnl);
      return sum + (pnlValue ?? 0);
    }, 0);
    return formatIndianCurrency(total || 0);
  }

  function updateTradeCard(cardId: string, updater: (current: TradeCardState) => TradeCardState) {
    setCards((currentCards) => currentCards.map((card) => (card.id === cardId ? updater(card) : card)));
  }

  function updateTradeRow(cardId: string, rowIndex: number, field: keyof TradeCellState, value: string) {
    updateTradeCard(cardId, (current) =>
      recalculateCardPnls(
        {
          ...current,
          rows: current.rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row)),
        },
        quantity,
      ),
    );
  }

  function handleQuantityChange(nextQuantity: string) {
    setQuantity(nextQuantity);
    setCards((currentCards) => currentCards.map((card) => recalculateCardPnls(card, nextQuantity)));
  }

  function toggleTrade(cardId: string) {
    updateTradeCard(cardId, (current) => ({ ...current, expanded: !current.expanded }));
  }

  function removeTrade(cardId: string) {
    setCards((currentCards) => currentCards.filter((card) => card.id !== cardId));
  }

  function addTrade() {
    setCards((currentCards) => [...currentCards, createTradeCard(currentCards.length + 1, true)]);
  }

  const netTotalPnl = cards.reduce((sum, card) => {
    const cardTotal = card.rows.reduce((cardSum, row) => {
      const pnlValue = parseCurrencyInput(row.pnl);
      return cardSum + (pnlValue ?? 0);
    }, 0);
    return sum + cardTotal;
  }, 0);

  const headerCards = INITIAL_HEADER_CARDS.map((card) => {
    if (card.label === 'Quantity') {
      return { ...card, value: quantity, editable: true };
    }

    if (card.label === 'Total P&L Amount') {
      return {
        ...card,
        value: formatIndianCurrency(netTotalPnl) || '₹0.00',
        tone: netTotalPnl > 0 ? ('good' as const) : netTotalPnl < 0 ? ('bad' as const) : ('neutral' as const),
      };
    }

    return card;
  });

  const ShellTag = embedded ? 'section' : 'main';

  return (
    <ShellTag className={`trade-page-shell${embedded ? ' trade-page-shell--embedded' : ''}`}>
      <section className="trade-page">
        {embedded ? null : (
          <button className="trade-page-close" type="button" aria-label="Close page" onClick={onClose}>
            <CloseIcon />
          </button>
        )}

        <header className="trade-page-header">
          <div className="trade-summary-grid">
            {headerCards.map((card) => (
              <SummaryCardView key={card.label} card={card} quantity={quantity} onQuantityChange={handleQuantityChange} />
            ))}
          </div>

          <button className="trade-new-button" type="button" onClick={addTrade}>
            <span className="trade-new-button-icon">
              <PlusIcon />
            </span>
            <span>New Trade</span>
          </button>
        </header>

        <section className="trade-stack">
          {cards.map((card) => {
            const totalPnl = getCardTotalPnl(card);
            return (
              <article key={card.id} className={`trade-card${card.expanded ? ' trade-card--expanded' : ''}`}>
                <div className="trade-card-header">
                  <div className="trade-card-title-group">
                    <h2 className="trade-card-title">{card.title}</h2>
                    <div className="trade-card-total">
                      <span>Total P&amp;L:</span>
                      <strong>{totalPnl}</strong>
                    </div>
                  </div>

                  <div className="trade-card-actions">
                    <button className="trade-card-toggle" type="button" onClick={() => toggleTrade(card.id)} aria-label={card.expanded ? 'Collapse trade' : 'Expand trade'}>
                      {card.expanded ? <MinusIcon /> : <PlusIcon />}
                    </button>
                    <button className="trade-card-delete" type="button" onClick={() => removeTrade(card.id)} aria-label={`Delete ${card.title}`}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                {card.expanded ? (
                  <div className="trade-card-body">
                    <div className="trade-table-shell">
                      <table className="trade-entry-table">
                        <colgroup>
                          <col className="option-col" />
                          <col className="entry-time-col" />
                          <col className="strike-col" />
                          <col className="entry-price-col" />
                          <col className="entry-reason-col" />
                          <col className="exit-time-col" />
                          <col className="exit-price-col" />
                          <col className="exit-reason-col" />
                          <col className="pnl-col" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th rowSpan={2} className="trade-entry-option-head">
                              Option
                            </th>
                            <th colSpan={4}>Entry</th>
                            <th colSpan={4}>Exit</th>
                          </tr>
                          <tr>
                            <th>Entry Time</th>
                            <th>Strike</th>
                            <th>Entry Price</th>
                            <th>Entry Reason</th>
                            <th>Exit Time</th>
                            <th>Exit Price</th>
                            <th>Exit Reason</th>
                            <th>P&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {card.rows.map((row, rowIndex) => (
                            <tr key={`${card.id}-${row.option}`}>
                              <td className="trade-option-cell">
                                <TradeOptionValue option={row.option} />
                              </td>
                              <td>
                                <input
                                  className="trade-input"
                                  type="text"
                                  value={row.entryTime}
                                  onChange={(event) => updateTradeRow(card.id, rowIndex, 'entryTime', event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  className="trade-input"
                                  type="text"
                                  value={row.strike}
                                  onChange={(event) => updateTradeRow(card.id, rowIndex, 'strike', event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  className="trade-input"
                                  type="text"
                                  value={row.entryPrice}
                                  onChange={(event) => updateTradeRow(card.id, rowIndex, 'entryPrice', event.target.value)}
                                />
                              </td>
                              <td>
                                <div className="trade-select-shell">
                                  <select
                                    className="trade-select"
                                    value={row.entryReason}
                                    onChange={(event) => updateTradeRow(card.id, rowIndex, 'entryReason', event.target.value)}
                                  >
                                    <option value="">Select entry reason</option>
                                    <option value="Breakout">Breakout</option>
                                    <option value="Pullback">Pullback</option>
                                    <option value="Trend Continuation">Trend Continuation</option>
                                  </select>
                                  <ChevronDownIcon />
                                </div>
                              </td>
                              <td>
                                <input
                                  className="trade-input"
                                  type="text"
                                  value={row.exitTime}
                                  onChange={(event) => updateTradeRow(card.id, rowIndex, 'exitTime', event.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  className="trade-input"
                                  type="text"
                                  value={row.exitPrice}
                                  onChange={(event) => updateTradeRow(card.id, rowIndex, 'exitPrice', event.target.value)}
                                />
                              </td>
                              <td>
                                <div className="trade-select-shell trade-select-shell--muted">
                                  <select
                                    className="trade-select"
                                    value={row.exitReason}
                                    onChange={(event) => updateTradeRow(card.id, rowIndex, 'exitReason', event.target.value)}
                                  >
                                    <option value="">Select exit reason</option>
                                    <option value="Target">Target</option>
                                    <option value="Stop Loss">Stop Loss</option>
                                    <option value="EOD">EOD</option>
                                  </select>
                                  <ChevronDownIcon />
                                </div>
                              </td>
                              <td>
                                <input
                                  className="trade-input trade-input--pnl"
                                  type="text"
                                  readOnly
                                  value={formatIndianCurrency(parseCurrencyInput(row.pnl))}
                                  aria-label={`${card.title} ${row.option} P and L`}
                                  style={{
                                    color: getPnlTextStyle(row.pnl).color,
                                    fontWeight: getPnlTone(row.pnl) === 'neutral' ? 400 : 700,
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <footer className="trade-page-footer">
          <div className="trade-page-footer-line" />
          <div className="trade-page-footer-actions">
            <button className="trade-button trade-button--ghost" type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button className="trade-button trade-button--ghost" type="button" onClick={onBackToExpiry} disabled={saving}>
              Back to Expiry
            </button>
            <button className="trade-button trade-button--primary" type="button" onClick={onSaveAndExit} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Exit'}
            </button>
          </div>
        </footer>
      </section>
    </ShellTag>
  );
}
