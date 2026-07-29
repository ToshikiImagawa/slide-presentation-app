import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCircularProgress } from '../useCircularProgress'

describe('useCircularProgress', () => {
  it('autoSlideshow=false で visible=false, progress=0 を返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: false,
        hasVoice: true,
        audioPlaybackState: 'playing',
        audioDuration: 30,
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('none')
  })

  it('autoSlideshow=true, hasVoice=true, 再生中で音声プログレスを返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioPlaybackState: 'playing',
        audioDuration: 30,
        timerDuration: null,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('audio')
    expect(result.current.visible).toBe(true)
    expect(result.current.animationDuration).toBe(30)
    expect(result.current.paused).toBe(false)
  })

  it('autoSlideshow=true, hasVoice=false, timerDuration 有効でタイマープログレスを返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: false,
        audioPlaybackState: 'idle',
        audioDuration: 0,
        timerDuration: 20,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('timer')
    expect(result.current.visible).toBe(true)
    expect(result.current.animationDuration).toBe(20)
  })

  it('audioDuration が 0 でゼロ除算なし、progress=0', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioPlaybackState: 'playing',
        audioDuration: 0,
        timerDuration: null,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('audio')
    expect(result.current.visible).toBe(true)
  })

  it('timerDuration=null, hasVoice=false で visible=false', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: false,
        audioPlaybackState: 'idle',
        audioDuration: 0,
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.source).toBe('none')
  })

  it('timerDuration が 0 で visible=false', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: false,
        audioPlaybackState: 'idle',
        audioDuration: 0,
        timerDuration: 0,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.source).toBe('none')
  })

  it('音声モードで animationDuration が audioDuration と一致する', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioPlaybackState: 'playing',
        audioDuration: 30,
        timerDuration: null,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.animationDuration).toBe(30)
  })

  it('hasVoice=true だが audioPlaybackState=idle（未再生）の場合は visible=false', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioPlaybackState: 'idle',
        audioDuration: 0,
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.source).toBe('none')
  })

  it('audioPlaybackState=paused で visible=true のまま paused=true を返す（一時停止中も表示を維持する）', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioPlaybackState: 'paused',
        audioDuration: 30,
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(true)
    expect(result.current.source).toBe('audio')
    expect(result.current.animationDuration).toBe(30)
    expect(result.current.paused).toBe(true)
  })
})
