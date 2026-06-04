import { useEffect, useState, type ReactNode } from 'react';
import { HistoricalDataPage } from './HistoricalData/HistoricalDataPage';
import { MastersPage } from './Masters/MastersPage';
import { TradeDashboardPage } from './TradeDashboard/TradeDashboardPage';

type EmaIntradayPageProps = {
  openHistoricalData?: boolean;
  sidebar?: ReactNode;
};

type ModalKind = 'historical' | 'masters' | null;

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20h14v-2H5v2Zm7-18v11.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L12 13.17V2h0Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.89 1h-3.78a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L1.71 7.48a.5.5 0 0 0 .12.64L3.86 9.7c-.04.31-.06.63-.06.94s.02.63.06.94L1.83 13.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.51.4 1.06.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.78a.5.5 0 0 0 .49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.25A3.25 3.25 0 1 1 12 8.75a3.25 3.25 0 0 1 0 6.5Z" />
    </svg>
  );
}

function EmaModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const compact = title === 'Historical Data';

  return (
    <div className="ema-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={compact ? 'ema-modal ema-modal--compact' : 'ema-modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ema-modal-header">
          <div>
            {compact ? null : <p className="eyebrow">EMA Intraday</p>}
            <h2>{title}</h2>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="ema-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmaIntradayPage({ openHistoricalData = false, sidebar }: EmaIntradayPageProps) {
  const [modalKind, setModalKind] = useState<ModalKind>(openHistoricalData ? 'historical' : null);

  useEffect(() => {
    if (openHistoricalData) setModalKind('historical');
  }, [openHistoricalData]);

  const content = (
    <section className="master-content ema-content">
      <section className="trade-dashboard-page-header">
        <div className="trade-dashboard-page-title">
          <h1>EMA Intraday</h1>
        </div>
        <div className="header-actions">
          <button className="button secondary ema-action-button" type="button" onClick={() => setModalKind('historical')}>
            <DownloadIcon />
            <span>Historical Data</span>
          </button>
          <button className="button secondary ema-action-button" type="button" onClick={() => setModalKind('masters')}>
            <SettingsIcon />
            <span>Settings</span>
          </button>
        </div>
      </section>

      <TradeDashboardPage />
    </section>
  );

  return (
    <main className={sidebar ? 'master-shell' : 'app-shell'}>
      {sidebar}
      {content}
      {modalKind === 'historical' ? (
        <EmaModal title="Historical Data" onClose={() => setModalKind(null)}>
          <HistoricalDataPage />
        </EmaModal>
      ) : null}
      {modalKind === 'masters' ? (
        <EmaModal title="Settings" onClose={() => setModalKind(null)}>
          <MastersPage />
        </EmaModal>
      ) : null}
    </main>
  );
}

