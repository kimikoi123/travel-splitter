import { RefreshCw, X } from 'lucide-react';
import { usePWAUpdate } from '../hooks/usePWAUpdate';

export default function UpdatePrompt() {
  const { showUpdate, updateApp, dismissUpdate } = usePWAUpdate();

  if (!showUpdate) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-full max-w-sm px-4"
      role="alert"
      aria-live="polite"
    >
      <div className="glass ring-1 ring-white/5 rounded-xl shadow-lg shadow-black/30 animate-slide-up">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="p-2 rounded-lg bg-primary/20 text-primary shrink-0">
            <RefreshCw size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">Update available</p>
            <p className="text-xs text-text-secondary">Tap to get the latest version</p>
          </div>
          <button
            onClick={updateApp}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/80 transition-colors shrink-0"
          >
            Update
          </button>
          <button
            onClick={dismissUpdate}
            aria-label="Dismiss update notification"
            className="p-1 text-text-secondary hover:text-text-primary transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
