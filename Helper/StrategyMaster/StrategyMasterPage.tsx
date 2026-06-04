import { useState } from 'react';
import { EmaIntradayPage } from '../../Strategies/EMA-Intraday/EmaIntradayPage';
import { StrategyForm } from './StrategyForm';
import { StrategyTable } from './StrategyTable';
import { useStrategies } from './useStrategies';
import { formatStrategyType } from './strategy';

function getSidebarInitial(label: string) {
  const trimmed = label.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function StrategySidebar({
  activeStrategyName,
  collapsed,
  onMasters,
  onStrategySelect,
  onToggleCollapsed,
  showMastersActive = false,
  strategies,
}: {
  activeStrategyName?: string | null;
  collapsed: boolean;
  onMasters: () => void;
  onStrategySelect: (strategyName: string) => void;
  onToggleCollapsed: () => void;
  showMastersActive?: boolean;
  strategies: Array<{ id: string; strategy_name: string }>;
}) {
  return (
    <aside className="master-sidebar">
      <div className="master-sidebar-top">
        <div className="master-brand">
          <div className="master-brand-mark">I</div>
          <div className="master-brand-copy">
            <strong>Ideal Trades</strong>
          </div>
        </div>
        <button
          className="master-sidebar-toggle"
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden="true">{collapsed ? '>' : '<'}</span>
        </button>
      </div>

      <div className="master-nav-group master-nav-group--top">
        <button className={`master-nav-item${showMastersActive ? ' active' : ''}`} type="button" onClick={onMasters} title="Strategy Master">
          <span className="master-nav-icon" aria-hidden="true">
            S
          </span>
          <span className="master-nav-label">Strategy Master</span>
        </button>
      </div>

      <div className="master-sidebar-divider" />

      <div className="master-nav-group">
        <div className="master-nav-title">Strategies</div>
        {strategies.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`master-nav-pill${activeStrategyName === item.strategy_name ? ' active' : ''}`}
            onClick={() => onStrategySelect(item.strategy_name)}
            title={item.strategy_name}
          >
            <span className="master-nav-icon master-nav-icon--pill" aria-hidden="true">
              {getSidebarInitial(item.strategy_name)}
            </span>
            <span className="master-nav-label">{item.strategy_name}</span>
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
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

  const openStrategyMaster = () => {
    setIsStrategyModalOpen(false);
    setEditingStrategy(null);
    setActivePage('strategy-master');
  };

  const handleStrategySelect = (strategyName: string) => {
    setSelectedStrategy(strategyName);
    setIsStrategyModalOpen(false);
    if (strategyName === 'EMA Intraday') {
      setActivePage('ema-intraday');
    } else {
      setActivePage('strategy-page');
    }
  };

  const shellClassName = `master-shell${isSidebarCollapsed ? ' master-shell--sidebar-collapsed' : ' master-shell--sidebar-expanded'}`;

  if (activePage === 'ema-intraday') {
    return (
      <EmaIntradayPage
        openHistoricalData={shouldOpenEmaHistoricalData}
        sidebar={
          <StrategySidebar
            activeStrategyName="EMA Intraday"
            collapsed={isSidebarCollapsed}
            onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
            strategies={sidebarStrategies}
            onStrategySelect={handleStrategySelect}
            onMasters={() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              openStrategyMaster();
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
      <main className={shellClassName}>
        <StrategySidebar
          activeStrategyName={selectedStrategy}
          collapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
          strategies={sidebarStrategies}
          onStrategySelect={handleStrategySelect}
          onMasters={openStrategyMaster}
        />

        <section className="master-content">
          <section className="master-page-header">
            <div>
              <p className="eyebrow master-eyebrow">Strategy</p>
              <h1>{strategy?.strategy_name ?? 'Strategy'}</h1>
            </div>
            <button className="button master-refresh-button" type="button" onClick={openStrategyMaster}>
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
            <div className="strategy-overview-empty">Click a strategy name in the left rail to open it directly.</div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={shellClassName}>
      <StrategySidebar
        activeStrategyName={selectedStrategy}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
        showMastersActive
        strategies={sidebarStrategies}
        onStrategySelect={handleStrategySelect}
        onMasters={() => void loadStrategies()}
      />

      <section className="master-content">
        <section className="master-page-header">
          <div>
            <p className="eyebrow master-eyebrow">Workspace</p>
            <h1>Strategy Master</h1>
          </div>
          <div className="strategy-master-toolbar">
            <button
              className="button primary strategy-master-add-button"
              type="button"
              onClick={() => {
                setSelectedStrategy(null);
                setEditingStrategy(null);
                setIsStrategyModalOpen(true);
              }}
            >
              <span aria-hidden="true">+</span>
              <span>Strategy</span>
            </button>
          </div>
        </section>

        {error ? <div className="alert master-alert">{error}</div> : null}

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
              setIsStrategyModalOpen(false);
              setEditingStrategy(null);
              if (strategy.strategy_name === 'EMA Intraday') {
                setActivePage('ema-intraday');
              } else {
                setActivePage('strategy-page');
              }
            }}
            onEdit={(strategy) => {
              setSelectedStrategy(strategy.strategy_name);
              setEditingStrategy(strategy);
              setIsStrategyModalOpen(true);
            }}
            onDelete={(strategy) => {
              const confirmed = window.confirm('Delete Strategy?\nThis permanently removes the strategy from Supabase.');
              if (!confirmed) return;
              void removeStrategy(strategy);
            }}
          />
        </section>

        {isStrategyModalOpen ? (
          <div
            className="strategy-modal-backdrop"
            role="presentation"
            onClick={() => {
              setIsStrategyModalOpen(false);
              setEditingStrategy(null);
            }}
          >
            <section
              className="strategy-modal"
              role="dialog"
              aria-modal="true"
              aria-label={editingStrategy ? 'Edit Strategy' : 'Add Strategy'}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="strategy-modal-header">
                <div>
                  <p className="eyebrow master-eyebrow">Strategy Master</p>
                  <h2>{editingStrategy ? `Edit Strategy #${editingStrategy.id}` : 'Add Strategy'}</h2>
                </div>
                <button
                  className="button secondary strategy-modal-close"
                  type="button"
                  onClick={() => {
                    setIsStrategyModalOpen(false);
                    setEditingStrategy(null);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="strategy-modal-body">
                <StrategyForm
                  initialValues={formValues}
                  isEditing={Boolean(editingStrategy)}
                  saving={status === 'saving'}
                  onSubmit={async (values) => {
                    const saved = await saveStrategy(values);
                    if (saved) {
                      setIsStrategyModalOpen(false);
                    }
                  }}
                  onCancel={() => {
                    setIsStrategyModalOpen(false);
                    setEditingStrategy(null);
                  }}
                />
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
