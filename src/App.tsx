import { ThemeProvider } from '@mui/material/styles'
import { AudioControlBar } from './components/AudioControlBar'
import { AudioPlayButton } from './components/AudioPlayButton'
import { FallbackImage } from './components/FallbackImage'
import { PresenterViewButton } from './components/PresenterViewButton'
import { SettingsButton } from './components/SettingsButton'
import { SettingsWindow } from './components/SettingsWindow'
import { SlideRenderer } from './components/SlideRenderer'
import { registerDefaultComponents } from './components/registerDefaults'
import { getDefaultPresentationData, loadPresentationData } from './data'
import type { PresentationData } from './data'
import { getVoicePath } from './data/noteHelpers'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useAutoSlideshow } from './hooks/useAutoSlideshow'
import { usePresenterView } from './hooks/usePresenterView'
import { useCircularProgress } from './hooks/useCircularProgress'
import { useReveal } from './hooks/useReveal'
import { theme } from './theme'
import { applyThemeData } from './applyTheme'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './i18n'

// デフォルトコンポーネントを登録
registerDefaultComponents()

type AppProps = {
  presentationData?: PresentationData
}

export function App({ presentationData }: AppProps) {
  const { locale } = useI18n()
  const defaultData = useMemo(() => getDefaultPresentationData(locale), [locale])
  const data = loadPresentationData(presentationData, defaultData)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  const scrollSpeedRef = useRef(0)
  const setScrollSpeedRef = useRef<(speed: number) => void>(() => {})

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

  const handleScrollSpeedChange = useCallback((speed: number) => {
    setScrollSpeedRef.current(speed)
  }, [])

  const { openPresenterView, isOpen, sendSlideState, sendControlState, sendProgressState } = usePresenterView({
    slides: data.slides,
    onNavigate: handleNavigate,
    onAudioToggle: handleAudioToggle,
    onAutoPlayToggle: handleAutoPlayToggle,
    onAutoSlideshowToggle: handleAutoSlideshowToggle,
    onScrollSpeedChange: handleScrollSpeedChange,
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

  const { autoPlay, setAutoPlay, autoSlideshow, setAutoSlideshow, scrollSpeed, setScrollSpeed, timerDuration } = useAutoSlideshow({
    slides: data.slides,
    currentIndex,
    audioPlayer,
    goToNext,
  })

  // setter と値の ref を更新
  autoPlayRef.current = autoPlay
  autoSlideshowRef.current = autoSlideshow
  setAutoPlayRef.current = setAutoPlay
  setAutoSlideshowRef.current = setAutoSlideshow
  scrollSpeedRef.current = scrollSpeed
  setScrollSpeedRef.current = setScrollSpeed

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
      scrollSpeed,
    })
  }, [audioPlayer.isPlaying, autoPlay, autoSlideshow, currentVoicePath, scrollSpeed, sendControlState])

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

  const logo = data.meta.logo

  return (
    <ThemeProvider theme={theme}>
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
      <div className="toolbar toolbar-left">
        <SettingsButton onClick={() => setSettingsOpen(true)} />
      </div>
      <div className="toolbar">
        {currentVoicePath && <AudioPlayButton playbackState={audioPlayer.playbackState} onToggle={handleAudioToggleLocal} />}
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
      <SettingsWindow open={settingsOpen} onClose={() => setSettingsOpen(false)} scrollSpeed={scrollSpeed} setScrollSpeed={setScrollSpeed} />
    </ThemeProvider>
  )
}
