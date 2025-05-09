// Polyfill for global which is used by some dependencies
if (typeof window !== 'undefined' && !window.global) {
  (window as any).global = window;
}

// Polyfill for Buffer which might be needed by crypto-related dependencies
import { Buffer } from 'buffer';
if (typeof window !== 'undefined' && !window.Buffer) {
  (window as any).Buffer = Buffer;
}

// Polyfill for process.env which might be used by some dependencies
if (typeof window !== 'undefined' && !window.process) {
  (window as any).process = { env: {} };
}
