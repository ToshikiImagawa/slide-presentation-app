import { useMemo } from 'react'

/** 円形プログレスの進行ソース種別 */
export type ProgressSource = 'audio' | 'timer' | 'none'

/** 音声再生の進行情報 */
export interface AudioProgress {
  currentTime: number
  duration: number
}

/** useCircularProgress フックの入力 */
export interface UseCircularProgressOptions {
  autoSlideshow: boolean
  hasVoice: boolean
  audioProgress: AudioProgress | null
  /** タイマーがアクティブな場合の総時間（秒）。非アクティブ時は null */
  timerDuration: number | null
}

/** useCircularProgress フックの出力 */
export interface UseCircularProgressReturn {
  progress: number
  source: ProgressSource
  visible: boolean
  /** CSS アニメーション用 duration（秒）。タイマーモード・音声モードで使用。none 時は undefined */
  animationDuration?: number
}

export function useCircularProgress({ autoSlideshow, hasVoice, audioProgress, timerDuration }: UseCircularProgressOptions): UseCircularProgressReturn {
  return useMemo(() => {
    console.log('[CircularProgress hook]', { autoSlideshow, hasVoice, audioProgressDuration: audioProgress?.duration, timerDuration })

    if (!autoSlideshow) {
      console.log('[CircularProgress hook] → branch: autoSlideshow=false')
      return { progress: 0, source: 'none' as const, visible: false }
    }

    if (hasVoice && audioProgress) {
      if (audioProgress.duration > 0) {
        console.log('[CircularProgress hook] → branch: audio with duration', audioProgress.duration)
        return { progress: 0, source: 'audio' as const, visible: true, animationDuration: audioProgress.duration }
      }
      console.log('[CircularProgress hook] → branch: audio but duration=0')
      return { progress: 0, source: 'audio' as const, visible: true }
    }

    if (!hasVoice && timerDuration != null && timerDuration > 0) {
      console.log('[CircularProgress hook] → branch: timer', timerDuration)
      return { progress: 0, source: 'timer' as const, visible: true, animationDuration: timerDuration }
    }

    console.log('[CircularProgress hook] → branch: fallback (none)')
    return { progress: 0, source: 'none' as const, visible: false }
  }, [autoSlideshow, hasVoice, audioProgress?.duration, timerDuration])
}
