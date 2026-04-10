import { useCallback, useState } from 'react';
import { ArrowLeft, QrCode, Type } from 'lucide-react';
import { joinVaultWithToken } from '../../sync/syncEngine';
import QrScanner from './QrScanner';

interface Props {
  onClose: () => void;
}

type Mode = 'scan' | 'manual';

// Crockford base32 alphabet used by the server for pair tokens (no 0/O/1/I/L).
const TOKEN_ALPHABET = /^[2-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

// Device-B flow: scan the QR from device A OR type the 6-character code,
// then call joinVaultWithToken. On success we reload the page — that's
// the simplest way to let every existing hook (useUserPreferences,
// useTransactions, ...) pick up the freshly-pulled remote state.
// A future phase can replace the reload with event-driven re-fetches.
export default function PairEntryScreen({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('scan');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trySubmit = useCallback(async (rawToken: string) => {
    const token = rawToken.trim().toUpperCase();
    if (!TOKEN_ALPHABET.test(token)) {
      setError('That code does not look right — 6 characters, letters and digits (no 0, 1, O, I, L).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinVaultWithToken(token, `${navigator.platform}`);
      // Reload so every data hook re-reads from the freshly-synced Dexie.
      window.location.reload();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not pair. Try again.');
    }
  }, []);

  const handleScan = useCallback(
    (value: string) => {
      void trySubmit(value);
    },
    [trySubmit],
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void trySubmit(code);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-bg flex flex-col">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <button
          onClick={onClose}
          aria-label="Back"
          className="p-2 -ml-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-sm font-semibold text-text-primary">Pair with existing device</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-sm mx-auto flex flex-col gap-6">
          <p className="text-xs text-text-secondary leading-relaxed">
            Open <span className="text-text-primary">Settings → Sync → Pair new device</span> on
            the device that already has your data, then scan the QR or type the 6-character code below.
          </p>

          <div className="flex bg-surface rounded-xl border border-border p-1">
            <button
              type="button"
              onClick={() => setMode('scan')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'scan' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <QrCode size={14} />
              Scan QR
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'manual' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Type size={14} />
              Type code
            </button>
          </div>

          {mode === 'scan' ? (
            <QrScanner active={mode === 'scan' && !busy} onDetect={handleScan} onError={setError} />
          ) : (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
              <label
                htmlFor="pair-code"
                className="text-[11px] text-text-secondary font-semibold uppercase tracking-wider"
              >
                Pair code
              </label>
              <input
                id="pair-code"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                disabled={busy}
                placeholder="ABC234"
                className="bg-surface border border-border rounded-xl py-3 px-4 text-center text-2xl font-mono tracking-widest text-text-primary placeholder:text-text-secondary/30 outline-none focus:ring-2 focus:ring-primary/40 transition-shadow disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="w-full bg-primary text-white rounded-2xl py-3 font-semibold text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? 'Pairing…' : 'Pair'}
              </button>
            </form>
          )}

          {error && (
            <div className="rounded-xl bg-danger/5 border border-danger/20 px-4 py-3">
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {busy && mode === 'scan' && (
            <p className="text-center text-xs text-text-secondary">Pairing…</p>
          )}
        </div>
      </div>
    </div>
  );
}
