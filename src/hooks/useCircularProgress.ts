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
    if (!autoSlideshow) {
      return { progress: 0, source: 'none' as const, visible: false }
    }

    if (hasVoice && audioProgress) {
      if (audioProgress.duration > 0) {
        return { progress: 0, source: 'audio' as const, visible: true, animationDuration: audioProgress.duration }
      }
      return { progress: 0, source: 'audio' as const, visible: true }
    }

    // voice 未定義、または voice 定義済みだが音声読み込み失敗時のタイマーフォールバック（DC_SNA_002 準拠）
    if (timerDuration != null && timerDuration > 0) {
      return { progress: 0, source: 'timer' as const, visible: true, animationDuration: timerDuration }
    }

    return { progress: 0, source: 'none' as const, visible: false }
  }, [autoSlideshow, hasVoice, audioProgress?.duration, timerDuration])
}
