import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioPlaybackState } from '../data/types'

export interface UseAudioPlayerReturn {
  playbackState: AudioPlaybackState
  play: (src: string) => void
  stop: () => void
  isPlaying: boolean
  /** 音声終了時のコールバックを登録する */
  onEndedRef: React.MutableRefObject<(() => void) | null>
  /** 現在の再生位置（秒） */
  currentTime: number
  /** 音声の総時間（秒） */
  duration: number
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [playbackState, setPlaybackState] = useState<AudioPlaybackState>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onEndedRef = useRef<(() => void) | null>(null)

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    return audioRef.current
  }, [])

  const play = useCallback(
    (src: string) => {
      console.log('[AudioPlayer] play called', { src })
      const audio = getAudio()
      audio.src = src
      audio.play().catch((e) => {
        console.log('[AudioPlayer] play() rejected', { error: e })
        setPlaybackState('idle')
      })
      setPlaybackState('playing')
    },
    [getAudio],
  )

  const stop = useCallback(() => {
    console.log('[AudioPlayer] stop called')
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setPlaybackState('idle')
    setCurrentTime(0)
    setDuration(0)
  }, [])

  useEffect(() => {
    const audio = getAudio()

    const handleEnded = () => {
      setPlaybackState('idle')
      onEndedRef.current?.()
    }

    const handleError = () => {
      setPlaybackState('idle')
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      // loadedmetadata が発火しないケースに備え、timeupdate でも duration を同期
      const dur = audio.duration
      if (isFinite(dur) && dur > 0) {
        console.log('[AudioPlayer] timeupdate', { currentTime: audio.currentTime, duration: dur })
        setDuration(dur)
      }
    }

    const handleDurationChange = () => {
      const dur = audio.duration
      console.log('[AudioPlayer] durationchange', { rawDuration: dur, isFinite: isFinite(dur) })
      if (isFinite(dur) && dur > 0) {
        setDuration(dur)
      }
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleDurationChange)
    audio.addEventListener('durationchange', handleDurationChange)

    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleDurationChange)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.pause()
      audio.src = ''
    }
  }, [getAudio])

  return {
    playbackState,
    play,
    stop,
    isPlaying: playbackState === 'playing',
    onEndedRef,
    currentTime,
    duration,
  }
}
