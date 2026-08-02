import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import { emit, listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { applyPresentationTheme, applyTheme } from './applyTheme'
import { loadAddonScripts, loadBuiltinAddons } from './addonLoader'
import { registerDefaultComponents } from './components/registerDefaults'
import { unregisterOwner } from './components/ComponentRegistry'
import { PresenterViewWindow } from './components/PresenterViewWindow'
import { I18nProvider, loadLocales, useTranslation } from './i18n'
import { theme } from './theme'
import type { SlideData, PresenterViewMessage, PresenterControlState, PresenterProgressState, LogoConfig, ThemeData } from './data'

const EVENT_NAME = 'presenter-view'

// デフォルトコンポーネントを登録
registerDefaultComponents()

function PresenterViewApp() {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [controlState, setControlState] = useState<PresenterControlState | null>(null)
  const [progressState, setProgressState] = useState<PresenterProgressState>({ progress: 0, visible: false })
  const [logo, setLogo] = useState<LogoConfig | undefined>(undefined)
  const [slideTheme, setSlideTheme] = useState<ThemeData | undefined>(undefined)

  // 現在登録済みのパッケージアドオンの owner（切替時のアンロード対象）
  const currentOwnerRef = useRef<string | undefined>(undefined)
  // 直近のアドオンロード完了を待つための Promise。slides 描画はこれの完了後に行う
  const addonLoadRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let unlistenClose: UnlistenFn | undefined

    listen<PresenterViewMessage>(EVENT_NAME, async (event) => {
      if (event.payload.type === 'themeChanged') {
        const { themeColors, theme: themeData, logo } = event.payload.payload
        // 本編とテーマの上書きが食い違わないよう、本編と同じ手順（reset→適用）で再適用する
        await applyPresentationTheme(themeColors, themeData)
        setLogo(logo)
        setSlideTheme(themeData)
      } else if (event.payload.type === 'addonsChanged') {
        const { owner, scripts } = event.payload.payload
        // 旧 owner を破棄してから新アドオンをロードする（slideChanged 側がこの完了を待つ）
        // ロード失敗時も slides 描画をブロックしないよう握りつぶす（未解決コンポーネントは fallback 表示）
        addonLoadRef.current = (async () => {
          try {
            if (currentOwnerRef.current) unregisterOwner(currentOwnerRef.current)
            currentOwnerRef.current = scripts.length > 0 ? owner : undefined
            if (scripts.length > 0) await loadAddonScripts(scripts, owner)
          } catch (error) {
            console.error('[presenter-view] アドオンのロードに失敗しました（アドオンなしで続行）', error)
          }
        })()
      } else if (event.payload.type === 'slideChanged') {
        const { slides, currentIndex } = event.payload.payload
        // アドオンのロード完了を待ってから描画し、未解決コンポーネントの fallback 表示を避ける
        await addonLoadRef.current
        setSlides(slides)
        setCurrentIndex(currentIndex)
      } else if (event.payload.type === 'controlStateChanged') {
        setControlState(event.payload.payload)
      } else if (event.payload.type === 'progressChanged') {
        setProgressState(event.payload.payload)
      }
    }).then((fn) => {
      unlisten = fn
    })

    // メインウィンドウに準備完了を通知
    const readyMessage: PresenterViewMessage = { type: 'presenterViewReady' }
    void emit(EVENT_NAME, readyMessage)

    // WKWebView では beforeunload が赤信号ボタン等の操作で発火しないため、Tauri のネイティブなクローズリクエストイベントで通知する
    getCurrentWindow()
      .onCloseRequested(async () => {
        const closedMessage: PresenterViewMessage = { type: 'presenterViewClosed' }
        await emit(EVENT_NAME, closedMessage)
      })
      .then((fn) => {
        unlistenClose = fn
      })

    return () => {
      unlistenClose?.()
      unlisten?.()
    }
  }, [])

  const sendMessage = useCallback((message: PresenterViewMessage) => {
    void emit(EVENT_NAME, message)
  }, [])

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      sendMessage({ type: 'navigate', payload: { direction } })
    },
    [sendMessage],
  )

  const handleAudioToggle = useCallback(() => {
    sendMessage({ type: 'audioToggle' })
  }, [sendMessage])

  const handleAutoPlayToggle = useCallback(() => {
    sendMessage({ type: 'autoPlayToggle' })
  }, [sendMessage])

  const handleAutoSlideshowToggle = useCallback(() => {
    sendMessage({ type: 'autoSlideshowToggle' })
  }, [sendMessage])

  const handleScrollSpeedChange = useCallback(
    (speed: number) => {
      sendMessage({ type: 'scrollSpeedChange', payload: { speed } })
    },
    [sendMessage],
  )

  if (slides.length === 0) {
    return <WaitingMessage />
  }

  return (
    <ThemeProvider theme={theme}>
      <PresenterViewWindow
        slides={slides}
        currentIndex={currentIndex}
        logo={logo}
        theme={slideTheme}
        controlState={controlState}
        progressState={progressState}
        onNavigate={handleNavigate}
        onAudioToggle={handleAudioToggle}
        onAutoPlayToggle={handleAutoPlayToggle}
        onAutoSlideshowToggle={handleAutoSlideshowToggle}
        onScrollSpeedChange={handleScrollSpeedChange}
      />
    </ThemeProvider>
  )
}

function WaitingMessage() {
  const { t } = useTranslation()
  return <div style={{ color: 'var(--theme-text-body)', padding: '40px', fontFamily: 'var(--theme-font-body)' }}>{t('presenterView.waitingForConnection')}</div>
}

const root = createRoot(document.getElementById('root')!)

// 組み込みアドオン・言語リソース・既定テーマをロードしてからレンダリングする（実際のテーマは themeChanged で本編から伝搬される）
Promise.all([loadBuiltinAddons(), loadLocales(), applyTheme()]).then(([, locales]) => {
  root.render(
    <I18nProvider locales={locales}>
      <PresenterViewApp />
    </I18nProvider>,
  )
})
