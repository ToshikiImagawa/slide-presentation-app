import { Blob as NodeBlob } from 'node:buffer'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import { ToastProvider } from '../../toast'
import { useRecording } from '../useRecording'

const h = vi.hoisted(() => ({
  save: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: h.save }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: h.writeFile }))

class MockMediaStreamTrack {
  kind: string
  stop = vi.fn()
  private listeners: Record<string, Array<() => void>> = {}
  constructor(kind: string) {
    this.kind = kind
  }
  addEventListener(event: string, handler: () => void) {
    ;(this.listeners[event] ??= []).push(handler)
  }
  removeEventListener() {}
  dispatch(event: string) {
    this.listeners[event]?.forEach((handler) => handler())
  }
}

class MockMediaStream {
  private tracks: MockMediaStreamTrack[]
  constructor(tracks: MockMediaStreamTrack[] = []) {
    this.tracks = tracks
  }
  addTrack(track: MockMediaStreamTrack) {
    this.tracks.push(track)
  }
  getTracks() {
    return this.tracks
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video')
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  // WebKit(macOS)相当を模す既定: video/webm系は非対応、video/mp4のみ対応
  static supportedTypes: string[] = ['video/mp4']
  static isTypeSupported(type: string) {
    return MockMediaRecorder.supportedTypes.includes(type)
  }
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(
    public stream: MockMediaStream,
    public options?: { mimeType?: string },
  ) {
    MockMediaRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

class MockAudioContext {
  destination = {}
  close = vi.fn()
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn() }))
  createMediaStreamDestination = vi.fn(() => ({
    stream: new MockMediaStream([new MockMediaStreamTrack('audio')]),
  }))
}

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    recording: {
      permissionError: '画面共有を開始できませんでした',
      saveError: '録画ファイルの保存に失敗しました',
    },
  },
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  )
}

function makeAudioElementRef() {
  return { current: {} as HTMLAudioElement }
}

let mockGetDisplayMedia: ReturnType<typeof vi.fn>
let lastScreenStream: MockMediaStream

beforeEach(() => {
  vi.clearAllMocks()
  MockMediaRecorder.instances = []
  MockMediaRecorder.supportedTypes = ['video/mp4']

  mockGetDisplayMedia = vi.fn().mockImplementation(() => {
    lastScreenStream = new MockMediaStream([new MockMediaStreamTrack('video')])
    return Promise.resolve(lastScreenStream)
  })

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getDisplayMedia: mockGetDisplayMedia },
    configurable: true,
  })

  vi.stubGlobal('MediaStream', MockMediaStream)
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  vi.stubGlobal('AudioContext', MockAudioContext)
  // jsdom の Blob は arrayBuffer() を実装していないため、Node の Blob に差し替える
  vi.stubGlobal('Blob', NodeBlob)

  h.save.mockResolvedValue('/tmp/recording.webm')
  h.writeFile.mockResolvedValue(undefined)
})

describe('useRecording', () => {
  it('対応環境では初期状態が idle', () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })
    expect(result.current.state).toBe('idle')
  })

  it('非対応環境（getDisplayMedia が存在しない）では初期状態が error になる', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })

    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })
    expect(result.current.state).toBe('error')

    act(() => {
      result.current.start()
    })
    expect(mockGetDisplayMedia).not.toHaveBeenCalled()
    expect(result.current.state).toBe('error')
  })

  it('start() で共有選択後 recording になる', async () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    expect(mockGetDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false })
    expect(result.current.state).toBe('recording')
  })

  it('共有選択がキャンセルされた場合 state は idle のまま', async () => {
    mockGetDisplayMedia.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    expect(result.current.state).toBe('idle')
  })

  it('stop() で録画を停止し、保存先選択後にファイルを書き出して idle に戻る', async () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['chunk']) })
    })

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalled()
    expect(h.writeFile).toHaveBeenCalledWith('/tmp/recording.webm', expect.any(Uint8Array))
  })

  it('WebKit相当（video/webm系が非対応）の環境では mp4 拡張子・MIMEタイプで保存する', async () => {
    MockMediaRecorder.supportedTypes = ['video/mp4']
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    expect(recorder.options?.mimeType).toBe('video/mp4')

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'recording.mp4', filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] }))
  })

  it('mp4とwebmの両方に対応する環境でも mp4 を優先して選択する（OS標準プレイヤーでの再生互換性を優先）', async () => {
    MockMediaRecorder.supportedTypes = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    expect(recorder.options?.mimeType).toBe('video/mp4')

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'recording.mp4', filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] }))
  })

  it('mp4に対応しないWebView（video/webmのみ対応）では webm 拡張子・MIMEタイプにフォールバックする', async () => {
    MockMediaRecorder.supportedTypes = ['video/webm;codecs=vp9,opus', 'video/webm']
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    expect(recorder.options?.mimeType).toBe('video/webm;codecs=vp9,opus')

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'recording.webm', filters: [{ name: 'WebM Video', extensions: ['webm'] }] }))
  })

  it('保存先選択がキャンセルされた場合、記録済みデータを破棄して idle に戻る', async () => {
    h.save.mockResolvedValue(null)
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.writeFile).not.toHaveBeenCalled()
  })

  it('保存に失敗した場合 error になる', async () => {
    h.writeFile.mockRejectedValue(new Error('write failed'))
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    await act(async () => {
      result.current.stop()
    })

    await waitFor(() => expect(result.current.state).toBe('error'))
  })

  it('OS側の共有停止操作（トラックの ended）で録画が安全に終了し保存フローへ進む', async () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const videoTrack = lastScreenStream.getVideoTracks()[0]
    await act(async () => {
      videoTrack.dispatch('ended')
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalled()
  })

  it('録画中にエラーが発生し記録済みデータがある場合は保存フローへ進む', async () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['chunk']) })
    })

    await act(async () => {
      recorder.onerror?.()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(h.save).toHaveBeenCalled()
  })

  it('録画中にエラーが発生し記録済みデータがない場合は idle に戻る', async () => {
    const { result } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    act(() => {
      recorder.onerror?.()
    })

    expect(result.current.state).toBe('idle')
    expect(h.save).not.toHaveBeenCalled()
  })

  it('アンマウント時に MediaRecorder/画面共有トラック/AudioContext を解放する', async () => {
    const audioElementRef = makeAudioElementRef()
    const { result, unmount } = renderHook(() => useRecording({ audioElementRef }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    const recorder = MockMediaRecorder.instances[0]
    const stopSpy = vi.spyOn(recorder, 'stop')
    const videoTrack = lastScreenStream.getVideoTracks()[0]

    unmount()

    expect(stopSpy).toHaveBeenCalled()
    expect(videoTrack.stop).toHaveBeenCalled()
  })

  it('録画中にアンマウントしても保存フロー（保存先選択ダイアログ）は走らない', async () => {
    const { result, unmount } = renderHook(() => useRecording({ audioElementRef: makeAudioElementRef() }), { wrapper })

    await act(async () => {
      result.current.start()
    })

    unmount()

    expect(h.save).not.toHaveBeenCalled()
  })
})
