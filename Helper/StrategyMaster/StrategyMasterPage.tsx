import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { EmaIntradayPage } from '../../Strategies/EMA-Intraday/TradeDashboard/EmaIntradayPage';
import { StrategyForm } from './StrategyForm';
import { StrategyTable } from './StrategyTable';
import { useStrategies } from './useStrategies';
import { formatStrategyType } from './strategy';
import { TradeEntryPage } from '../App/src/TradeEntryPage';

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 6.5 9 12l5.5 5.5" />
    </svg>
  );
}

function SidebarAvatar({
  label,
  tone,
}: {
  label: string;
  tone: 'brand' | 'nav' | 'strategy';
}) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={`master-avatar master-avatar--${tone}`} aria-hidden="true">
      <span className="master-avatar-letter">{initial}</span>
    </span>
  );
}

function SidebarWaveIllustration() {
  return (
    <svg viewBox="0 0 260 112" aria-hidden="true" focusable="false" className="master-sidebar-wave">
      <g opacity="0.28">
        <path d="M0 80C24 72 42 58 66 58c26 0 38 16 64 16 24 0 36-11 58-11 21 0 39 8 72 0v49H0z" fill="#d4ede3" />
        <path d="M0 70C27 63 48 48 74 48c27 0 40 18 66 18 22 0 33-8 56-8 23 0 41 10 64 4v41H0z" fill="#c0e2d3" opacity="0.7" />
      </g>
      <g opacity="0.22" fill="#1a5c42">
        <rect x="24" y="61" width="8" height="24" rx="2" />
        <rect x="38" y="53" width="8" height="32" rx="2" />
        <rect x="52" y="67" width="8" height="18" rx="2" />
        <rect x="190" y="57" width="8" height="28" rx="2" />
        <rect x="204" y="46" width="8" height="39" rx="2" />
        <rect x="218" y="63" width="8" height="22" rx="2" />
      </g>
      <polyline
        points="18,74 42,68 60,72 82,58 104,63 124,50 146,54 168,43 192,48 214,40 238,45"
        fill="none"
        stroke="#1a5c42"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.26"
      />
    </svg>
  );
}

function StrategySidebar({
  activeStrategyName,
  collapsed,
  onMasters,
  onTradeEntry,
  onStrategySelect,
  onToggleCollapsed,
  showMastersActive = false,
  showTradeEntryActive = false,
  strategies,
}: {
  activeStrategyName?: string | null;
  collapsed: boolean;
  onMasters: () => void;
  onTradeEntry: () => void;
  onStrategySelect: (strategyName: string) => void;
  onToggleCollapsed: () => void;
  showMastersActive?: boolean;
  showTradeEntryActive?: boolean;
  strategies: Array<{ id: string; strategy_name: string }>;
}) {
  const getAvatarLabel = (name: string) => {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
  };

  return (
    <aside
      className={`master-sidebar${collapsed ? ' master-sidebar--collapsed' : ' master-sidebar--expanded'}`}
      aria-label="Strategy navigation rail"
    >
      <div className="master-sidebar-stack">
        <header className="master-sidebar-header">
          <div className="master-brand" title="Ideal Trades" aria-label="Ideal Trades">
            <SidebarAvatar label="Ideal Trades" tone="brand" />
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
            <ChevronLeftIcon />
          </button>
        </header>

        <div className="master-nav-group master-nav-group--top">
          <button
            className={`master-nav-item${showMastersActive ? ' active' : ''}`}
            type="button"
            onClick={onMasters}
            title="Strategy Master"
            aria-label="Strategy Master"
            data-tooltip="Strategy Master"
          >
            <SidebarAvatar label="Strategy Master" tone="nav" />
            <span className="master-nav-label">Strategy Master</span>
          </button>
          <button
            className={`master-nav-item${showTradeEntryActive ? ' active' : ''}`}
            type="button"
            onClick={onTradeEntry}
            title="Trade Entry"
            aria-label="Trade Entry"
            data-tooltip="Trade Entry"
          >
            <SidebarAvatar label="Trade Entry" tone="nav" />
            <span className="master-nav-label">Trade Entry</span>
          </button>
        </div>

        <div className="master-sidebar-divider" aria-hidden="true" />

        <div className="master-nav-group">
          <div className="master-nav-title">Strategies</div>
          {strategies.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`master-nav-pill${activeStrategyName === item.strategy_name ? ' active' : ''}`}
              onClick={() => onStrategySelect(item.strategy_name)}
              title={item.strategy_name}
              aria-label={item.strategy_name}
              data-tooltip={item.strategy_name}
            >
              <SidebarAvatar label={getAvatarLabel(item.strategy_name)} tone="strategy" />
              <span className="master-nav-label">{item.strategy_name}</span>
            </button>
          ))}
        </div>
        <div className="master-sidebar-spacer" aria-hidden="true" />
        <div className="master-sidebar-footer" aria-hidden="true">
          <SidebarWaveIllustration />
        </div>
      </div>
    </aside>
  );
}

