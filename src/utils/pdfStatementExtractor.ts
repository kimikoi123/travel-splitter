// PDF statement → CSV-shaped text.
//
// Bank statements aren't structured like CSVs in the PDF — they're positioned
// text items laid out as a visual table. We extract those items, group them
// by Y-coordinate into rows (see pdfRowAssembly), then collapse each row into
// a comma-separated line that the existing CSV parser can consume.
//
// Password-protected PDFs throw PdfPasswordRequiredError so the UI can prompt.

import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
// `?url` is a Vite import-suffix that returns the bundled URL of the
// worker script — pdfjs runs its parser in a Worker.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { rowsFromTextItems, type MinimalTextItem } from './pdfRowAssembly';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfPasswordRequiredError extends Error {
  constructor(public reason: 'needed' | 'incorrect') {
    super(reason === 'needed' ? 'Password required' : 'Incorrect password');
    this.name = 'PdfPasswordRequiredError';
  }
}

export interface ExtractOptions {
  password?: string;
  rowTolerance?: number;
  columnGap?: number;
}

export async function extractStatementText(
  source: ArrayBuffer | Uint8Array,
  opts: ExtractOptions = {},
): Promise<string> {
  // pdfjs takes ownership of the buffer it's given; copy so callers can
  // re-use the same input (e.g. on a password retry).
  const data = source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));

  // We only need text extraction — no rendering — so we turn off the pdfjs
  // features that rely on browser APIs which fail on iOS Safari (especially
  // when running as a PWA):
  //   - isEvalSupported: pdfjs JIT-compiles PDF function subroutines via
  //     `new Function(...)`. iOS Safari blocks/sandboxes Function eval in
  //     PWAs, surfacing as "undefined is not a function (near '...')".
  //   - disableFontFace + useSystemFonts: skips Font Loading API.
  //   - isOffscreenCanvasSupported: avoids the worker-side OffscreenCanvas
  //     path, which has had reliability issues on Safari.
  const loadingTaskParams: {
    data: Uint8Array;
    password?: string;
    isEvalSupported: boolean;
    disableFontFace: boolean;
    useSystemFonts: boolean;
    isOffscreenCanvasSupported: boolean;
  } = {
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
  };
  if (opts.password) loadingTaskParams.password = opts.password;

  const loadingTask = pdfjsLib.getDocument(loadingTaskParams);

  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (err: unknown) {
    // pdfjs throws PasswordException with .code 1 (NEED) or 2 (INCORRECT)
    const e = err as { name?: string; code?: number; message?: string };
    if (e?.name === 'PasswordException' || (e?.message ?? '').toLowerCase().includes('password')) {
      throw new PdfPasswordRequiredError(e.code === 2 ? 'incorrect' : 'needed');
    }
    throw err;
  }

  const allRows: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is TextItem => 'str' in it && 'transform' in it)
      .map<MinimalTextItem>((it) => ({
        str: it.str,
        transform: it.transform,
        width: it.width,
        hasEOL: it.hasEOL,
      }));
    const rows = rowsFromTextItems(items, opts.rowTolerance, opts.columnGap);
    for (const r of rows) {
      if (r.trim().length > 0) allRows.push(r);
    }
    page.cleanup();
  }

  await pdf.cleanup();
  await pdf.destroy();

  return allRows.join('\n');
}
