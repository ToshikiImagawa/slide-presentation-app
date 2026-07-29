import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SlideData } from '../data'
import type { UseAudioPlayerReturn } from './useAudioPlayer'
import { getVoicePath } from '../data/noteHelpers'

export interface UseAutoSlideshowOptions {
  slides: SlideData[]
  currentIndex: number
  audioPlayer: UseAudioPlayerReturn
  goToNext: () => void
  /** タイマー自動送りの秒数。localStorage 永続のグローバル設定なので所有者は Root（useScrollSpeed）側 */
  scrollSpeed: number
}

export interface UseAutoSlideshowReturn {
  autoPlay: boolean
  setAutoPlay: (enabled: boolean) => void
  autoSlideshow: boolean
  setAutoSlideshow: (enabled: boolean) => void
  /** タイマーがアクティブな場合の総時間（秒）。非アクティブ時は null */
  timerDuration: number | null
}

export function useAutoSlideshow({ slides, currentIndex, audioPlayer, goToNext, scrollSpeed }: UseAutoSlideshowOptions): UseAutoSlideshowReturn {
  const [autoPlay, setAutoPlay] = useState(false)
  const [autoSlideshow, setAutoSlideshow] = useState(false)

  // 自動再生: スライド変更時に voice があれば再生
  useEffect(() => {
    if (!autoPlay) return
    const currentSlide = slides[currentIndex]
    if (!currentSlide) return
    const voicePath = getVoicePath(currentSlide)
    if (voicePath) {
      audioPlayer.play(voicePath)
    }
  }, [autoPlay, currentIndex, slides, audioPlayer.play])

  // 自動スライドショー: 音声終了時に次スライドへ
  const handleAudioEnded = useCallback(() => {
    if (!autoSlideshow) return
    const isLastSlide = currentIndex >= slides.length - 1
    if (!isLastSlide) {
      goToNext()
    }
  }, [autoSlideshow, currentIndex, slides.length, goToNext])

  // onEndedRef にコールバックを設定
  useEffect(() => {
    audioPlayer.onEndedRef.current = handleAudioEnded
  }, [audioPlayer.onEndedRef, handleAudioEnded])

  // タイマーベース自動スクロール: voice 未定義スライド、または音声読み込み失敗時に scrollSpeed 秒後に次スライドへ
  const shouldUseTimer = useMemo(() => {
    if (!autoSlideshow) return false
    const currentSlide = slides[currentIndex]
    if (!currentSlide) return false
    if (currentIndex >= slides.length - 1) return false
    const voicePath = getVoicePath(currentSlide)
    if (!voicePath) return true
    // voice が定義されているが音声読み込みに失敗した場合、タイマーフォールバック（DC_SNA_002 準拠）
    return audioPlayer.hasError
  }, [autoSlideshow, currentIndex, slides, audioPlayer.hasError])

  useEffect(() => {
    if (!shouldUseTimer) return
    const timerId = setTimeout(goToNext, scrollSpeed * 1000)
    return () => clearTimeout(timerId)
  }, [shouldUseTimer, currentIndex, scrollSpeed, goToNext])

  // タイマーがアクティブかどうかを算出（プログレス表示用）
  const timerDuration = useMemo(() => {
    if (!shouldUseTimer) return null
    return scrollSpeed
  }, [shouldUseTimer, scrollSpeed])

  return {
    autoPlay,
    setAutoPlay,
    autoSlideshow,
    setAutoSlideshow,
    timerDuration,
  }
}
