/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API server origin when the client is hosted separately, e.g. https://api.yourdomain.com */
  readonly VITE_API_ORIGIN?: string;
}
