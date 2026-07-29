import { useMemo } from 'react'
import type { AudioPlaybackState } from '../data/types'

/** 円形プログレスの進行ソース種別 */
export type ProgressSource = 'audio' | 'timer' | 'none'

/** useCircularProgress フックの入力 */
export interface UseCircularProgressOptions {
  autoSlideshow: boolean
  hasVoice: boolean
  /** 音声の再生状態。idle の場合は音声プログレスとして扱わない（未再生 or 停止済み） */
  audioPlaybackState: AudioPlaybackState
  /** 音声の総時間（秒）。audioPlaybackState が idle の間は無視される */
  audioDuration: number
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
  /** true の場合、CSS アニメーションを一時停止した状態で描画する（現在位置を維持） */
  paused?: boolean
}

export function useCircularProgress({ autoSlideshow, hasVoice, audioPlaybackState, audioDuration, timerDuration }: UseCircularProgressOptions): UseCircularProgressReturn {
  return useMemo(() => {
    if (!autoSlideshow) {
      return { progress: 0, source: 'none' as const, visible: false }
    }

    if (hasVoice && audioPlaybackState !== 'idle') {
      const paused = audioPlaybackState === 'paused'
      if (audioDuration > 0) {
        return { progress: 0, source: 'audio' as const, visible: true, animationDuration: audioDuration, paused }
      }
      return { progress: 0, source: 'audio' as const, visible: true, paused }
    }

    // voice 未定義、または voice 定義済みだが音声読み込み失敗時のタイマーフォールバック（DC_SNA_002 準拠）
    if (timerDuration != null && timerDuration > 0) {
      return { progress: 0, source: 'timer' as const, visible: true, animationDuration: timerDuration }
    }

    return { progress: 0, source: 'none' as const, visible: false }
  }, [autoSlideshow, hasVoice, audioPlaybackState, audioDuration, timerDuration])
}
