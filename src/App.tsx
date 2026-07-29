import { AudioControlBar } from './components/AudioControlBar'
import { AudioPlayButton } from './components/AudioPlayButton'
import { FallbackImage } from './components/FallbackImage'
import { EditButton } from './components/EditButton'
import { HomeButton } from './components/HomeButton'
import { PresenterViewButton } from './components/PresenterViewButton'
import { SettingsButton } from './components/SettingsButton'
import { SlideRenderer } from './components/SlideRenderer'
import { ToolbarVisibilityButton } from './components/ToolbarVisibilityButton'
import { registerDefaultComponents } from './components/registerDefaults'
import { getFallbackPresentationData, loadPresentationData } from './data'
import type { PresentationData } from './data'
import { getVoicePath } from './data/noteHelpers'
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
  const { locale } = useI18n()
  const defaultData = useMemo(() => getFallbackPresentationData(locale), [locale])
  const data = loadPresentationData(presentationData, defaultData)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [toolbarHidden, setToolbarHidden] = useState(false)

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

  currentIndexRef.current = currentIndex
  audioPlayerRef.current = audioPlayer

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (direction === 'next') goToNextRef.current()
    else goToPrevRef.current()
  }, [])

  const handleAudioToggle = useCallback(() => {
    const voicePath = getVoicePath(data.slides[currentIndexRef.current])
    if (!voicePath) return
    if (audioPlayerRef.current.isPlaying) {
      audioPlayerRef.current.stop()
    } else {
      audioPlayerRef.current.play(voicePath)
    }
  }, [data.slides])

  const handleAutoPlayToggle = useCallback(() => {
    setAutoPlayRef.current(!autoPlayRef.current)
  }, [])

  const handleAutoSlideshowToggle = useCallback(() => {
    setAutoSlideshowRef.current(!autoSlideshowRef.current)
  }, [])

  const { openPresenterView, isOpen, sendSlideState, sendControlState, sendProgressState } = usePresenterView({
    slides: data.slides,
    addonOwner,
    addonScripts,
    themeColors: data.meta?.themeColors,
    theme: data.theme,
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

  const { deckRef, goToNext, goToPrev } = useReveal({ onSlideChanged: handleSlideChanged })

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
  } = useCircularProgress({
    autoSlideshow,
    hasVoice: !!currentVoicePath,
    audioProgress: audioPlayer.isPlaying ? { currentTime: audioPlayer.currentTime, duration: audioPlayer.duration } : null,
    timerDuration,
  })

  // プログレス状態を発表者ビューに同期
  useEffect(() => {
    sendProgressState(progress, progressVisible, animationDuration)
  }, [progress, progressVisible, animationDuration, sendProgressState])

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

  const handleAudioToggleLocal = useCallback(() => {
    if (!currentVoicePath) return
    if (audioPlayer.isPlaying) {
      audioPlayer.stop()
    } else {
      audioPlayer.play(currentVoicePath)
    }
  }, [currentVoicePath, audioPlayer.isPlaying, audioPlayer.stop, audioPlayer.play])

  useEffect(() => {
    if (data.theme) {
      applyThemeData(data.theme)
    }
  }, [data.theme])

  const handleToggleToolbar = useCallback(() => setToolbarHidden((prev) => !prev), [])

  // T キーでツールバーの表示・非表示をトグルする（入力中は無視）。ツールバーはプレゼンテーション画面固有の
  // ローカル状態なので、この購読も App が持つ（Root 所有ダイアログを開く ? キーは main.tsx 側）。
  // T は Reveal.js のデフォルトキーバインド（H/L/K/J/N/P/B/F/G/O 等）と衝突しないキーとして選定した
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key.toLowerCase() === 't') handleToggleToolbar()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleToolbar])

  const logo = data.meta.logo
  const toolbarHiddenClass = toolbarHidden ? ' toolbar-hidden' : ''

  return (
    <>
      <div className="reveal" ref={deckRef}>
        <div className="slides">
          <SlideRenderer slides={data.slides} />
        </div>
      </div>
      {logo && (
        <div className="slide-logo">
          <FallbackImage src={logo.src} width={logo.width ?? 120} height={logo.height ?? 40} alt="Logo" />
        </div>
      )}
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
          onAutoPlayChange={setAutoPlay}
          autoSlideshow={autoSlideshow}
          onAutoSlideshowChange={setAutoSlideshow}
          progress={progress}
          progressVisible={progressVisible}
          animationDuration={animationDuration}
          progressResetKey={currentIndex}
        />
        <PresenterViewButton onClick={openPresenterView} isOpen={isOpen} />
      </div>
    </>
  )
}
