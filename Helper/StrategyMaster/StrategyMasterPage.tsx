import { useState } from 'react';
import { EmaIntradayPage } from '../../Strategies/EMA-Intraday/EmaIntradayPage';
import { StrategyForm } from './StrategyForm';
import { StrategyTable } from './StrategyTable';
import { useStrategies } from './useStrategies';
import { formatStrategyType } from './strategy';

function StrategySidebar({
  activeStrategyName,
  onMasters,
  showMastersActive = false,
  onStrategySelect,
  strategies,
}: {
  activeStrategyName?: string | null;
  onMasters: () => void;
  showMastersActive?: boolean;
  onStrategySelect: (strategyName: string) => void;
  strategies: Array<{ id: string; strategy_name: string }>;
}) {
  return (
    <aside className="master-sidebar">
      <div className="master-brand">
        <div className="master-brand-mark">I</div>
        <div className="master-brand-copy">
          <strong>Ideal Trades</strong>
        </div>
      </div>

      <div className="master-nav-group master-nav-group--top">
        <button className={`master-nav-item${showMastersActive ? ' active' : ''}`} type="button" onClick={onMasters}>
          Strategy Master
        </button>
      </div>

      <div className="master-sidebar-divider" />

      <div className="master-nav-group">
        <div className="master-nav-title">Strategies</div>
        {strategies.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`master-nav-pill${activeStrategyName === item.strategy_name ? ' active' : ''}`}
            onClick={() => onStrategySelect(item.strategy_name)}
          >
            <span className="master-nav-bullet" aria-hidden="true" />
            {item.strategy_name}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function StrategyMasterPage() {
  const shouldOpenEmaHistoricalData =
    typeof window !== 'undefined' && window.location.hash === '#ema-intraday-historical-data';
  const [activePage, setActivePage] = useState<'strategy-master' | 'ema-intraday' | 'strategy-page'>(
    shouldOpenEmaHistoricalData ? 'ema-intraday' : 'strategy-master',
  );
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const {
    strategies,
    status,
    error,
    editingStrategy,
    formValues,
    saveStrategy,
    setEditingStrategy,
    removeStrategy,
    loadStrategies,
  } = useStrategies();

  const busy = status === 'loading' || status === 'saving';
  const sidebarStrategies = [...strategies].sort((left, right) => {
    if (left.strategy_name === 'EMA Intraday') return -1;
    if (right.strategy_name === 'EMA Intraday') return 1;
    return left.strategy_name.localeCompare(right.strategy_name);
  });

  if (activePage === 'ema-intraday') {
    return (
      <EmaIntradayPage
        openHistoricalData={shouldOpenEmaHistoricalData}
        sidebar={
        <StrategySidebar
          activeStrategyName="EMA Intraday"
          strategies={sidebarStrategies}
          onStrategySelect={(strategyName) => {
            setSelectedStrategy(strategyName);
            if (strategyName === 'EMA Intraday') {
              setActivePage('ema-intraday');
            } else {
              setActivePage('strategy-page');
            }
          }}
          onMasters={() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              setActivePage('strategy-master');
            }}
        />
        }
      />
    );
  }

  if (activePage === 'strategy-page') {
    const strategy =
      strategies.find((item) => item.strategy_name === selectedStrategy) ??
      strategies.find((item) => item.strategy_name === 'EMA Intraday') ??
      strategies[0] ??
      null;

    return (
      <main className="master-shell">
        <StrategySidebar
          activeStrategyName={selectedStrategy}
          strategies={sidebarStrategies}
          onStrategySelect={(strategyName) => {
            setSelectedStrategy(strategyName);
            if (strategyName === 'EMA Intraday') {
              setActivePage('ema-intraday');
            } else {
              setActivePage('strategy-page');
            }
          }}
          onMasters={() => setActivePage('strategy-master')}
        />

        <section className="master-content">
          <section className="master-page-header">
            <div>
              <p className="eyebrow master-eyebrow">Strategy</p>
              <h1>{strategy?.strategy_name ?? 'Strategy'}</h1>
            </div>
            <button className="button master-refresh-button" type="button" onClick={() => setActivePage('strategy-master')}>
              Back
            </button>
          </section>

          <section className="master-card">
            <div className="master-card-heading">
              <h2>Overview</h2>
              <span>{strategy?.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="strategy-overview-grid">
              <div className="strategy-overview-tile">
                <span>Strategy Type</span>
                <strong>{formatStrategyType(strategy?.strategy_type)}</strong>
              </div>
              <div className="strategy-overview-tile">
                <span>Trade Style</span>
                <strong>{strategy?.trade_style || '-'}</strong>
              </div>
              <div className="strategy-overview-tile">
                <span>Status</span>
                <strong>{strategy?.active ? 'Active' : 'Inactive'}</strong>
              </div>
            </div>
            <div className="strategy-overview-empty">
              Click a strategy name in the left rail to open it directly.
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="master-shell">
      <StrategySidebar
        activeStrategyName={selectedStrategy}
        showMastersActive
        strategies={sidebarStrategies}
        onStrategySelect={(strategyName) => {
          setSelectedStrategy(strategyName);
          if (strategyName === 'EMA Intraday') {
            setActivePage('ema-intraday');
          } else {
            setActivePage('strategy-page');
          }
        }}
        onMasters={() => void loadStrategies()}
      />

      <section className="master-content">
        <section className="master-page-header">
          <div>
            <h1>Strategy Master</h1>
          </div>
        </section>

        {error ? <div className="alert master-alert">{error}</div> : null}

        <section className="master-card">
          <div className="master-card-heading">
            <h2>{editingStrategy ? `Edit Strategy #${editingStrategy.id}` : 'Add Strategy'}</h2>
          </div>
          <StrategyForm
            initialValues={formValues}
            isEditing={Boolean(editingStrategy)}
            saving={status === 'saving'}
            onSubmit={saveStrategy}
            onCancel={() => setEditingStrategy(null)}
          />
        </section>

        <section className="master-card strategy-table-card">
          <div className="master-card-heading">
            <h2>Strategies</h2>
            <span className="records-badge">{status === 'loading' ? 'Loading...' : `Total - ${strategies.length}`}</span>
          </div>
          <StrategyTable
            strategies={strategies}
            busy={busy}
            onOpenStrategy={(strategy) => {
              setSelectedStrategy(strategy.strategy_name);
              setEditingStrategy(null);
              if (strategy.strategy_name === 'EMA Intraday') {
                setActivePage('ema-intraday');
              } else {
                setActivePage('strategy-page');
              }
            }}
            onEdit={setEditingStrategy}
            onDelete={(strategy) => void removeStrategy(strategy)}
          />
        </section>
      </section>
    </main>
  );
}
