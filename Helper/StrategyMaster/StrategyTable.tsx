import type { Strategy } from './strategy';
import { formatStrategyType } from './strategy';

type StrategyTableProps = {
  strategies: Strategy[];
  busy: boolean;
  onOpenStrategy: (strategy: Strategy) => void;
  onEdit: (strategy: Strategy) => void;
  onDelete: (strategy: Strategy) => void;
};

function ActionIcon({
  type,
}: {
  type: 'edit' | 'delete';
}) {
  if (type === 'edit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 17.25V20h2.75L18.8 7.95l-2.75-2.75L4 17.25Zm14.71-9.04c.39-.39.39-1.02 0-1.41l-1.51-1.51a1 1 0 0 0-1.41 0l-1.18 1.18 2.75 2.75 1.35-1.01Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9Zm-7 0h2v9H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function RowActionButton({
  label,
  tone,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  tone: 'edit' | 'delete';
  onClick: () => void;
  disabled: boolean;
  icon: 'edit' | 'delete';
}) {
  return (
    <button className={`table-action-button ${tone}`} type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      <ActionIcon type={icon} />
    </button>
  );
}

export function StrategyTable({
  strategies,
  busy,
  onOpenStrategy,
  onEdit,
  onDelete,
}: StrategyTableProps) {
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
            strategies.map((strategy) => {
              return (
                <tr key={strategy.id}>
                  <td>{strategy.id}</td>
                  <td>
                    <button className="link-button" type="button" onClick={() => onOpenStrategy(strategy)} disabled={busy}>
                      {strategy.strategy_name}
                    </button>
                  </td>
                  <td className="strategy-table-emphasis">{formatStrategyType(strategy.strategy_type)}</td>
                  <td className="strategy-table-emphasis">{strategy.trade_style || '-'}</td>
                  <td>
                    <span className={strategy.active ? 'status-pill active' : 'status-pill inactive'}>
                      {strategy.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <RowActionButton
                        label="Edit"
                        tone="edit"
                        icon="edit"
                        onClick={() => onEdit(strategy)}
                        disabled={busy}
                      />
                      <RowActionButton
                        label="Delete"
                        tone="delete"
                        icon="delete"
                        onClick={() => onDelete(strategy)}
                        disabled={busy}
                      />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
