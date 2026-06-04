import { useMemo, useState } from 'react';
import type { EntryReason, ExitReason, ReasonInsert, TradeTransitionRule, TradeTransitionRuleInsert } from './masters';
import { useMasters } from './useMasters';

type TabKey = 'entry-reasons' | 'exit-reasons' | 'transition-rules';
type StatusFilter = 'all' | 'active' | 'inactive';

const EMPTY_REASON: ReasonInsert = {
  name: '',
  category: '',
  is_active: true,
  sort_order: 1,
};

const EMPTY_RULE: TradeTransitionRuleInsert = {
  strategy_id: null,
  trigger_option: 'CE',
  exit_reason: '',
  category: 'Primary',
  exit_ce_position: true,
  exit_pe_position: true,
  other_leg_exit_reason: null,
  create_new_leg: true,
  new_leg_option: 'PE',
  entry_reason: null,
  is_active: true,
  sort_order: 1,
};

function matchesStatus(isActive: boolean, filter: StatusFilter) {
  if (filter === 'all') return true;
  return filter === 'active' ? isActive : !isActive;
}

function matchesQuery(values: string[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value.toLowerCase().includes(normalized));
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={active ? 'status-pill active' : 'status-pill inactive'}>{active ? 'Active' : 'Inactive'}</span>;
}

function Toolbar({
  title,
  count,
  query,
  onQuery,
  filter,
  onFilter,
  onRefresh,
  onAdd,
}: {
  title: string;
  count: number;
  query: string;
  onQuery: (value: string) => void;
  filter: StatusFilter;
  onFilter: (value: StatusFilter) => void;
  onRefresh: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="simple-toolbar">
      <div>
        <strong>{title}</strong>
        <span>{count} records</span>
      </div>
      <div className="simple-toolbar-actions">
        <input type="text" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search" />
        <select value={filter} onChange={(event) => onFilter(event.target.value as StatusFilter)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button className="button secondary" type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button className="button primary" type="button" onClick={onAdd}>
          Add
        </button>
      </div>
    </div>
  );
}

function ReasonEditor({
  title,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  title: string;
  draft: ReasonInsert;
  onChange: (next: ReasonInsert) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="simple-editor">
      <div className="simple-editor-header">
        <strong>{title}</strong>
        <div className="row-actions">
          <button className="button secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="button primary" type="button" onClick={onSave} disabled={saving || !draft.name.trim()}>
            Save
          </button>
        </div>
      </div>
      <div className="simple-grid simple-grid-4">
        <label>
          <span>Name</span>
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
        </label>
        <label>
          <span>Category</span>
          <input value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })} />
        </label>
        <label>
          <span>Sort Order</span>
          <input
            type="number"
            min={1}
            value={draft.sort_order}
            onChange={(event) => onChange({ ...draft, sort_order: Number(event.target.value) })}
          />
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={draft.is_active} onChange={(event) => onChange({ ...draft, is_active: event.target.checked })} />
          <span>Active</span>
        </label>
      </div>
    </div>
  );
}

