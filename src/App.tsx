import { AudioControlBar } from './components/AudioControlBar'
import { AudioPlayButton } from './components/AudioPlayButton'
import { EditButton } from './components/EditButton'
import { HomeButton } from './components/HomeButton'
import { PdfExportButton } from './components/PdfExportButton'
import type { PdfExportState } from './components/PdfExportButton'
import { PdfExportOverlay } from './components/PdfExportOverlay'
import { PresenterViewButton } from './components/PresenterViewButton'
import { SettingsButton } from './components/SettingsButton'
import { SlideRenderer } from './components/SlideRenderer'
import { ToolbarVisibilityButton } from './components/ToolbarVisibilityButton'
import { registerDefaultComponents } from './components/registerDefaults'
import { getFallbackPresentationData, loadPresentationData } from './data'
import type { PresentationData } from './data'
import { getVoicePath } from './data/noteHelpers'
import { isTypingTarget } from './keyboardTarget'
import { exportSlidesToPdf } from './pdfExport'
import { useToast } from './toast'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useAutoSlideshow } from './hooks/useAutoSlideshow'
import { usePresenterView } from './hooks/usePresenterView'
import { useCircularProgress } from './hooks/useCircularProgress'
import { useReveal } from './hooks/useReveal'
import { applyThemeData } from './applyTheme'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './i18n'

// デフォルトコンポーネントを登録
registerDefaultComponents()

type AppProps = {
  presentationData?: PresentationData
  onGoHome: () => void
  /** 編集モードを開始する（未指定なら編集ボタンを表示しない） */
  onStartEdit?: () => void
  /** 現在のパッケージ同梱アドオンの owner（発表者ビューへの伝搬用） */
  addonOwner?: string
  /** 現在のパッケージ同梱アドオンの asset URL 群（発表者ビューへの伝搬用） */
  addonScripts?: string[]
  /** タイマー自動送りの秒数（所有者は Root）。設定ダイアログもここを参照する */
  scrollSpeed: number
  /** スクロール速度の変更を Root へ通知する（発表者ビューからの変更もこの経路を通る） */
  onScrollSpeedChange: (speed: number) => void
  /** 設定ダイアログを開く（ダイアログ本体は Root が持つ） */
  onOpenSettings: () => void
}

