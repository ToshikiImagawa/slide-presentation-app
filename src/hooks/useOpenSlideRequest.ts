import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'

const EVENT_NAME = 'open-slide-package'

/**
 * Rust 側に溜まっているオープン要求を取り出す（take セマンティクス: 取得と同時にクリアされる）。
 * macOS の複数選択一括オープンで複数件になり得るが、単一ウィンドウアプリなので最後の1件を採用する。
 *
 * 非 Tauri 環境（`vite --mode screenshot` の素のブラウザ）ではコマンドが存在せず reject するため握りつぶす。
 * この hook は起動時に必ず invoke するので、握りつぶさないと E2E・スクリーンショット撮影が壊れる。
 */
async function takePendingOpenPath(): Promise<string | undefined> {
  try {
    const paths = await invoke<string[]>('take_pending_open_paths')
    return paths[paths.length - 1]
  } catch (error) {
    console.warn('[useOpenSlideRequest] オープン要求の取得をスキップしました', error)
    return undefined
  }
}

/**
 * OS のファイル関連付け（Finder の「このアプリケーションで開く」等）から届いた .spkg のオープン要求を受け取る。
 *
 * Rust 側のイベントは payload なしのシグナルで、実データは常に `take_pending_open_paths` から取り出す。
 * WebView が listen を張る前に OS の要求が届き得るため、取り出し口を take に一本化して
 * 「起動時 pull」と「イベント受信」で同じパスを二重に開くことを防ぐ。
 */
export function useOpenSlideRequest(onRequest: (path: string) => void): void {
  // コールバックを useRef で保持（stale closure 回避。listen はマウント時に1回だけ張る）
  const onRequestRef = useRef(onRequest)
  useEffect(() => {
    onRequestRef.current = onRequest
  }, [onRequest])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    const deliverPending = async () => {
      // アンマウント後は取り出さない（take で消えた要求を、破棄済みのツリーへ渡して失わないため）
      if (cancelled) return
      const path = await takePendingOpenPath()
      if (path !== undefined) onRequestRef.current(path)
    }

    void (async () => {
      try {
        // listen を先に張り、その後に起動時の要求を pull する（両者の隙間で要求を落とさないため）
        const fn = await listen(EVENT_NAME, () => void deliverPending())
        // listen の解決前にアンマウントされた場合は即解除する（購読が残るのを防ぐ）
        if (cancelled) fn()
        else unlisten = fn
      } catch (error) {
        // listen 自身も内部で invoke するため非 Tauri 環境では reject する。起動をブロックしないよう握りつぶす
        console.warn('[useOpenSlideRequest] オープン要求の購読をスキップしました', error)
      }
      await deliverPending()
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
