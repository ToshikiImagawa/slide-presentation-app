/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SLIDES_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
