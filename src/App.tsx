import { ThemeProvider } from '@mui/material/styles'
import { AudioControlBar } from './components/AudioControlBar'
import { AudioPlayButton } from './components/AudioPlayButton'
import { FallbackImage } from './components/FallbackImage'
import { EditButton } from './components/EditButton'
import { HomeButton } from './components/HomeButton'
import { PresenterViewButton } from './components/PresenterViewButton'
import { SettingsButton } from './components/SettingsButton'
import { SettingsWindow } from './components/SettingsWindow'
import { SlideRenderer } from './components/SlideRenderer'
import { registerDefaultComponents } from './components/registerDefaults'
import { getDefaultPresentationData, loadPresentationData } from './data'
import type { PresentationData } from './data'
import { clearAddonTrustDecision, getAddonTrustMap, getRecentSlidePackages, isEmbeddedAddonsDisabled, resetAddonTrust, setAddonTrustDecision, setEmbeddedAddonsDisabled } from './localSlideLoader'
import type { AddonTrustDecision } from './localSlideLoader'
import type { AddonTrustEntry } from './components/SettingsWindow'
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
  onGoHome: () => void
  /** 編集モードを開始する（未指定なら編集ボタンを表示しない） */
  onStartEdit?: () => void
  /** 現在のパッケージ同梱アドオンの owner（発表者ビューへの伝搬用） */
  addonOwner?: string
  /** 現在のパッケージ同梱アドオンの asset URL 群（発表者ビューへの伝搬用） */
  addonScripts?: string[]
}

export function App({ presentationData, onGoHome, onStartEdit, addonOwner, addonScripts }: AppProps) {
  const { locale } = useI18n()
  const defaultData = useMemo(() => getDefaultPresentationData(locale), [locale])
  const data = loadPresentationData(presentationData, defaultData)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addonsDisabled, setAddonsDisabled] = useState(false)
  // 層C: 実行時信頼の個別付け外し対象（最近開いたパッケージ × 現在の信頼判断）
  const [addonTrustList, setAddonTrustList] = useState<AddonTrustEntry[]>([])

  // 同梱アドオンの一律無効化フラグを永続ストアから復元する
  useEffect(() => {
    void isEmbeddedAddonsDisabled().then(setAddonsDisabled)
  }, [])

  // 設定ダイアログを開くたびに、信頼判断を持つパッケージ（trustMap 全キー）と最近開いたパッケージを
  // 突き合わせて一覧化する（層C・FR-008）。trustMap を基点にすることで、最近リストの上限を超えて
  // 追い出された「許可済み」パッケージも一覧に残り、個別に取り消せる。title は recent から補完する
  useEffect(() => {
    if (!settingsOpen) return
    void Promise.all([getRecentSlidePackages(), getAddonTrustMap()]).then(([recent, trustMap]) => {
      const titleByPath = new Map(recent.map((r) => [r.path, r.title]))
      const recentPaths = recent.map((r) => r.path)
      // recent を先頭に、trustMap にしか無い（＝追い出された）判断済みパッケージを後ろに並べる
      const extraPaths = Object.keys(trustMap).filter((p) => !recentPaths.includes(p))
      setAddonTrustList([...recentPaths, ...extraPaths].map((path) => ({ path, title: titleByPath.get(path) ?? path, decision: trustMap[path] })))
    })
  }, [settingsOpen])

  const handleToggleAddonsDisabled = useCallback((disabled: boolean) => {
    setAddonsDisabled(disabled)
    void setEmbeddedAddonsDisabled(disabled)
  }, [])

  // 永続化失敗時に楽観更新した一覧を実態へ戻す（await して store の save 失敗を握りつぶさない）
  const reloadTrustList = useCallback(() => {
    void getAddonTrustMap().then((trustMap) => {
      setAddonTrustList((list) => list.map((e) => ({ ...e, decision: trustMap[e.path] })))
    })
  }, [])

  const handleResetAddonTrust = useCallback(() => {
    // 失効に合わせてローカル一覧の判断も未設定へ戻す（失敗時は実態へロールバック）
    setAddonTrustList((list) => list.map((e) => ({ ...e, decision: undefined })))
    resetAddonTrust().catch((err) => {
      console.error('[App] アドオン許可履歴のリセットに失敗しました', err)
      reloadTrustList()
    })
  }, [reloadTrustList])

  // decision が undefined のときは「未設定」へ戻す（trustMap からキー削除）
  const handleSetAddonTrust = useCallback(
    (path: string, decision: AddonTrustDecision | undefined) => {
      setAddonTrustList((list) => list.map((e) => (e.path === path ? { ...e, decision } : e)))
      const op = decision === undefined ? clearAddonTrustDecision(path) : setAddonTrustDecision(path, decision)
      op.catch((err) => {
        console.error('[App] アドオン信頼の保存に失敗しました', err)
        reloadTrustList()
      })
    },
    [reloadTrustList],
  )

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
    addonOwner,
    addonScripts,
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
        <HomeButton onClick={onGoHome} />
        {onStartEdit && <EditButton onClick={onStartEdit} />}
        <SettingsButton onClick={() => setSettingsOpen(true)} />
      </div>
      <div className="toolbar">
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
      <SettingsWindow
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        scrollSpeed={scrollSpeed}
        setScrollSpeed={setScrollSpeed}
        embeddedAddonsDisabled={addonsDisabled}
        onToggleEmbeddedAddons={handleToggleAddonsDisabled}
        onResetAddonTrust={handleResetAddonTrust}
        addonTrust={addonTrustList}
        onSetAddonTrust={handleSetAddonTrust}
      />
    </ThemeProvider>
  )
}
