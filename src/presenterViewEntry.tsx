import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { applyTheme, applyThemeData } from './applyTheme'
import { registerDefaultComponents } from './components/registerDefaults'
import { PresenterViewWindow } from './components/PresenterViewWindow'
import { I18nProvider, loadLocales, useTranslation } from './i18n'
import { theme } from './theme'
import type { SlideData, PresentationData, PresenterViewMessage, PresenterControlState } from './data'

const CHANNEL_NAME = 'presenter-view'

// デフォルトコンポーネントを登録
registerDefaultComponents()

type AddonManifest = {
  addons: Array<{ name: string; bundle: string }>
}

function loadAddonScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load addon: ${src}`))
    document.head.appendChild(script)
  })
}

async function loadAddons(): Promise<void> {
  try {
    const res = await fetch('/addons/manifest.json')
    if (!res.ok) return
    const manifest: AddonManifest = await res.json()
    await Promise.all(manifest.addons.map((addon) => loadAddonScript(addon.bundle)))
  } catch {
    // manifest が存在しない、またはロード失敗時はフォールバック（アドオンなし）
  }
}

function PresenterViewApp() {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [controlState, setControlState] = useState<PresenterControlState | null>(null)
  const [progressState, setProgressState] = useState<{ progress: number; visible: boolean; animationDuration?: number }>({ progress: 0, visible: false })
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<PresenterViewMessage>) => {
      if (event.data.type === 'slideChanged') {
        setSlides(event.data.payload.slides)
        setCurrentIndex(event.data.payload.currentIndex)
      } else if (event.data.type === 'controlStateChanged') {
        setControlState(event.data.payload)
      } else if (event.data.type === 'progressChanged') {
        setProgressState(event.data.payload)
      }
    }

    // メインウィンドウに準備完了を通知
    const readyMessage: PresenterViewMessage = { type: 'presenterViewReady' }
    channel.postMessage(readyMessage)

    // ウィンドウが閉じられるときにメインウィンドウに通知
    const handleBeforeUnload = () => {
      const closedMessage: PresenterViewMessage = { type: 'presenterViewClosed' }
      channel.postMessage(closedMessage)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      channel.close()
      channelRef.current = null
    }
  }, [])

  // テーマの適用
  useEffect(() => {
    fetch(import.meta.env.VITE_SLIDES_PATH || '/slides.json')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json() as Promise<PresentationData>
      })
      .then(async (data) => {
        await applyTheme(data.meta?.themeColors)
        if (data.theme) {
          applyThemeData(data.theme)
        }
      })
      .catch(async () => {
        await applyTheme()
      })
  }, [])

  const sendMessage = useCallback((message: PresenterViewMessage) => {
    channelRef.current?.postMessage(message)
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

// アドオン・言語リソースをロードしてからレンダリングする
Promise.all([loadAddons(), loadLocales()]).then(([, locales]) => {
  root.render(
    <I18nProvider locales={locales}>
      <PresenterViewApp />
    </I18nProvider>,
  )
})