function RuleEditor({
  title,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  entryReasons,
  exitReasons,
}: {
  title: string;
  draft: TradeTransitionRuleInsert;
  onChange: (next: TradeTransitionRuleInsert) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  entryReasons: EntryReason[];
  exitReasons: ExitReason[];
}) {
  return (
    <div className="simple-editor">
      <div className="simple-editor-header">
        <strong>{title}</strong>
        <div className="row-actions">
          <button className="button secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="button primary" type="button" onClick={onSave} disabled={saving || !draft.exit_reason.trim()}>
            Save
          </button>
        </div>
      </div>
      <div className="simple-grid simple-grid-4">
        <label>
          <span>Trigger</span>
          <select value={draft.trigger_option} onChange={(event) => onChange({ ...draft, trigger_option: event.target.value as 'CE' | 'PE' })}>
            <option value="CE">CE</option>
            <option value="PE">PE</option>
          </select>
        </label>
        <label>
          <span>Exit Reason</span>
          <select value={draft.exit_reason} onChange={(event) => onChange({ ...draft, exit_reason: event.target.value })}>
            <option value="">Select</option>
            {exitReasons.map((reason) => (
              <option key={reason.id} value={reason.name}>
                {reason.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as 'Primary' | 'EOD' })}>
            <option value="Primary">Primary</option>
            <option value="EOD">EOD</option>
          </select>
        </label>
        <label>
          <span>Sort Order</span>
          <input type="number" min={1} value={draft.sort_order} onChange={(event) => onChange({ ...draft, sort_order: Number(event.target.value) })} />
        </label>
        <label>
          <span>Strategy ID</span>
          <input value={draft.strategy_id ?? ''} onChange={(event) => onChange({ ...draft, strategy_id: event.target.value || null })} />
        </label>
        <label>
          <span>Entry Reason</span>
          <select value={draft.entry_reason ?? ''} onChange={(event) => onChange({ ...draft, entry_reason: event.target.value || null })}>
            <option value="">None</option>
            {entryReasons.map((reason) => (
              <option key={reason.id} value={reason.name}>
                {reason.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Other Leg Exit</span>
          <select value={draft.other_leg_exit_reason ?? ''} onChange={(event) => onChange({ ...draft, other_leg_exit_reason: event.target.value || null })}>
            <option value="">None</option>
            {exitReasons.map((reason) => (
              <option key={reason.id} value={reason.name}>
                {reason.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={draft.is_active} onChange={(event) => onChange({ ...draft, is_active: event.target.checked })} />
          <span>Active</span>
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={draft.exit_ce_position} onChange={(event) => onChange({ ...draft, exit_ce_position: event.target.checked })} />
          <span>Exit CE</span>
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={draft.exit_pe_position} onChange={(event) => onChange({ ...draft, exit_pe_position: event.target.checked })} />
          <span>Exit PE</span>
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={draft.create_new_leg}
            onChange={(event) => onChange({ ...draft, create_new_leg: event.target.checked, new_leg_option: event.target.checked ? draft.new_leg_option ?? 'PE' : null })}
          />
          <span>Create New Leg</span>
        </label>
        <label>
          <span>New Leg</span>
          <select value={draft.new_leg_option ?? ''} disabled={!draft.create_new_leg} onChange={(event) => onChange({ ...draft, new_leg_option: event.target.value ? (event.target.value as 'CE' | 'PE') : null })}>
            <option value="">None</option>
            <option value="CE">CE</option>
            <option value="PE">PE</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function MastersPage() {
  const {
    entryReasons,
    exitReasons,
    transitionRules,
    error,
    loadMasters,
    saveEntry,
    saveExit,
    saveRule,
    status,
    toggleEntry,
    toggleExit,
    toggleRule,
    deleteEntry,
    deleteExit,
    deleteRule,
  } = useMasters();

  const [activeTab, setActiveTab] = useState<TabKey>('entry-reasons');

  const [entryQuery, setEntryQuery] = useState('');
  const [entryStatus, setEntryStatus] = useState<StatusFilter>('all');
  const [entryEditingId, setEntryEditingId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<ReasonInsert>(EMPTY_REASON);

  const [exitQuery, setExitQuery] = useState('');
  const [exitStatus, setExitStatus] = useState<StatusFilter>('all');
  const [exitEditingId, setExitEditingId] = useState<string | null>(null);
  const [exitDraft, setExitDraft] = useState<ReasonInsert>(EMPTY_REASON);

  const [ruleQuery, setRuleQuery] = useState('');
  const [ruleStatus, setRuleStatus] = useState<StatusFilter>('all');
  const [ruleEditingId, setRuleEditingId] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<TradeTransitionRuleInsert>(EMPTY_RULE);

  const busy = status !== 'idle';

  const visibleEntryReasons = useMemo(
    () =>
      entryReasons.filter(
        (row) =>
          matchesStatus(row.is_active, entryStatus) &&
          matchesQuery([row.name, row.category, String(row.sort_order)], entryQuery),
      ),
    [entryReasons, entryQuery, entryStatus],
  );

  const visibleExitReasons = useMemo(
    () =>
      exitReasons.filter(
        (row) =>
          matchesStatus(row.is_active, exitStatus) &&
          matchesQuery([row.name, row.category, String(row.sort_order)], exitQuery),
      ),
    [exitReasons, exitQuery, exitStatus],
  );

  const visibleRules = useMemo(
    () =>
      transitionRules.filter(
        (row) =>
          matchesStatus(row.is_active, ruleStatus) &&
          matchesQuery(
            [
              row.strategy_id ?? '',
              row.trigger_option,
              row.exit_reason,
              row.entry_reason ?? '',
              row.other_leg_exit_reason ?? '',
              row.category,
            ],
            ruleQuery,
          ),
      ),
    [transitionRules, ruleQuery, ruleStatus],
  );

  async function submitEntry() {
    await saveEntry(entryEditingId, {
      name: entryDraft.name.trim(),
      category: entryDraft.category.trim() || 'Entry',
      is_active: entryDraft.is_active,
      sort_order: Number.isFinite(entryDraft.sort_order) ? entryDraft.sort_order : 1,
    });
    setEntryEditingId(null);
    setEntryDraft(EMPTY_REASON);
  }

  async function submitExit() {
    await saveExit(exitEditingId, {
      name: exitDraft.name.trim(),
      category: exitDraft.category.trim() || 'Exit',
      is_active: exitDraft.is_active,
      sort_order: Number.isFinite(exitDraft.sort_order) ? exitDraft.sort_order : 1,
    });
    setExitEditingId(null);
    setExitDraft(EMPTY_REASON);
  }

  async function submitRule() {
    await saveRule(ruleEditingId, {
      strategy_id: ruleDraft.strategy_id?.trim() ? ruleDraft.strategy_id.trim() : null,
      trigger_option: ruleDraft.trigger_option,
      exit_reason: ruleDraft.exit_reason.trim(),
      category: ruleDraft.category,
      exit_ce_position: ruleDraft.exit_ce_position,
      exit_pe_position: ruleDraft.exit_pe_position,
      other_leg_exit_reason: ruleDraft.other_leg_exit_reason?.trim() ? ruleDraft.other_leg_exit_reason.trim() : null,
      create_new_leg: ruleDraft.create_new_leg,
      new_leg_option: ruleDraft.create_new_leg ? ruleDraft.new_leg_option : null,
      entry_reason: ruleDraft.entry_reason?.trim() ? ruleDraft.entry_reason.trim() : null,
      is_active: ruleDraft.is_active,
      sort_order: Number.isFinite(ruleDraft.sort_order) ? ruleDraft.sort_order : 1,
    });
    setRuleEditingId(null);
    setRuleDraft(EMPTY_RULE);
  }

  function beginAddEntry() {
    setEntryEditingId(null);
    setEntryDraft({ ...EMPTY_REASON, category: 'Entry' });
  }

  function beginAddExit() {
    setExitEditingId(null);
    setExitDraft({ ...EMPTY_REASON, category: 'Exit' });
  }

  function beginAddRule() {
    setRuleEditingId(null);
    setRuleDraft({
      ...EMPTY_RULE,
      exit_reason: exitReasons[0]?.name ?? '',
      entry_reason: entryReasons[0]?.name ?? null,
      other_leg_exit_reason: exitReasons[1]?.name ?? null,
    });
  }

  function editEntry(row: EntryReason) {
    setActiveTab('entry-reasons');
    setEntryEditingId(row.id);
    setEntryDraft({
      name: row.name,
      category: row.category,
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
  }

  function editExit(row: ExitReason) {
    setActiveTab('exit-reasons');
    setExitEditingId(row.id);
    setExitDraft({
      name: row.name,
      category: row.category,
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
  }

  function editRule(row: TradeTransitionRule) {
    setActiveTab('transition-rules');
    setRuleEditingId(row.id);
    setRuleDraft({
      strategy_id: row.strategy_id,
      trigger_option: row.trigger_option,
      exit_reason: row.exit_reason,
      category: row.category,
      exit_ce_position: row.exit_ce_position,
      exit_pe_position: row.exit_pe_position,
      other_leg_exit_reason: row.other_leg_exit_reason,
      create_new_leg: row.create_new_leg,
      new_leg_option: row.new_leg_option,
      entry_reason: row.entry_reason,
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">EMA Intraday</p>
          <h2>Masters</h2>
        </div>
        <button className="button secondary" type="button" onClick={() => void loadMasters()} disabled={busy}>
          Refresh
        </button>
      </div>

      <div className="panel-body simple-stack">
        {error ? <div className="alert">{error}</div> : null}

        <div className="simple-tabs">
          <button className={activeTab === 'entry-reasons' ? 'simple-tab active' : 'simple-tab'} type="button" onClick={() => setActiveTab('entry-reasons')}>
            Entry Reasons
          </button>
          <button className={activeTab === 'exit-reasons' ? 'simple-tab active' : 'simple-tab'} type="button" onClick={() => setActiveTab('exit-reasons')}>
            Exit Reasons
          </button>
          <button className={activeTab === 'transition-rules' ? 'simple-tab active' : 'simple-tab'} type="button" onClick={() => setActiveTab('transition-rules')}>
            Transition Rules
          </button>
        </div>

        {activeTab === 'entry-reasons' ? (
          <div className="simple-section">
            <Toolbar
              title="Entry Reasons"
              count={visibleEntryReasons.length}
              query={entryQuery}
              onQuery={setEntryQuery}
              filter={entryStatus}
              onFilter={setEntryStatus}
              onRefresh={() => void loadMasters()}
              onAdd={beginAddEntry}
            />
            {entryEditingId !== null || !entryDraft.name ? (
              <ReasonEditor
                title={entryEditingId ? 'Edit Entry Reason' : 'Add Entry Reason'}
                draft={entryDraft}
                onChange={setEntryDraft}
                onSave={() => void submitEntry()}
                onCancel={() => {
                  setEntryEditingId(null);
                  setEntryDraft(EMPTY_REASON);
                }}
                saving={busy}
              />
            ) : null}
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntryReasons.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan={5}>
                        No entry reasons found.
                      </td>
                    </tr>
                  ) : (
                    visibleEntryReasons.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.category}</td>
                        <td>{row.sort_order}</td>
                        <td>
                          <StatusPill active={row.is_active} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="button ghost" type="button" onClick={() => editEntry(row)} disabled={busy}>
                              Edit
                            </button>
                            <button className="button ghost" type="button" onClick={() => void toggleEntry(row.id, !row.is_active)} disabled={busy}>
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="button danger" type="button" onClick={() => void deleteEntry(row.id)} disabled={busy}>
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
          </div>
        ) : null}

        {activeTab === 'exit-reasons' ? (
          <div className="simple-section">
            <Toolbar
              title="Exit Reasons"
              count={visibleExitReasons.length}
              query={exitQuery}
              onQuery={setExitQuery}
              filter={exitStatus}
              onFilter={setExitStatus}
              onRefresh={() => void loadMasters()}
              onAdd={beginAddExit}
            />
            {exitEditingId !== null || !exitDraft.name ? (
              <ReasonEditor
                title={exitEditingId ? 'Edit Exit Reason' : 'Add Exit Reason'}
                draft={exitDraft}
                onChange={setExitDraft}
                onSave={() => void submitExit()}
                onCancel={() => {
                  setExitEditingId(null);
                  setExitDraft(EMPTY_REASON);
                }}
                saving={busy}
              />
            ) : null}
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExitReasons.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan={5}>
                        No exit reasons found.
                      </td>
                    </tr>
                  ) : (
                    visibleExitReasons.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.category}</td>
                        <td>{row.sort_order}</td>
                        <td>
                          <StatusPill active={row.is_active} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="button ghost" type="button" onClick={() => editExit(row)} disabled={busy}>
                              Edit
                            </button>
                            <button className="button ghost" type="button" onClick={() => void toggleExit(row.id, !row.is_active)} disabled={busy}>
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="button danger" type="button" onClick={() => void deleteExit(row.id)} disabled={busy}>
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
          </div>
        ) : null}

        {activeTab === 'transition-rules' ? (
          <div className="simple-section">
            <Toolbar
              title="Transition Rules"
              count={visibleRules.length}
              query={ruleQuery}
              onQuery={setRuleQuery}
              filter={ruleStatus}
              onFilter={setRuleStatus}
              onRefresh={() => void loadMasters()}
              onAdd={beginAddRule}
            />
            {ruleEditingId !== null || !ruleDraft.exit_reason ? (
              <RuleEditor
                title={ruleEditingId ? 'Edit Transition Rule' : 'Add Transition Rule'}
                draft={ruleDraft}
                onChange={setRuleDraft}
                onSave={() => void submitRule()}
                onCancel={() => {
                  setRuleEditingId(null);
                  setRuleDraft(EMPTY_RULE);
                }}
                saving={busy}
                entryReasons={entryReasons}
                exitReasons={exitReasons}
              />
            ) : null}
            <div className="table-shell transition-table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Trigger</th>
                    <th>Exit Reason</th>
                    <th>Category</th>
                    <th>Entry Reason</th>
                    <th>Other Exit</th>
                    <th>New Leg</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRules.length === 0 ? (
                    <tr>
                      <td className="empty-cell" colSpan={8}>
                        No transition rules found.
                      </td>
                    </tr>
                  ) : (
                    visibleRules.map((row) => (
                      <tr key={row.id}>
                        <td>{row.trigger_option}</td>
                        <td>{row.exit_reason}</td>
                        <td>{row.category}</td>
                        <td>{row.entry_reason ?? '-'}</td>
                        <td>{row.other_leg_exit_reason ?? '-'}</td>
                        <td>{row.create_new_leg ? row.new_leg_option ?? 'Yes' : 'No'}</td>
                        <td>
                          <StatusPill active={row.is_active} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="button ghost" type="button" onClick={() => editRule(row)} disabled={busy}>
                              Edit
                            </button>
                            <button className="button ghost" type="button" onClick={() => void toggleRule(row.id, !row.is_active)} disabled={busy}>
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button className="button danger" type="button" onClick={() => void deleteRule(row.id)} disabled={busy}>
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