export function App({ presentationData, onGoHome, onStartEdit, addonOwner, addonScripts, scrollSpeed, onScrollSpeedChange, onOpenSettings }: AppProps) {
  const { locale, t } = useI18n()
  const { showToast } = useToast()
  const defaultData = useMemo(() => getFallbackPresentationData(locale), [locale])
  const data = loadPresentationData(presentationData, defaultData)
  const logo = data.meta.logo
  const [currentIndex, setCurrentIndex] = useState(0)
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [pdfExportState, setPdfExportState] = useState<PdfExportState>('idle')

  const audioPlayer = useAudioPlayer()

  // ref で最新値を保持（コールバックからの stale closure 回避）
  const goToNextRef = useRef<() => void>(() => {})
  const goToPrevRef = useRef<() => void>(() => {})
  const currentIndexRef = useRef(currentIndex)
  const audioPlayerRef = useRef(audioPlayer)
  const autoPlayRef = useRef(false)
  const autoSlideshowRef = useRef(false)
  const setAutoPlayRef = useRef<(enabled: boolean) => void>(() => {})
  const setAutoSlideshowRef = useRef<(enabled: boolean) => void>(() => {})
  const pdfExportingRef = useRef(false)

  currentIndexRef.current = currentIndex
  audioPlayerRef.current = audioPlayer
  pdfExportingRef.current = pdfExportState === 'exporting'

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'next') goToNextRef.current()
    else goToPrevRef.current()
  }, [])

  const handleAudioToggle = useCallback(() => {
    if (pdfExportingRef.current) return
    const voicePath = getVoicePath(data.slides[currentIndexRef.current])
    if (!voicePath) return
    audioPlayerRef.current.toggle(voicePath)
  }, [data.slides])

  const handleAutoPlayToggle = useCallback(() => {
    if (pdfExportingRef.current) return
    setAutoPlayRef.current(!autoPlayRef.current)
  }, [])

  const handleAutoSlideshowToggle = useCallback(() => {
    if (pdfExportingRef.current) return
    setAutoSlideshowRef.current(!autoSlideshowRef.current)
  }, [])

  const { openPresenterView, isOpen, sendSlideState, sendControlState, sendProgressState } = usePresenterView({
    slides: data.slides,
    currentIndex,
    addonOwner,
    addonScripts,
    themeColors: data.meta?.themeColors,
    theme: data.theme,
    logo,
    onNavigate: handleNavigate,
    onAudioToggle: handleAudioToggle,
    onAutoPlayToggle: handleAutoPlayToggle,
    onAutoSlideshowToggle: handleAutoSlideshowToggle,
    // 所有者が Root なので、発表者ビューからの変更もそのまま Root へ通す（ref 経由の中継は不要）
    onScrollSpeedChange,
  })

  const handleSlideChanged = useCallback(
    (event: { indexh: number }) => {
      audioPlayerRef.current.stop()
      sendSlideState(event.indexh)
      setCurrentIndex(event.indexh)
    },
    [sendSlideState],
  )

  const { deckRef, goToNext, goToPrev, setNavigationLocked } = useReveal({ onSlideChanged: handleSlideChanged })

  // ref を最新値に更新
  goToNextRef.current = goToNext
  goToPrevRef.current = goToPrev

  const { autoPlay, setAutoPlay, autoSlideshow, setAutoSlideshow, timerDuration } = useAutoSlideshow({
    slides: data.slides,
    currentIndex,
    audioPlayer,
    goToNext,
    scrollSpeed,
  })

  // setter と値の ref を更新
  autoPlayRef.current = autoPlay
  autoSlideshowRef.current = autoSlideshow
  setAutoPlayRef.current = setAutoPlay
  setAutoSlideshowRef.current = setAutoSlideshow

  const currentVoicePath = getVoicePath(data.slides[currentIndex])

  // 円形プログレスの状態算出
  const {
    progress,
    visible: progressVisible,
    animationDuration,
    paused: progressPaused,
  } = useCircularProgress({
    autoSlideshow,
    hasVoice: !!currentVoicePath,
    audioPlaybackState: audioPlayer.playbackState,
    audioDuration: audioPlayer.duration,
    timerDuration,
  })

  // プログレス状態を発表者ビューに同期
  useEffect(() => {
    sendProgressState({ progress, visible: progressVisible, animationDuration, paused: progressPaused })
  }, [progress, progressVisible, animationDuration, progressPaused, sendProgressState])

  // 制御状態を発表者ビューに同期
  useEffect(() => {
    sendControlState({
      isPlaying: audioPlayer.isPlaying,
      autoPlay,
      autoSlideshow,
      hasVoice: !!currentVoicePath,
      hasError: audioPlayer.hasError,
      scrollSpeed,
    })
  }, [audioPlayer.isPlaying, audioPlayer.hasError, autoPlay, autoSlideshow, currentVoicePath, scrollSpeed, sendControlState])

  const handleAutoPlayChangeLocal = useCallback(
    (enabled: boolean) => {
      if (pdfExportingRef.current) return
      setAutoPlay(enabled)
    },
    [setAutoPlay],
  )

  const handleAutoSlideshowChangeLocal = useCallback(
    (enabled: boolean) => {
      if (pdfExportingRef.current) return
      setAutoSlideshow(enabled)
    },
    [setAutoSlideshow],
  )

  const handleAudioToggleLocal = useCallback(() => {
    if (pdfExportingRef.current) return
    if (!currentVoicePath) return
    audioPlayer.toggle(currentVoicePath)
  }, [currentVoicePath, audioPlayer.toggle])

  useEffect(() => {
    if (data.theme) {
      applyThemeData(data.theme)
    }
  }, [data.theme])

  const handleToggleToolbar = useCallback(() => setToolbarHidden((prev) => !prev), [])

  const handlePdfExport = useCallback(async () => {
    if (pdfExportState === 'exporting' || !deckRef.current) return
    setPdfExportState('exporting')
    // 書き出し中は .present を直接操作するため、その間にスライドが送られると撮影対象と競合する
    setNavigationLocked(true)
    try {
      await exportSlidesToPdf(deckRef.current, data.meta?.title ?? 'slides')
      setPdfExportState('idle')
    } catch (e) {
      console.error(e)
      setPdfExportState('error')
      showToast(t('toolbar.pdfExportError'))
    } finally {
      setNavigationLocked(false)
    }
  }, [pdfExportState, data.meta?.title, showToast, t, setNavigationLocked])

  // T キーでツールバーの表示・非表示をトグルする（入力中は無視）。ツールバーはプレゼンテーション画面固有の
  // ローカル状態なので、この購読も App が持つ（Root 所有ダイアログを開く ? キーは main.tsx 側）。
  // T は Reveal.js のデフォルトキーバインド（H/L/K/J/N/P/B/F/G/O 等）と衝突しないキーとして選定した
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't' || isTypingTarget(e.target)) return
      handleToggleToolbar()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleToolbar])

  const toolbarHiddenClass = toolbarHidden ? ' toolbar-hidden' : ''

  return (
    <>
      <div className="reveal" ref={deckRef}>
        <div className="slides">
          <SlideRenderer slides={data.slides} logo={logo} />
        </div>
      </div>
      <div className={`toolbar toolbar-left${toolbarHiddenClass}`}>
        <HomeButton onClick={onGoHome} />
        {onStartEdit && <EditButton onClick={onStartEdit} />}
        <ToolbarVisibilityButton hidden={toolbarHidden} onClick={handleToggleToolbar} />
        <SettingsButton onClick={onOpenSettings} />
      </div>
      <div className={`toolbar${toolbarHiddenClass}`}>
        {currentVoicePath && <AudioPlayButton playbackState={audioPlayer.playbackState} hasError={audioPlayer.hasError} onToggle={handleAudioToggleLocal} />}
        <AudioControlBar
          autoPlay={autoPlay}
          onAutoPlayChange={handleAutoPlayChangeLocal}
          autoSlideshow={autoSlideshow}
          onAutoSlideshowChange={handleAutoSlideshowChangeLocal}
          progress={progress}
          progressVisible={progressVisible}
          animationDuration={animationDuration}
          progressResetKey={currentIndex}
          progressPaused={progressPaused}
        />
        <PdfExportButton onClick={handlePdfExport} state={pdfExportState} />
        <PresenterViewButton onClick={openPresenterView} isOpen={isOpen} />
      </div>
      <PdfExportOverlay open={pdfExportState === 'exporting'} />
    </>
  )
}
