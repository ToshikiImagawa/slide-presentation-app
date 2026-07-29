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
  /** 音声が一時停止中かどうか。true の間は表示を維持したままアニメーションを一時停止する */
  paused?: boolean
}

/** useCircularProgress フックの出力 */
export interface UseCircularProgressReturn {
  progress: number
  source: ProgressSource
  visible: boolean
  /** CSS アニメーション用 duration（秒）。タイマーモード・音声モードで使用。none 時は undefined */
  animationDuration?: number
  /** true の場合、CSS アニメーションを一時停止した状態で描画する（現在位置を維持） */
  paused?: boolean
}

export function useCircularProgress({ autoSlideshow, hasVoice, audioProgress, timerDuration, paused = false }: UseCircularProgressOptions): UseCircularProgressReturn {
  return useMemo(() => {
    if (!autoSlideshow) {
      return { progress: 0, source: 'none' as const, visible: false }
    }

    if (hasVoice && audioProgress) {
      if (audioProgress.duration > 0) {
        return { progress: 0, source: 'audio' as const, visible: true, animationDuration: audioProgress.duration, paused }
      }
      return { progress: 0, source: 'audio' as const, visible: true, paused }
    }

    // voice 未定義、または voice 定義済みだが音声読み込み失敗時のタイマーフォールバック（DC_SNA_002 準拠）
    if (timerDuration != null && timerDuration > 0) {
      return { progress: 0, source: 'timer' as const, visible: true, animationDuration: timerDuration }
    }

    return { progress: 0, source: 'none' as const, visible: false }
  }, [autoSlideshow, hasVoice, audioProgress?.duration, timerDuration, paused])
}
