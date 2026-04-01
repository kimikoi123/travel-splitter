import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 pt-4">
      <div
        className="bg-accent/10 border border-accent/25 rounded-xl px-4 py-3 animate-fade-in"
        role="alert"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/20 text-accent shrink-0">
            <WifiOff size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">You're offline</p>
            <p className="text-xs text-text-secondary">Your data is saved locally</p>
          </div>
        </div>
      </div>
    </div>
  );
}
