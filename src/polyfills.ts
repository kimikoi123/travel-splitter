// Polyfills loaded before any other module so global APIs are present when
// imported libraries (notably pdfjs-dist) reach for them.
//
// `Promise.withResolvers()` was only added to iOS Safari in 17.4 (March
// 2024). pdfjs-dist 5.x calls it everywhere — without this polyfill, the
// PDF importer crashes on any iPhone running iOS 16.x or 17.0–17.3 with
// "undefined is not a function".

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }
}

if (typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !== 'function') {
  (Promise as unknown as { withResolvers: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } }).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export {};
