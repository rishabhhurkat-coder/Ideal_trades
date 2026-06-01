import type { Strategy } from '../types/strategy';

type StrategyTableProps = {
  strategies: Strategy[];
  busy: boolean;
  onEdit: (strategy: Strategy) => void;
  onToggleActive: (strategy: Strategy) => void;
  onDelete: (strategy: Strategy) => void;
};

export function StrategyTable({ strategies, busy, onEdit, onToggleActive, onDelete }: StrategyTableProps) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Strategy Name</th>
            <th>Strategy Type</th>
            <th>Trade Style</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {strategies.length === 0 ? (
            <tr>
              <td className="empty-cell" colSpan={6}>
                No strategies found.
              </td>
            </tr>
          ) : (
            strategies.map((strategy) => (
              <tr key={strategy.id}>
                <td>{strategy.id}</td>
                <td>{strategy.strategy_name}</td>
                <td>{strategy.strategy_type || '-'}</td>
                <td>{strategy.trade_style || '-'}</td>
                <td>
                  <span className={strategy.active ? 'status-pill active' : 'status-pill inactive'}>
                    {strategy.active ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="button ghost" type="button" onClick={() => onEdit(strategy)} disabled={busy}>
                      Edit
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => onToggleActive(strategy)}
                      disabled={busy}
                    >
                      {strategy.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="button danger" type="button" onClick={() => onDelete(strategy)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