export function StrategyMasterPage() {
  const getInitialActivePage = () => {
    if (typeof window === 'undefined') return 'strategy-master' as const;
    if (window.location.hash === '#trade-entry') return 'trade-entry' as const;
    if (window.location.hash === '#ema-intraday-historical-data') return 'ema-intraday' as const;
    return 'strategy-master' as const;
  };
  const shouldOpenEmaHistoricalData = typeof window !== 'undefined' && window.location.hash === '#ema-intraday-historical-data';
  const [activePage, setActivePage] = useState<'strategy-master' | 'ema-intraday' | 'strategy-page' | 'trade-entry'>(getInitialActivePage());
  const isTradeEntryPage = activePage === 'trade-entry';
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [strategyModalOffset, setStrategyModalOffset] = useState({ x: 0, y: 0 });
  const strategyModalDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
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
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    setActivePage('strategy-master');
  };

  const openTradeEntry = () => {
    setIsStrategyModalOpen(false);
    setEditingStrategy(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, document.title, `${window.location.pathname}#trade-entry`);
    }
    setActivePage('trade-entry');
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

  const closeStrategyModal = () => {
    strategyModalDragRef.current = null;
    setIsStrategyModalOpen(false);
    setEditingStrategy(null);
    setStrategyModalOffset({ x: 0, y: 0 });
  };

  const startStrategyModalDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, label')) return;

    event.preventDefault();
    strategyModalDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: strategyModalOffset.x,
      offsetY: strategyModalOffset.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = strategyModalDragRef.current;
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;

      setStrategyModalOffset({
        x: dragState.offsetX + (moveEvent.clientX - dragState.startX),
        y: dragState.offsetY + (moveEvent.clientY - dragState.startY),
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const dragState = strategyModalDragRef.current;
      if (!dragState || upEvent.pointerId !== dragState.pointerId) return;

      strategyModalDragRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  useEffect(() => {
    if (!isStrategyModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeStrategyModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStrategyModalOpen]);

  useEffect(() => {
    const syncPageFromHash = () => {
      if (window.location.hash === '#trade-entry') {
        setActivePage('trade-entry');
        return;
      }
      if (window.location.hash === '#ema-intraday-historical-data') {
        setActivePage('ema-intraday');
        return;
      }
      setActivePage('strategy-master');
    };

    window.addEventListener('hashchange', syncPageFromHash);
    syncPageFromHash();
    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

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
            onTradeEntry={openTradeEntry}
            onMasters={() => {
              window.history.replaceState({}, document.title, window.location.pathname);
              openStrategyMaster();
            }}
          />
        }
      />
    );
  }

  if (activePage === 'trade-entry') {
    return (
      <main className={shellClassName}>
        <StrategySidebar
          activeStrategyName={selectedStrategy}
          collapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
          showTradeEntryActive
          strategies={sidebarStrategies}
          onStrategySelect={handleStrategySelect}
          onTradeEntry={openTradeEntry}
          onMasters={openStrategyMaster}
        />
        <TradeEntryPage embedded />
      </main>
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
          onTradeEntry={openTradeEntry}
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
        showTradeEntryActive={isTradeEntryPage}
        strategies={sidebarStrategies}
        onStrategySelect={handleStrategySelect}
        onTradeEntry={openTradeEntry}
        onMasters={() => void loadStrategies()}
      />

      <section className="master-content strategy-master-content">
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
      setStrategyModalOffset({ x: 0, y: 0 });
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
              setStrategyModalOffset({ x: 0, y: 0 });
              if (strategy.strategy_name === 'EMA Intraday') {
                setActivePage('ema-intraday');
              } else {
                setActivePage('strategy-page');
              }
            }}
            onEdit={(strategy) => {
              setSelectedStrategy(strategy.strategy_name);
              setEditingStrategy(strategy);
              setStrategyModalOffset({ x: 0, y: 0 });
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
              closeStrategyModal();
            }}
          >
            <section
              className="strategy-modal"
              role="dialog"
              aria-modal="true"
              aria-label={editingStrategy ? 'Edit Strategy' : 'Add Strategy'}
              onClick={(event) => event.stopPropagation()}
              style={{
                transform: `translate(${strategyModalOffset.x}px, ${strategyModalOffset.y}px)`,
              }}
            >
              <div className="strategy-modal-header" onPointerDown={startStrategyModalDrag}>
                <div>
                  <p className="eyebrow master-eyebrow">Strategy Master</p>
                  <h2>{editingStrategy ? `Edit Strategy #${editingStrategy.id}` : 'Add Strategy'}</h2>
                </div>
                <button
                  className="modal-x-button strategy-modal-close"
                  type="button"
                  onClick={() => {
                    closeStrategyModal();
                  }}
                  aria-label="Close"
                >
                  X
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
                      closeStrategyModal();
                    }
                  }}
                  onCancel={() => {
                    closeStrategyModal();
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
