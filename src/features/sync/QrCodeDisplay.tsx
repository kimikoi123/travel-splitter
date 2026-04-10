import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  size?: number;
  label?: string;
}

// Renders a QR code onto a canvas. Dynamically imports `qrcode` so it
// doesn't bloat the main bundle for users who never open the pair flow.
export default function QrCodeDisplay({ value, size = 220, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const qrcode = await import('qrcode');
        if (cancelled || !canvasRef.current) return;
        await qrcode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 1,
          color: { dark: '#0e0e14', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'QR render failed');
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-border bg-surface text-xs text-danger p-4"
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label={label ?? 'QR code'}
      className="rounded-xl bg-white p-2"
    />
  );
}
