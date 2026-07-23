import { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { SlideData, PresenterViewMessage, PresenterControlState } from '../data'

const EVENT_NAME = 'presenter-view'
const PRESENTER_WINDOW_LABEL = 'presenterView'

export interface UsePresenterViewOptions {
  slides: SlideData[]
  /** 現在のパッケージ同梱アドオンの owner（組み込みのみの場合は空文字） */
  addonOwner?: string
  /** 現在のパッケージ同梱アドオンの asset URL 群（発表者ビューへ伝搬してロードさせる） */
  addonScripts?: string[]
  onNavigate?: (direction: 'prev' | 'next') => void
  onAudioToggle?: () => void
  onAutoPlayToggle?: () => void
  onAutoSlideshowToggle?: () => void
  onScrollSpeedChange?: (speed: number) => void
}

export interface UsePresenterViewReturn {
  openPresenterView: () => void
  isOpen: boolean
  sendSlideState: (currentIndex: number) => void
  sendControlState: (state: PresenterControlState) => void
  sendProgressState: (progress: number, visible: boolean, animationDuration?: number) => void
}

export function usePresenterView({ slides, addonOwner = '', addonScripts = [], onNavigate, onAudioToggle, onAutoPlayToggle, onAutoSlideshowToggle, onScrollSpeedChange }: UsePresenterViewOptions): UsePresenterViewReturn {
  const [isOpen, setIsOpen] = useState(false)

  // コールバックを useRef で保持（stale closure 回避）
  const onNavigateRef = useRef(onNavigate)
  const onAudioToggleRef = useRef(onAudioToggle)
  const onAutoPlayToggleRef = useRef(onAutoPlayToggle)
  const onAutoSlideshowToggleRef = useRef(onAutoSlideshowToggle)
  const onScrollSpeedChangeRef = useRef(onScrollSpeedChange)
  const latestControlStateRef = useRef<PresenterControlState | null>(null)

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])
  useEffect(() => {
    onAudioToggleRef.current = onAudioToggle
  }, [onAudioToggle])
  useEffect(() => {
    onAutoPlayToggleRef.current = onAutoPlayToggle
  }, [onAutoPlayToggle])
  useEffect(() => {
    onAutoSlideshowToggleRef.current = onAutoSlideshowToggle
  }, [onAutoSlideshowToggle])
  useEffect(() => {
    onScrollSpeedChangeRef.current = onScrollSpeedChange
  }, [onScrollSpeedChange])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined

    listen<PresenterViewMessage>(EVENT_NAME, (event) => {
      const msg = event.payload
      if (msg.type === 'presenterViewReady') {
        setIsOpen(true)
        // アドオンを slides より先に伝搬し、発表者ビューが描画前にロード・登録できるようにする
        const addonMessage: PresenterViewMessage = { type: 'addonsChanged', payload: { owner: addonOwner, scripts: addonScripts } }
        void emit(EVENT_NAME, addonMessage)
        const message: PresenterViewMessage = { type: 'slideChanged', payload: { currentIndex: 0, slides } }
        void emit(EVENT_NAME, message)
        // 初期制御状態を送信
        if (latestControlStateRef.current) {
          const controlMessage: PresenterViewMessage = { type: 'controlStateChanged', payload: latestControlStateRef.current }
          void emit(EVENT_NAME, controlMessage)
        }
      } else if (msg.type === 'presenterViewClosed') {
        setIsOpen(false)
      } else if (msg.type === 'navigate') {
        onNavigateRef.current?.(msg.payload.direction)
      } else if (msg.type === 'audioToggle') {
        onAudioToggleRef.current?.()
      } else if (msg.type === 'autoPlayToggle') {
        onAutoPlayToggleRef.current?.()
      } else if (msg.type === 'autoSlideshowToggle') {
        onAutoSlideshowToggleRef.current?.()
      } else if (msg.type === 'scrollSpeedChange') {
        onScrollSpeedChangeRef.current?.(msg.payload.speed)
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  // パッケージ切替（この hook の再マウント）時に、既に開いている発表者ビューへ最新アドオンを伝搬する。
  // 発表者ビューが未オープンならこの emit は無視され、後続の presenterViewReady 受信時に改めて伝搬される。
  useEffect(() => {
    const message: PresenterViewMessage = { type: 'addonsChanged', payload: { owner: addonOwner, scripts: addonScripts } }
    void emit(EVENT_NAME, message)
    // マウント時に一度だけ実行する（addonOwner/addonScripts はマウント単位で固定）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendSlideState = useCallback(
    (currentIndex: number) => {
      if (isOpen) {
        const message: PresenterViewMessage = { type: 'slideChanged', payload: { currentIndex, slides } }
        void emit(EVENT_NAME, message)
      }
    },
    [isOpen, slides],
  )

  const sendControlState = useCallback(
    (state: PresenterControlState) => {
      latestControlStateRef.current = state
      if (isOpen) {
        const message: PresenterViewMessage = { type: 'controlStateChanged', payload: state }
        void emit(EVENT_NAME, message)
      }
    },
    [isOpen],
  )

  const sendProgressState = useCallback(
    (progress: number, visible: boolean, animationDuration?: number) => {
      if (isOpen) {
        const message: PresenterViewMessage = { type: 'progressChanged', payload: { progress, visible, animationDuration } }
        void emit(EVENT_NAME, message)
      }
    },
    [isOpen],
  )

  const openPresenterView = useCallback(() => {
    // isOpen（React state）はイベント経由の非同期状態なので、実際のウィンドウ有無は都度 Tauri に問い合わせる
    WebviewWindow.getByLabel(PRESENTER_WINDOW_LABEL).then((existing) => {
      if (existing) {
        void existing.setFocus()
        return
      }

      const win = new WebviewWindow(PRESENTER_WINDOW_LABEL, {
        url: 'presenter-view.html',
        title: '発表者ビュー',
        width: 1000,
        height: 700,
      })
      win.once('tauri://error', (e) => {
        console.warn('[presenter-view] ウィンドウの作成に失敗しました', e)
      })
    })
  }, [])

  return { openPresenterView, isOpen, sendSlideState, sendControlState, sendProgressState }
}
