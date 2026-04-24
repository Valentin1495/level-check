type DOMExceptionLike = new (message?: string, name?: string) => Error & { code: number };

const globalWithDOMException = globalThis as { DOMException?: DOMExceptionLike };

if (typeof globalWithDOMException.DOMException === 'undefined') {
  class ReactNativeDOMException extends Error {
    code = 0;

    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  }

  globalWithDOMException.DOMException = ReactNativeDOMException;
}
