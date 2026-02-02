import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCircularProgress } from '../useCircularProgress'

describe('useCircularProgress', () => {
  it('autoSlideshow=false で visible=false, progress=0 を返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: false,
        hasVoice: true,
        audioProgress: { currentTime: 15, duration: 30 },
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('none')
  })

  it('autoSlideshow=true, hasVoice=true, audioProgress 有効で音声プログレスを返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioProgress: { currentTime: 15, duration: 30 },
        timerDuration: null,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('audio')
    expect(result.current.visible).toBe(true)
    expect(result.current.animationDuration).toBe(30)
  })

  it('autoSlideshow=true, hasVoice=false, timerDuration 有効でタイマープログレスを返す', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: false,
        audioProgress: null,
        timerDuration: 20,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.source).toBe('timer')
    expect(result.current.visible).toBe(true)
    expect(result.current.animationDuration).toBe(20)
  })

  it('audioProgress の duration が 0 でゼロ除算なし、progress=0', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioProgress: { currentTime: 0, duration: 0 },
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
        audioProgress: null,
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
        audioProgress: null,
        timerDuration: 0,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.source).toBe('none')
  })

  it('音声モードで animationDuration が duration と一致する', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioProgress: { currentTime: 35, duration: 30 },
        timerDuration: null,
      }),
    )

    expect(result.current.progress).toBe(0)
    expect(result.current.animationDuration).toBe(30)
  })

  it('hasVoice=true だが audioProgress=null の場合は visible=false', () => {
    const { result } = renderHook(() =>
      useCircularProgress({
        autoSlideshow: true,
        hasVoice: true,
        audioProgress: null,
        timerDuration: null,
      }),
    )

    expect(result.current.visible).toBe(false)
    expect(result.current.source).toBe('none')
  })
})
