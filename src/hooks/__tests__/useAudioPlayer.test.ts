import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayer } from '../useAudioPlayer'

let audioEventHandlers: Record<string, (() => void)[]> = {}
let mockAudioInstance: {
  src: string
  currentTime: number
  duration: number
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  audioEventHandlers = {}

  mockAudioInstance = {
    src: '',
    currentTime: 0,
    duration: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (!audioEventHandlers[event]) audioEventHandlers[event] = []
      audioEventHandlers[event].push(handler)
    }),
    removeEventListener: vi.fn(),
  }

  vi.stubGlobal('Audio', function MockAudio(this: typeof mockAudioInstance) {
    Object.assign(this, mockAudioInstance)
    // addEventListener/removeEventListener を正しく動作させるため、thisに直接バインド
    this.addEventListener = mockAudioInstance.addEventListener
    this.removeEventListener = mockAudioInstance.removeEventListener
    this.play = mockAudioInstance.play
    this.pause = mockAudioInstance.pause
    // audioRef.current に this が代入されるので mockAudioInstance を更新
    mockAudioInstance = this
  })
})

function fireEvent(event: string) {
  const handlers = audioEventHandlers[event]
  if (handlers) {
    for (const handler of handlers) {
      handler()
    }
  }
}

describe('useAudioPlayer', () => {
  it('初期状態は idle', () => {
    const { result } = renderHook(() => useAudioPlayer())
    expect(result.current.playbackState).toBe('idle')
    expect(result.current.isPlaying).toBe(false)
  })

  it('play() で再生状態になる', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    expect(mockAudioInstance.src).toBe('/audio/test.mp3')
    expect(mockAudioInstance.play).toHaveBeenCalled()
    expect(result.current.playbackState).toBe('playing')
    expect(result.current.isPlaying).toBe(true)
  })

  it('stop() で idle 状態に戻る', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      result.current.stop()
    })

    expect(mockAudioInstance.pause).toHaveBeenCalled()
    expect(result.current.playbackState).toBe('idle')
    expect(result.current.isPlaying).toBe(false)
  })

  it('ended イベントで idle 状態に戻る', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    expect(result.current.playbackState).toBe('playing')

    act(() => {
      fireEvent('ended')
    })

    expect(result.current.playbackState).toBe('idle')
  })

  it('ended イベントで onEndedRef コールバックが呼ばれる', () => {
    const onEnded = vi.fn()
    const { result } = renderHook(() => useAudioPlayer())

    result.current.onEndedRef.current = onEnded

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      fireEvent('ended')
    })

    expect(onEnded).toHaveBeenCalled()
  })

  it('error イベントで idle 状態に戻る', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      fireEvent('error')
    })

    expect(result.current.playbackState).toBe('idle')
  })

  it('play() の Promise rejection で idle 状態に戻る', async () => {
    const { result } = renderHook(() => useAudioPlayer())

    // useEffect 内で getAudio が呼ばれた後、play mock を差し替え
    mockAudioInstance.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'))

    await act(async () => {
      result.current.play('/audio/test.mp3')
    })

    expect(result.current.playbackState).toBe('idle')
  })

  it('アンマウント時にクリーンアップが実行される', () => {
    const { unmount } = renderHook(() => useAudioPlayer())

    unmount()

    expect(mockAudioInstance.pause).toHaveBeenCalled()
    expect(mockAudioInstance.src).toBe('')
  })

  it('初期状態で currentTime=0, duration=0', () => {
    const { result } = renderHook(() => useAudioPlayer())
    expect(result.current.currentTime).toBe(0)
    expect(result.current.duration).toBe(0)
  })

  it('timeupdate イベントで currentTime が更新される', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      mockAudioInstance.currentTime = 15.5
      fireEvent('timeupdate')
    })

    expect(result.current.currentTime).toBe(15.5)
  })

  it('loadedmetadata イベントで duration が更新される', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      mockAudioInstance.duration = 60
      fireEvent('loadedmetadata')
    })

    expect(result.current.duration).toBe(60)
  })

  it('stop() 後に currentTime=0, duration=0 にリセットされる', () => {
    const { result } = renderHook(() => useAudioPlayer())

    act(() => {
      result.current.play('/audio/test.mp3')
    })

    act(() => {
      mockAudioInstance.currentTime = 10
      mockAudioInstance.duration = 30
      fireEvent('timeupdate')
      fireEvent('loadedmetadata')
    })

    expect(result.current.currentTime).toBe(10)
    expect(result.current.duration).toBe(30)

    act(() => {
      result.current.stop()
    })

    expect(result.current.currentTime).toBe(0)
    expect(result.current.duration).toBe(0)
  })
})
