import { StrategyForm } from '../components/StrategyForm';
import { StrategyTable } from '../components/StrategyTable';
import { useStrategies } from '../hooks/useStrategies';

export function StrategyMasterPage() {
  const {
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
  } = useStrategies();

  const busy = status === 'loading' || status === 'saving';

  return (
    <main className="app-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Master Data</p>
          <h1>Strategy Master</h1>
        </div>
        <button className="button secondary" type="button" onClick={() => void loadStrategies()} disabled={busy}>
          Refresh
        </button>
      </section>

      {error ? <div className="alert">{error}</div> : null}

      <section className="panel">
        <div className="panel-heading">
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

      <section className="panel">
        <div className="panel-heading">
          <h2>Strategies</h2>
          <span>{status === 'loading' ? 'Loading...' : `${strategies.length} records`}</span>
        </div>
        <StrategyTable
          strategies={strategies}
          busy={busy}
          onEdit={setEditingStrategy}
          onToggleActive={(strategy) => void toggleActive(strategy)}
          onDelete={(strategy) => void removeStrategy(strategy)}
        />
      </section>
    </main>
  );
}
