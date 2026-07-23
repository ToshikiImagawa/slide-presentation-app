/**
 * スクリーンショット撮影モード（`vite --mode screenshot`）専用の
 * `@tauri-apps/api/webviewWindow` モック。
 *
 * 発表者ビューは撮影時に presenter-view.html を直接開くため、ここでは no-op でよい。
 * Vite alias 経由で screenshot モード時のみ差し替わり、本番ビルドには混入しない。
 */
type UnlistenFn = () => void

export class WebviewWindow {
  readonly label: string

  constructor(label: string, _options?: Record<string, unknown>) {
    this.label = label
  }

  static async getByLabel(_label: string): Promise<WebviewWindow | null> {
    return null
  }

  async setFocus(): Promise<void> {}

  async once(_event: string, _handler: (event: unknown) => void): Promise<UnlistenFn> {
    return () => {}
  }
}
