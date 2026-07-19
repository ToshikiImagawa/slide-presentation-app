import { createRoot } from 'react-dom/client'
import { useCallback, useState } from 'react'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { App } from './App'
import { HomeScreen } from './components/HomeScreen'
import { applyTheme, applyThemeData, resetThemeOverrides } from './applyTheme'
import { getDefaultPresentationData } from './data'
import type { PresentationData } from './data'
import { I18nProvider, loadLocales, useI18n } from './i18n'
import type { LocaleResource } from './i18n'
import { getRecentSlidePackages, openRecentSlidePackage, pickAndLoadSlidePackage } from './localSlideLoader'
import type { RecentSlidePackageEntry } from './localSlideLoader'

type AddonManifest = {
  addons: Array<{ name: string; bundle: string }>
}

/** script タグを挿入しアドオンバンドルをロードする */
function loadAddonScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load addon: ${src}`))
    document.head.appendChild(script)
  })
}

/** manifest.json からアドオン一覧を読み込み、全バンドルをロードする */
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

/** バンドル済みの slides.json を読み込む。存在しない場合はビルトインのテンプレートガイドを返す（ホーム画面の「サンプルスライド」用） */
async function loadSamplePresentationData(locale: string): Promise<PresentationData> {
  try {
    const res = await fetch(import.meta.env.VITE_SLIDES_PATH || '/slides.json')
    if (res.ok) {
      return (await res.json()) as PresentationData
    } else {
      console.error(`Failed to load sample presentation data: ${res.status}`)
      return getDefaultPresentationData(locale)
    }
  } catch {
    return getDefaultPresentationData(locale)
  }
}

async function applyPresentationTheme(data: PresentationData | undefined): Promise<void> {
  // 前のプレゼンテーションのテーマ上書きが残らないよう、まずリセットしてから適用する
  resetThemeOverrides()
  await applyTheme(data?.meta?.themeColors)
  if (data?.theme) {
    applyThemeData(data.theme)
  }
}

type View = 'home' | 'presentation'

/** ホーム画面とプレゼンテーション画面を切り替える（I18nProvider の内側で useI18n を使うための内側コンポーネント） */
function RootContent({ initialRecentPackages }: { initialRecentPackages: RecentSlidePackageEntry[] }) {
  const { locale } = useI18n()
  const [view, setView] = useState<View>('home')
  const [presentationData, setPresentationData] = useState<PresentationData | undefined>(undefined)
  const [presentationKey, setPresentationKey] = useState(0)
  const [recentPackages, setRecentPackages] = useState(initialRecentPackages)

  const showPresentation = useCallback(async (data: PresentationData) => {
    // Reveal.js は hash:true で初期化時に URL ハッシュ（#/3 等）の位置へジャンプするため、
    // 前のプレゼンテーションの表示位置が残らないよう、開く前にハッシュをクリアして必ず先頭から表示する
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    // スライド内容の更新を最優先で反映する（テーマ適用の失敗で更新がブロックされないようにする）
    setPresentationData(data)
    setPresentationKey((key) => key + 1)
    setView('presentation')

    try {
      await applyPresentationTheme(data)
    } catch (error) {
      console.error('[main] テーマの適用に失敗しました', error)
    }
  }, [])

  const handleBrowse = useCallback(async () => {
    const result = await pickAndLoadSlidePackage()
    setRecentPackages(await getRecentSlidePackages())
    if (!result) return
    await showPresentation(result.data)
  }, [showPresentation])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      const result = await openRecentSlidePackage(path)
      setRecentPackages(await getRecentSlidePackages())
      if (!result) return
      await showPresentation(result.data)
    },
    [showPresentation],
  )

  const handleOpenSample = useCallback(async () => {
    const data = await loadSamplePresentationData(locale)
    await showPresentation(data)
  }, [locale, showPresentation])

  const handleGoHome = useCallback(() => {
    // プレゼンテーション固有のテーマを持ち越さず、ホーム画面はアプリのデフォルトテーマで表示する
    resetThemeOverrides()
    void applyTheme()
    setView('home')
  }, [])

  if (view === 'home') {
    return <HomeScreen recentPackages={recentPackages} onOpenRecent={handleOpenRecent} onOpenSample={handleOpenSample} onBrowse={handleBrowse} />
  }

  return <App key={presentationKey} presentationData={presentationData} onGoHome={handleGoHome} />
}

interface RootProps {
  locales: LocaleResource[]
  initialRecentPackages: RecentSlidePackageEntry[]
}

function Root({ locales, initialRecentPackages }: RootProps) {
  return (
    <I18nProvider locales={locales}>
      <RootContent initialRecentPackages={initialRecentPackages} />
    </I18nProvider>
  )
}

const root = createRoot(document.getElementById('root')!)

// アドオン・言語リソース・最近開いたスライド一覧をロードしてから、常にホーム画面を表示する
Promise.all([loadAddons(), loadLocales()]).then(async ([, locales]) => {
  const initialRecentPackages = await getRecentSlidePackages()
  await applyTheme()
  root.render(<Root locales={locales} initialRecentPackages={initialRecentPackages} />)
})
