import { createRoot } from 'react-dom/client'
import { useCallback, useRef, useState } from 'react'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { App } from './App'
import { HomeScreen } from './components/HomeScreen'
import { applyTheme, applyThemeData, resetThemeOverrides } from './applyTheme'
import { loadAddonScripts, loadBuiltinAddons } from './addonLoader'
import { unregisterOwner } from './components/ComponentRegistry'
import { getDefaultPresentationData } from './data'
import type { PresentationData } from './data'
import { I18nProvider, loadLocales, useI18n } from './i18n'
import type { LocaleResource } from './i18n'
import { getRecentSlidePackages, isAddonAllowed, openRecentSlidePackage, pickAndLoadSlidePackage } from './localSlideLoader'
import type { LoadedSlidePackage, RecentSlidePackageEntry } from './localSlideLoader'
import { SlideEditor } from './edit/SlideEditor'
import type { EditSource } from './edit/SlideEditor'
import { serializeSlides } from './edit/slidesSerialize'
import { enterEditMode, exitEditMode } from './editModeSave'

/** バンドル済みの slides.json を読み込む。存在しない場合はビルトインのテンプレートガイドを返す（ホーム画面の「サンプルスライド」用） */
async function loadSamplePresentationData(locale: string): Promise<PresentationData> {
  try {
    const res = await fetch(import.meta.env.VITE_SLIDES_PATH || '/slides.json')
    if (res.ok) {
      return (await res.json()) as PresentationData
    }
    console.error(`Failed to load sample presentation data: ${res.status}`)
  } catch {
    // fetch 失敗時はビルトインのテンプレートガイドにフォールバックする
  }
  return getDefaultPresentationData(locale)
}

async function applyPresentationTheme(data: PresentationData | undefined): Promise<void> {
  // 前のプレゼンテーションのテーマ上書きが残らないよう、まずリセットしてから適用する
  resetThemeOverrides()
  await applyTheme(data?.meta?.themeColors)
  if (data?.theme) {
    applyThemeData(data.theme)
  }
}

type View = 'home' | 'presentation' | 'edit'

