import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import 'reveal.js/dist/reveal.css'
import './styles/global.css'
import './addon-bridge'
import { App } from './App'
import { HomeScreen } from './components/HomeScreen'
import { SettingsWindow } from './components/SettingsWindow'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { applyPresentationTheme, applyTheme, resetThemeOverrides } from './applyTheme'
import { loadAddonScripts, loadBuiltinAddons } from './addonLoader'
import { unregisterOwner } from './components/ComponentRegistry'
import { getBlankPresentationData, getSampleUnavailablePresentationData } from './data'
import type { PresentationData, ThemeData } from './data'
import { I18nProvider, loadLocales, useI18n } from './i18n'
import type { LocaleResource } from './i18n'
import { ToastProvider, useToast } from './toast'
import {
  clearAddonTrustDecision,
  getRecentSlidePackages,
  isAddonAllowed,
  loadSampleSlidePackageFromUrl,
  loadSlidePackageFromUrl,
  openRecentSlidePackage,
  openSlidePackageFromPath,
  pickAndLoadSlidePackage,
  removeRecentSlidePackage,
} from './localSlideLoader'
import type { LoadedSlidePackage, RecentSlidePackageEntry, SlidePackageLoadResult } from './localSlideLoader'
import { getSampleSources, loadBundledSampleSlides } from './sampleSlides'
import { isTypingTarget } from './keyboardTarget'
import { useAddonSettings } from './hooks/useAddonSettings'
import { useOpenSlideRequest } from './hooks/useOpenSlideRequest'
import { useScrollSpeed } from './hooks/useScrollSpeed'
import { theme } from './theme'
import { SlideEditor } from './edit/SlideEditor'
import type { EditSource } from './edit/SlideEditor'
import { serializeSlides } from './edit/slidesSerialize'
import { enterEditMode, exitEditMode } from './editModeSave'

type View = 'home' | 'presentation' | 'edit'

