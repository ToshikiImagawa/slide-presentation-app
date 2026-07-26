/**
 * スクリーンショット撮影モード（`vite --mode screenshot`）専用の
 * `@tauri-apps/api/window` モック。
 *
 * presenterViewEntry.tsx が自身のクローズ検知に使う getCurrentWindow().onCloseRequested() は、
 * Tauri 非搭載のブラウザでは window.__TAURI_INTERNALS__ が無く実物が例外を投げるため、
 * ここでは no-op のリスナー登録として振る舞う（撮影シナリオでは実際にクローズしないため実害なし）。
 * Vite alias 経由で screenshot モード時のみ差し替わり、本番ビルドには混入しない。
 */
type UnlistenFn = () => void

class Window {
  async onCloseRequested(_handler: (event: unknown) => void | Promise<void>): Promise<UnlistenFn> {
    return () => {}
  }
}

export function getCurrentWindow(): Window {
  return new Window()
}