/** ホーム画面とプレゼンテーション画面を切り替える（I18nProvider の内側で useI18n を使うための内側コンポーネント） */
function RootContent({ initialRecentPackages }: { initialRecentPackages: RecentSlidePackageEntry[] }) {
  const { locale } = useI18n()
  const [view, setView] = useState<View>('home')
  const [presentationData, setPresentationData] = useState<PresentationData | undefined>(undefined)
  const [presentationKey, setPresentationKey] = useState(0)
  const [recentPackages, setRecentPackages] = useState(initialRecentPackages)
  // 発表者ビューへ伝搬する現在のアドオン情報（パッケージ単位。組み込みアドオンは含めない）
  const [addonInfo, setAddonInfo] = useState<{ owner: string; scripts: string[] }>({ owner: '', scripts: [] })
  // 現在ロード済みのパッケージアドオンの owner（切替時のアンロード対象）
  const currentOwnerRef = useRef<string | undefined>(undefined)
  // 編集モードの供給元（現在表示中プレゼンの生 JSON / baseDir / 読込元パス）。編集は相対パスの生 JSON を対象にする
  const [editSource, setEditSource] = useState<EditSource | null>(null)

  const showPresentation = useCallback(async (data: PresentationData) => {
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

  /** 現在のパッケージアドオンを破棄し、許可された場合のみ新パッケージのアドオンをロードする（再マウント前に完了させる） */
  const applyPackageAddons = useCallback(async (pkg: LoadedSlidePackage) => {
    // (1) 旧 owner のアドオンを破棄
    if (currentOwnerRef.current) unregisterOwner(currentOwnerRef.current)
    currentOwnerRef.current = undefined

    // (2) アドオンがあり、かつ利用者が許可した場合のみロード（既定拒否）
    // 信頼判定やロードに失敗してもスライド自体は開けるよう、失敗時はアドオンなしで続行する（A-005 フォールバックファースト）
    try {
      if (pkg.addonScripts.length > 0 && (await isAddonAllowed(pkg.sourcePath))) {
        await loadAddonScripts(pkg.addonScripts, pkg.owner)
        currentOwnerRef.current = pkg.owner
        setAddonInfo({ owner: pkg.owner, scripts: pkg.addonScripts })
        return
      }
    } catch (error) {
      console.error('[main] 同梱アドオンのロードに失敗しました（アドオンなしで続行）', error)
    }
    setAddonInfo({ owner: '', scripts: [] })
  }, [])

  /** パッケージアドオンをすべて破棄しホーム/サンプル向けの状態に戻す */
  const clearPackageAddons = useCallback(() => {
    if (currentOwnerRef.current) unregisterOwner(currentOwnerRef.current)
    currentOwnerRef.current = undefined
    setAddonInfo({ owner: '', scripts: [] })
  }, [])

  const handleBrowse = useCallback(async () => {
    const { data, recentPackages } = await pickAndLoadSlidePackage()
    if (recentPackages) setRecentPackages(recentPackages)
    if (!data) return
    await applyPackageAddons(data)
    // 編集は書換前の生 JSON（相対パス）を対象にする
    setEditSource({ rawText: data.rawText, baseDir: data.baseDir, sourcePath: data.sourcePath })
    await showPresentation(data.data)
  }, [applyPackageAddons, showPresentation])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      const { data, recentPackages } = await openRecentSlidePackage(path)
      if (recentPackages) setRecentPackages(recentPackages)
      if (!data) return
      await applyPackageAddons(data)
      setEditSource({ rawText: data.rawText, baseDir: data.baseDir, sourcePath: data.sourcePath })
      await showPresentation(data.data)
    },
    [applyPackageAddons, showPresentation],
  )

  const handleOpenSample = useCallback(async () => {
    // サンプルは組み込みアドオンのみを使うため、パッケージ由来のアドオンは破棄する
    clearPackageAddons()
    const data = await loadSamplePresentationData(locale)
    // サンプル/デフォルトは相対パスのまま。baseDir は無い（アセットは app 配下で解決される）
    setEditSource({ rawText: serializeSlides(data), baseDir: '', sourcePath: undefined })
    await showPresentation(data)
  }, [clearPackageAddons, locale, showPresentation])

  const handleGoHome = useCallback(() => {
    // ホーム復帰時はパッケージ由来のカスタム登録をクリアする
    clearPackageAddons()
    setEditSource(null)
    // プレゼンテーション固有のテーマを持ち越さず、ホーム画面はアプリのデフォルトテーマで表示する
    resetThemeOverrides()
    void applyTheme()
    setView('home')
  }, [clearPackageAddons])

  const handleStartEdit = useCallback(() => {
    // 編集モードを Rust 側で有効化してから編集画面へ（失敗しても遷移はブロックしない・A-005）
    void enterEditMode().catch((error) => console.error('[main] 編集モードの有効化に失敗しました', error))
    setView('edit')
  }, [])

  const handleExitEdit = useCallback(() => {
    void exitEditMode().catch((error) => console.error('[main] 編集モードの無効化に失敗しました', error))
    // 編集中に適用したテーマを、表示中プレゼンのテーマへ戻す
    void applyPresentationTheme(presentationData)
    setView('presentation')
  }, [presentationData])

  if (view === 'edit' && editSource) {
    return <SlideEditor source={editSource} onExit={handleExitEdit} />
  }

  if (view === 'home') {
    return <HomeScreen recentPackages={recentPackages} onOpenRecent={handleOpenRecent} onOpenSample={handleOpenSample} onBrowse={handleBrowse} />
  }

  return <App key={presentationKey} presentationData={presentationData} onGoHome={handleGoHome} onStartEdit={handleStartEdit} addonOwner={addonInfo.owner} addonScripts={addonInfo.scripts} />
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

// アドオン・言語リソース・最近開いたスライド一覧・テーマを並行してロードしてから、常にホーム画面を表示する
Promise.all([loadBuiltinAddons(), loadLocales(), getRecentSlidePackages(), applyTheme()]).then(([, locales, initialRecentPackages]) => {
  root.render(<Root locales={locales} initialRecentPackages={initialRecentPackages} />)
})
