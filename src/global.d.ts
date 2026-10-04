/// <reference types="vite/client" />

import type { GeniexApi } from '../electron/preload';

declare module '*.png' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    geniex: GeniexApi;
  }
}

export {};