/** ホーム画面とプレゼンテーション画面を切り替える（I18nProvider の内側で useI18n を使うための内側コンポーネント） */
function RootContent({ initialRecentPackages }: { initialRecentPackages: RecentSlidePackageEntry[] }) {
  const { locale, t } = useI18n()
  const { showToast } = useToast()
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
  // OS のファイル関連付けから届いたオープン要求のうち、編集中のため確認待ちのパス（#105）
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null)
  // 設定・ショートカットのダイアログはホーム画面とプレゼンテーション画面の双方から開くため、
  // 両者の共通祖先であるここで開閉を管理し、実体は1インスタンスだけ描画する
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // スクロール速度はプレゼンテーション専用の設定だが、値の所有者は設定 UI と揃えてこの層に置く
  const [scrollSpeed, setScrollSpeed] = useScrollSpeed()
  const { addonsDisabled, addonTrustList, handleToggleAddonsDisabled, handleResetAddonTrust, handleSetAddonTrust } = useAddonSettings({ active: settingsOpen, recentPackages })

  const openSettings = () => setSettingsOpen(true)
  const closeSettings = () => setSettingsOpen(false)
  const openShortcuts = () => setShortcutsOpen(true)
  const closeShortcuts = () => setShortcutsOpen(false)

  // 画面が切り替わったらダイアログを閉じる（従来は App ごと再マウントされて閉じていた挙動を維持する）
  useEffect(() => {
    setSettingsOpen(false)
    setShortcutsOpen(false)
  }, [view])

  // ? キーでショートカット一覧を開く（入力中は無視）。ダイアログの所有者がこの層なので購読もここに置き、
  // ホーム・プレゼンテーション・編集のどの画面からでも同じキーで開けるようにする
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || isTypingTarget(e.target)) return
      setShortcutsOpen(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 表示中プレゼンデータを更新する（App を再マウントするための key 更新を含む）。
  // showPresentation・handleCreateWithAi の両方から使う共通処理
  const applyPresentationData = useCallback((data: PresentationData) => {
    setPresentationData(data)
    setPresentationKey((key) => key + 1)
  }, [])

  // テーマを適用し、失敗した場合はトースト通知する（showPresentation・handleExitEdit の両方から使う共通処理）
  const applyThemeAndNotify = useCallback(
    async (themeColors?: string, theme?: ThemeData) => {
      const themeApplied = await applyPresentationTheme(themeColors, theme)
      if (!themeApplied) {
        showToast(t('theme.applyFailed'))
      }
    },
    [showToast, t],
  )

  const showPresentation = useCallback(
    async (data: PresentationData) => {
      // スライド内容の更新を最優先で反映する（テーマ適用の失敗で更新がブロックされないようにする）
      applyPresentationData(data)
      setView('presentation')

      await applyThemeAndNotify(data.meta?.themeColors, data.theme)
    },
    [applyPresentationData, applyThemeAndNotify],
  )

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

  /** スライドパッケージの読み込み結果を受けて、最近使ったリストの更新・アドオン適用・プレゼン表示までを行う（各読み込み口の共通後処理）。プレゼンを表示できたかを返す */
  const applyLoadResult = useCallback(
    async ({ data, recentPackages }: SlidePackageLoadResult): Promise<boolean> => {
      if (recentPackages) setRecentPackages(recentPackages)
      if (!data) return false
      await applyPackageAddons(data)
      // 編集は書換前の生 JSON（相対パス）を対象にする
      setEditSource({ rawText: data.rawText, baseDir: data.baseDir, sourcePath: data.savePath, packageName: data.identity.name, packageVersion: data.identity.version })
      await showPresentation(data.data)
      return true
    },
    [applyPackageAddons, showPresentation],
  )

  const handleBrowse = useCallback(async () => {
    await applyLoadResult(await pickAndLoadSlidePackage())
  }, [applyLoadResult])

  const handleOpenRecent = useCallback(
    async (path: string) => {
      await applyLoadResult(await openRecentSlidePackage(path))
    },
    [applyLoadResult],
  )

  const handleOpenUrl = useCallback(
    async (url: string) => {
      await applyLoadResult(await loadSlidePackageFromUrl(url))
    },
    [applyLoadResult],
  )

  const handleRemoveRecent = useCallback(async (path: string) => {
    const [updated] = await Promise.all([removeRecentSlidePackage(path), clearAddonTrustDecision(path)])
    setRecentPackages(updated)
  }, [])

  /**
   * ホーム画面の「サンプルを開く」。サンプルはアプリに同梱せず配布パッケージから取得するため、3 段で解決する。
   * (1) ビルド時同梱の slides.json → (2) オンライン配布の .spkg → (3) 取得失敗の案内スライド
   */
  const handleOpenSample = useCallback(async () => {
    // サンプルは組み込みアドオンのみを使うため、パッケージ由来のアドオンは破棄する
    clearPackageAddons()

    // (1) VITE_SLIDE_PACKAGE による同梱・スクリーンショット fixture・dev の samples 配信
    const bundled = await loadBundledSampleSlides()
    if (bundled) {
      // 同梱データは相対パスのまま。baseDir は無い（アセットは app 配下で解決される）
      setEditSource({ rawText: serializeSlides(bundled), baseDir: '', sourcePath: undefined })
      await showPresentation(bundled)
      return
    }

    // (2) オンライン配布のサンプルパッケージ（同梱アセットは baseDir 基準で解決される）
    for (const source of await getSampleSources(locale)) {
      if (await applyLoadResult(await loadSampleSlidePackageFromUrl(source.url, source.download))) return
    }

    // (3) どこからも取得できない場合（オフライン等）は案内スライドを表示する
    showToast(t('home.sampleUnavailable'))
    const unavailable = getSampleUnavailablePresentationData(locale)
    setEditSource({ rawText: serializeSlides(unavailable), baseDir: '', sourcePath: undefined })
    await showPresentation(unavailable)
  }, [applyLoadResult, clearPackageAddons, locale, showPresentation, showToast, t])

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

  // ホーム画面の「AIで新規作成」。既存プレゼンを開かず、最小構成の空プレゼンを土台に編集モード＋AI生成パネルへ直接遷移する
  const handleCreateWithAi = useCallback(() => {
    // 新規作成は既存パッケージを開かないため、パッケージ由来のアドオンは破棄する
    clearPackageAddons()
    const data = getBlankPresentationData(locale)
    applyPresentationData(data)
    setEditSource({ rawText: serializeSlides(data), baseDir: '', sourcePath: undefined, aiPanelExpanded: true })
    handleStartEdit()
  }, [applyPresentationData, clearPackageAddons, handleStartEdit, locale])

  /** Rust 側の編集モードフラグ（書き込みゲート）を閉じる。失敗しても UI 遷移はブロックしない（A-005） */
  const closeEditGate = useCallback(() => {
    void exitEditMode().catch((error) => console.error('[main] 編集モードの無効化に失敗しました', error))
  }, [])

  const handleExitEdit = useCallback(() => {
    closeEditGate()
    // 編集中に適用したテーマを、表示中プレゼンのテーマへ戻す
    void applyThemeAndNotify(presentationData?.meta?.themeColors, presentationData?.theme)
    setView('presentation')
  }, [closeEditGate, presentationData, applyThemeAndNotify])

  const handleOpenAssociated = useCallback(
    async (path: string) => {
      return applyLoadResult(await openSlidePackageFromPath(path))
    },
    [applyLoadResult],
  )

  // OS のファイル関連付け（Finder の「このアプリケーションで開く」等）から届いたオープン要求の受け口（#105・4番目の読み込み導線）。
  // 編集中は未保存の変更を勝手に破棄しないよう、SlideEditor へ降ろして確認ダイアログを任せる
  const handleOpenRequest = useCallback(
    (path: string) => {
      if (view === 'edit') {
        setPendingOpenPath(path)
        return
      }
      void handleOpenAssociated(path)
    },
    [view, handleOpenAssociated],
  )
  useOpenSlideRequest(handleOpenRequest)

  // 編集中のオープン要求に対する SlideEditor からの回答（確認ダイアログの確定／取消、未保存でなければ即確定）
  const handleResolveOpen = useCallback(
    async (confirmed: boolean) => {
      const path = pendingOpenPath
      setPendingOpenPath(null)
      if (!confirmed || path === null) return
      // 読み込みに失敗したときは編集画面に留まるため、書き込みゲートは閉じない（保存できなくしない）
      if (await handleOpenAssociated(path)) closeEditGate()
    },
    [pendingOpenPath, handleOpenAssociated, closeEditGate],
  )

  // 画面本体は排他（いずれか1つだけ描画される）
  const renderScreen = () => {
    // 設定・ショートカットのどちらかが開いている間は編集画面の Esc（編集終了）を止める（#126）
    if (view === 'edit' && editSource)
      return <SlideEditor source={editSource} onExit={handleExitEdit} openRequestPath={pendingOpenPath} onResolveOpen={handleResolveOpen} onOpenSettings={openSettings} rootDialogOpen={settingsOpen || shortcutsOpen} />
    if (view === 'home')
      return (
        <HomeScreen
          recentPackages={recentPackages}
          onOpenRecent={handleOpenRecent}
          onRemoveRecent={handleRemoveRecent}
          onOpenSample={handleOpenSample}
          onBrowse={handleBrowse}
          onCreateWithAi={handleCreateWithAi}
          onOpenUrl={handleOpenUrl}
          onOpenSettings={openSettings}
        />
      )
    return (
      <App
        key={presentationKey}
        presentationData={presentationData}
        onGoHome={handleGoHome}
        onStartEdit={handleStartEdit}
        addonOwner={addonInfo.owner}
        addonScripts={addonInfo.scripts}
        scrollSpeed={scrollSpeed}
        onScrollSpeedChange={setScrollSpeed}
        onOpenSettings={openSettings}
      />
    )
  }

  return (
    <>
      {renderScreen()}
      {/* 設定・ショートカットのダイアログは画面本体の兄弟として並べ、どの画面からでも開けるようにする */}
      <SettingsWindow
        open={settingsOpen}
        onClose={closeSettings}
        global={{
          embeddedAddonsDisabled: addonsDisabled,
          onToggleEmbeddedAddons: handleToggleAddonsDisabled,
          onResetAddonTrust: handleResetAddonTrust,
          addonTrust: addonTrustList,
          onSetAddonTrust: handleSetAddonTrust,
          onOpenShortcuts: openShortcuts,
        }}
        // スクロール速度はプレゼンテーション画面でのみ意味を持つ設定なので、他画面では渡さない（行が出ない）
        presentation={view === 'presentation' ? { scrollSpeed, setScrollSpeed } : undefined}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
    </>
  )
}

interface RootProps {
  locales: LocaleResource[]
  initialRecentPackages: RecentSlidePackageEntry[]
}

function Root({ locales, initialRecentPackages }: RootProps) {
  return (
    <I18nProvider locales={locales}>
      {/* MUI テーマはこの層で 1 度だけ張る。DialogFrame の背景は MuiPaper-root と CSS 詳細度が同等なため、
          theme が無いと MUI 既定の paper 色が漏れる。編集画面は内側で editorUiTheme に差し替える */}
      <ThemeProvider theme={theme}>
        <ToastProvider>
          <RootContent initialRecentPackages={initialRecentPackages} />
        </ToastProvider>
      </ThemeProvider>
    </I18nProvider>
  )
}

const root = createRoot(document.getElementById('root')!)

// アドオン・言語リソース・最近開いたスライド一覧・テーマを並行してロードしてから、常にホーム画面を表示する
Promise.all([loadBuiltinAddons(), loadLocales(), getRecentSlidePackages(), applyTheme()]).then(([, locales, initialRecentPackages]) => {
  root.render(<Root locales={locales} initialRecentPackages={initialRecentPackages} />)
})
