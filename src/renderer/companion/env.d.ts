import type { ClippetBridge } from '@shared/protocol';
declare global {
  interface Window { clippet: ClippetBridge }
}
export {};
