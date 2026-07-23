/**
 * スクリーンショット撮影モード（`vite --mode screenshot`）専用の
 * `@tauri-apps/plugin-store` モック。
 *
 * 本番の LazyStore / Store と同一シグネチャのインメモリ実装で、永続化はしない。
 * 起動時の getRecentSlidePackages() や設定の isEmbeddedAddonsDisabled() が、
 * Tauri 非搭載のブラウザでも失敗せず「空・未設定」を返して boot を通すためのもの。
 * Vite alias 経由で screenshot モード時のみ差し替わり、本番ビルドには混入しない。
 */
class MemoryStore {
  private readonly data = new Map<string, unknown>()

  constructor(_path?: string) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async clear(): Promise<void> {
    this.data.clear()
  }

  async save(): Promise<void> {}

  async close(): Promise<void> {}
}

/** 本番の LazyStore 互換（遅延ロードもすべてインメモリで即応） */
export class LazyStore extends MemoryStore {}

/** 本番の Store 互換 */
export class Store extends MemoryStore {}
