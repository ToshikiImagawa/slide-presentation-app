import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSlideshow, DEFAULT_SCROLL_SPEED } from '../useAutoSlideshow'
import type { UseAudioPlayerReturn } from '../useAudioPlayer'
import type { SlideData } from '../../data'

function makeSlide(id: string, voice?: string): SlideData {
  return {
    id,
    layout: 'center',
    content: { title: id },
    meta: voice ? { notes: { voice } } : undefined,
  }
}

function createMockAudioPlayer(): UseAudioPlayerReturn {
  return {
    playbackState: 'idle',
    play: vi.fn() as unknown as (src: string) => void,
    stop: vi.fn() as unknown as () => void,
    isPlaying: false,
    hasError: false,
    onEndedRef: { current: null },
    currentTime: 0,
    duration: 0,
  }
}

describe('useAutoSlideshow', () => {
  let mockPlayer: UseAudioPlayerReturn
  let mockGoToNext: () => void

  beforeEach(() => {
    mockPlayer = createMockAudioPlayer()
    mockGoToNext = vi.fn() as unknown as () => void
  })

  it('初期状態は autoPlay/autoSlideshow ともに false', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3')]
    const { result } = renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    expect(result.current.autoPlay).toBe(false)
    expect(result.current.autoSlideshow).toBe(false)
  })

  it('autoPlay ON + voice ありスライドで play() が呼ばれる', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3')]
    const { result } = renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    act(() => {
      result.current.setAutoPlay(true)
    })

    expect(mockPlayer.play).toHaveBeenCalledWith('/audio/s1.mp3')
  })

  it('autoPlay ON + voice なしスライドで play() が呼ばれない', () => {
    const slides = [makeSlide('s1')]
    const { result } = renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    act(() => {
      result.current.setAutoPlay(true)
    })

    expect(mockPlayer.play).not.toHaveBeenCalled()
  })

  it('autoPlay OFF では play() が呼ばれない', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3')]
    renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    expect(mockPlayer.play).not.toHaveBeenCalled()
  })

  it('autoSlideshow ON + 音声終了時に goToNext が呼ばれる', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3'), makeSlide('s2')]
    const { result } = renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    act(() => {
      result.current.setAutoSlideshow(true)
    })

    // onEndedRef に設定されたコールバックを呼び出す
    act(() => {
      mockPlayer.onEndedRef.current?.()
    })

    expect(mockGoToNext).toHaveBeenCalled()
  })

  it('autoSlideshow ON + 最終スライドでは goToNext が呼ばれない', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3')]
    const { result } = renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    act(() => {
      result.current.setAutoSlideshow(true)
    })

    act(() => {
      mockPlayer.onEndedRef.current?.()
    })

    expect(mockGoToNext).not.toHaveBeenCalled()
  })

  it('autoSlideshow OFF では音声終了時に goToNext が呼ばれない', () => {
    const slides = [makeSlide('s1', '/audio/s1.mp3'), makeSlide('s2')]
    renderHook(() =>
      useAutoSlideshow({
        slides,
        currentIndex: 0,
        audioPlayer: mockPlayer,
        goToNext: mockGoToNext,
      }),
    )

    act(() => {
      mockPlayer.onEndedRef.current?.()
    })

    expect(mockGoToNext).not.toHaveBeenCalled()
  })

  describe('タイマーベース自動スクロール', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('scrollSpeed のデフォルト値が 20 である', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
        }),
      )

      expect(result.current.scrollSpeed).toBe(DEFAULT_SCROLL_SPEED)
      expect(result.current.scrollSpeed).toBe(20)
    })

    it('initialScrollSpeed を指定するとその値が使われる', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 10,
        }),
      )

      expect(result.current.scrollSpeed).toBe(10)
    })

    it('voice 未定義時に scrollSpeed 秒後に goToNext が呼ばれる', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      expect(mockGoToNext).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(5000)
      })

      expect(mockGoToNext).toHaveBeenCalledTimes(1)
    })

    it('voice 定義済み時にタイマーが動作しない', () => {
      const slides = [makeSlide('s1', '/audio/s1.mp3'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(mockGoToNext).not.toHaveBeenCalled()
    })

    it('最終スライドでタイマーが動作しない', () => {
      const slides = [makeSlide('s1')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(mockGoToNext).not.toHaveBeenCalled()
    })

    it('autoSlideshow OFF 時にタイマーが動作しない', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(mockGoToNext).not.toHaveBeenCalled()
    })

    it('currentIndex 変更時にタイマーがリセットされる', () => {
      const slides = [makeSlide('s1'), makeSlide('s2'), makeSlide('s3')]
      let currentIndex = 0
      const { result, rerender } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      // 3秒経過
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(mockGoToNext).not.toHaveBeenCalled()

      // スライド変更（タイマーリセット）
      currentIndex = 1
      rerender()

      // さらに3秒（元のタイマーなら5秒で発火するはず）
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(mockGoToNext).not.toHaveBeenCalled()

      // さらに2秒（リセット後5秒で発火）
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(mockGoToNext).toHaveBeenCalledTimes(1)
    })

    it('voice 未定義時に timerDuration が設定される', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      expect(result.current.timerDuration).toBeNull()

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      expect(result.current.timerDuration).toBe(5)
    })

    it('voice 定義済み時に timerDuration が null', () => {
      const slides = [makeSlide('s1', '/audio/s1.mp3'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      expect(result.current.timerDuration).toBeNull()
    })

    it('autoSlideshow OFF 時に timerDuration が null', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 5,
        }),
      )

      expect(result.current.timerDuration).toBeNull()
    })

    it('scrollSpeed 変更時にタイマーが再設定される', () => {
      const slides = [makeSlide('s1'), makeSlide('s2')]
      const { result } = renderHook(() =>
        useAutoSlideshow({
          slides,
          currentIndex: 0,
          audioPlayer: mockPlayer,
          goToNext: mockGoToNext,
          initialScrollSpeed: 10,
        }),
      )

      act(() => {
        result.current.setAutoSlideshow(true)
      })

      // 5秒経過
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(mockGoToNext).not.toHaveBeenCalled()

      // scrollSpeed を 3 秒に変更（タイマー再設定）
      act(() => {
        result.current.setScrollSpeed(3)
      })

      // 3秒後に発火
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(mockGoToNext).toHaveBeenCalledTimes(1)
    })
  })
})
