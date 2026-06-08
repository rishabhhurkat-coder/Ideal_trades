import { useEffect, useState, type ReactNode } from 'react';
import { HistoricalDataPage } from './HistoricalData/HistoricalDataPage';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { MastersPage } from './Masters/MastersPage';
import { EMAIntradayTradePage } from './TradeDashboard/EMAIntradayTradePage';

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
  const [modalOffset, setModalOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const startModalDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, label')) return;

    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: modalOffset.x,
      offsetY: modalOffset.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState || moveEvent.pointerId !== dragState.pointerId) return;

      setModalOffset({
        x: dragState.offsetX + (moveEvent.clientX - dragState.startX),
        y: dragState.offsetY + (moveEvent.clientY - dragState.startY),
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState || upEvent.pointerId !== dragState.pointerId) return;

      dragRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="ema-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={compact ? 'ema-modal ema-modal--compact' : 'ema-modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        style={{
          transform: `translate(${modalOffset.x}px, ${modalOffset.y}px)`,
        }}
      >
        <div className="ema-modal-header" onPointerDown={startModalDrag}>
          <div>
            {compact ? null : <p className="eyebrow">EMA Intraday</p>}
            <h2>{title}</h2>
          </div>
          <button className="modal-x-button" type="button" onClick={onClose} aria-label="Close">
            X
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

      <EMAIntradayTradePage />
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

