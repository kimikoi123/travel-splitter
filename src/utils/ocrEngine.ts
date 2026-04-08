export type OcrProgressStatus = 'loading' | 'recognizing';

export interface OcrProgress {
  status: OcrProgressStatus;
  progress: number; // 0-1
}

let workerInstance: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;

async function getWorker(
  onProgress?: (p: OcrProgress) => void,
): ReturnType<typeof import('tesseract.js')['createWorker']> {
  if (workerInstance) return workerInstance;

  const Tesseract = await import('tesseract.js');

  workerInstance = await Tesseract.createWorker('eng', undefined, {
    logger: (msg) => {
      if (!onProgress) return;
      const status: OcrProgressStatus =
        msg.status === 'recognizing text' ? 'recognizing' : 'loading';
      onProgress({ status, progress: msg.progress });
    },
  });

  return workerInstance;
}

export async function recognizeReceiptText(
  image: File | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const worker = await getWorker(onProgress);
  const result = await worker.recognize(image);
  return result.data.text;
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
  }
}
