/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API when it is served from another origin. Empty = same origin (/api). */
  readonly VITE_API_BASE?: string;
  /** Optional repository URL. The GitHub link is only rendered when this is set. */
  readonly VITE_GITHUB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
