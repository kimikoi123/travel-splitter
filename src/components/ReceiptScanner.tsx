import { useState, useRef, useCallback } from 'react';
import { Camera, ScanLine, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { compressImage, compressImageForOcr } from '../utils/imageUtils';
import { recognizeReceiptText } from '../utils/ocrEngine';
import { parseReceiptText } from '../utils/receiptParser';
import type { OcrProgress } from '../utils/ocrEngine';
import type { ReceiptData } from '../utils/receiptParser';

export interface ScanResult {
  amount: string;
  description: string;
  date: string;
  category: string | null;
  receiptDataUrl: string;
}

interface ReceiptScannerProps {
  onApply: (result: ScanResult) => void;
  /** Called with the compressed display-quality photo (or null on remove). Used by ExpenseForm for storage. */
  onPhotoChange?: (dataUrl: string | null) => void;
  /** Pre-loaded receipt photo (for editing existing expenses) */
  initialPhoto?: string | null;
  /** Whether to persist the photo (ExpenseForm) or keep it transient (TransactionForm) */
  showPhoto?: boolean;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-500/15 text-green-600',
  medium: 'bg-yellow-500/15 text-yellow-600',
  low: 'bg-red-500/15 text-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  loading: 'Loading OCR engine...',
  recognizing: 'Reading receipt...',
};

export default function ReceiptScanner({ onApply, onPhotoChange, initialPhoto, showPhoto = true }: ReceiptScannerProps) {
  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setPhoto(dataUrl);
      setOcrFile(file);
      setResult(null);
      setError(null);
      onPhotoChange?.(dataUrl);
    } catch {
      setError('Failed to process image');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onPhotoChange]);

  const handleRemovePhoto = useCallback(() => {
    setPhoto(null);
    setOcrFile(null);
    setResult(null);
    setRawText('');
    setError(null);
    onPhotoChange?.(null);
  }, [onPhotoChange]);

  const handleScan = useCallback(async () => {
    if (!ocrFile && !photo) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      // Use higher quality image for OCR
      let ocrImage: string;
      if (ocrFile) {
        ocrImage = await compressImageForOcr(ocrFile);
      } else {
        ocrImage = photo!;
      }

      const text = await recognizeReceiptText(ocrImage, setProgress);
      setRawText(text);
      const parsed = parseReceiptText(text);
      setResult(parsed);
      setEditAmount(parsed.amount != null ? String(parsed.amount) : '');
      setEditDescription(parsed.merchant ?? '');
      setEditDate(parsed.date ?? '');
    } catch {
      setError('Failed to scan receipt. Try again with a clearer photo.');
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }, [ocrFile, photo]);

  const handleApply = useCallback(() => {
    onApply({
      amount: editAmount,
      description: editDescription,
      date: editDate,
      category: result?.category ?? null,
      receiptDataUrl: photo!,
    });
    setResult(null);
  }, [editAmount, editDescription, editDate, result, photo, onApply]);

  const handleDismiss = useCallback(() => {
    setResult(null);
    setRawText('');
  }, []);

  const progressPercent = progress ? Math.round(progress.progress * 100) : 0;

  return (
    <div className="pt-3 border-t border-border/20">
      <label className="text-[10px] font-medium text-text-secondary/50 uppercase tracking-widest mb-2.5 block" data-heading>
        Receipt scan
      </label>

      {/* Photo capture / preview */}
      {photo && showPhoto ? (
        <div className="flex items-start gap-3">
          <div className="relative">
            <img
              src={photo}
              alt="Receipt"
              className="w-24 h-24 object-cover rounded-xl border border-border/40"
            />
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="absolute -top-2 -right-2 p-1.5 bg-danger rounded-full text-white hover:bg-danger/80 transition-all shadow-sm"
              aria-label="Remove receipt photo"
            >
              <Trash2 size={10} />
            </button>
          </div>

          {/* Scan button */}
          {!scanning && !result && (
            <button
              type="button"
              onClick={handleScan}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-all"
            >
              <ScanLine size={16} />
              Scan receipt
            </button>
          )}
        </div>
      ) : !photo ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-4 bg-surface-light/40 border border-dashed border-border/40 rounded-xl text-sm text-text-secondary/40 hover:text-text-secondary hover:border-primary/30 transition-all"
        >
          <Camera size={16} />
          Scan receipt
        </button>
      ) : (
        /* Photo captured but showPhoto=false (TransactionForm): just show scan button */
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <Camera size={14} />
            Photo captured
          </div>
          {!scanning && !result && (
            <button
              type="button"
              onClick={handleScan}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-all"
            >
              <ScanLine size={16} />
              Scan
            </button>
          )}
          <button
            type="button"
            onClick={handleRemovePhoto}
            className="p-2 text-text-secondary/40 hover:text-danger transition-colors"
            aria-label="Remove photo"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoSelect}
        className="hidden"
        aria-label="Capture receipt photo"
      />

      {/* Scanning progress */}
      {scanning && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            {STATUS_LABELS[progress?.status ?? 'loading']} {progressPercent > 0 && `${progressPercent}%`}
          </div>
          <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progressPercent, 5)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}

      {/* OCR Results */}
      {result && !scanning && (
        <div className="mt-3 bg-surface-light/60 border border-border/40 rounded-xl p-4 space-y-3 animate-scale-in">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-text-secondary/50 uppercase tracking-widest">
              Extracted data
            </span>
            <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-full ${CONFIDENCE_STYLES[result.confidence]}`}>
              {result.confidence}
            </span>
          </div>

          {/* Editable amount */}
          <div>
            <label className="text-[10px] text-text-secondary/50 mb-1 block">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          {/* Editable description */}
          <div>
            <label className="text-[10px] text-text-secondary/50 mb-1 block">Description</label>
            <input
              type="text"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Store / merchant name"
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          {/* Editable date */}
          <div>
            <label className="text-[10px] text-text-secondary/50 mb-1 block">Date</label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          {result.category && (
            <p className="text-xs text-text-secondary/50">
              Suggested category: <span className="text-primary font-medium">{result.category}</span>
            </p>
          )}

          {/* Raw text toggle */}
          <button
            type="button"
            onClick={() => setShowRawText(!showRawText)}
            className="flex items-center gap-1 text-[10px] text-text-secondary/40 hover:text-text-secondary transition-colors"
          >
            {showRawText ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Raw text
          </button>
          {showRawText && (
            <pre className="text-[10px] text-text-secondary/50 bg-surface rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">
              {rawText || 'No text extracted'}
            </pre>
          )}

          {/* Apply / Dismiss */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={!editAmount}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                editAmount
                  ? 'bg-primary text-white active:scale-[0.98]'
                  : 'bg-primary/40 text-white/50 cursor-not-allowed'
              }`}
            >
              <Check size={14} />
              Apply
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="px-4 py-2.5 bg-surface-light border border-border/40 rounded-xl text-sm text-text-secondary hover:text-text-primary transition-all"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
