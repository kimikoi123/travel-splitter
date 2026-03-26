import { ArrowLeft, Download, Upload, PlaneTakeoff, Smartphone } from 'lucide-react';
import { useRef } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function Header({ activeTrip, onBack, onExport, onImport }) {
  const fileRef = useRef();
  const { canInstall, installApp } = usePWAInstall();

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const success = onImport(ev.target.result);
      if (!success) alert('Invalid backup file');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="bg-surface border-b border-border px-4 py-3 sm:px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTrip ? (
            <button
              onClick={onBack}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-light transition-colors text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              <PlaneTakeoff size={20} />
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold text-text-primary leading-tight">
              {activeTrip ? activeTrip.name : 'SplitTrip'}
            </h1>
            {!activeTrip && (
              <p className="text-xs text-text-secondary">Travel expense splitter</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canInstall && (
            <button
              onClick={installApp}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-light transition-colors text-primary hover:text-primary-light"
              title="Install app"
            >
              <Smartphone size={18} />
            </button>
          )}
          <button
            onClick={onExport}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-light transition-colors text-text-secondary hover:text-text-primary"
            title="Export data"
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-light transition-colors text-text-secondary hover:text-text-primary"
            title="Import data"
          >
            <Upload size={18} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>
    </header>
  );
}
