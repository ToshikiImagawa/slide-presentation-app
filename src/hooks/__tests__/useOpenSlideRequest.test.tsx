import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Tauri の core / event をモックする。invoke の呼び出しと listen へ渡されたコールバックを観測する。
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: [] as Array<() => void>,
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: h.listen }))

import { useOpenSlideRequest } from '../useOpenSlideRequest'

const COMMAND = 'take_pending_open_paths'

describe('useOpenSlideRequest', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.listeners.length = 0
    h.listen.mockReset().mockImplementation(async (_name: string, cb: () => void) => {
      h.listeners.push(cb)
      return () => {}
    })
  })

  it('マウント時に take_pending_open_paths を pull し、起動時の要求をコールバックへ渡す', async () => {
    h.invoke.mockResolvedValue(['/decks/a.spkg'])
    const onRequest = vi.fn()

    renderHook(() => useOpenSlideRequest(onRequest))

    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('/decks/a.spkg'))
    expect(h.invoke).toHaveBeenCalledWith(COMMAND)
  })

  it('要求が無ければ（空配列）コールバックを呼ばない', async () => {
    h.invoke.mockResolvedValue([])
    const onRequest = vi.fn()

    renderHook(() => useOpenSlideRequest(onRequest))

    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith(COMMAND))
    expect(onRequest).not.toHaveBeenCalled()
  })

  it('複数件（macOS の一括オープン）では最後の1件を採用する（単一ウィンドウ）', async () => {
    h.invoke.mockResolvedValue(['/decks/a.spkg', '/decks/b.spkg', '/decks/c.spkg'])
    const onRequest = vi.fn()

    renderHook(() => useOpenSlideRequest(onRequest))

    await waitFor(() => expect(onRequest).toHaveBeenCalledTimes(1))
    expect(onRequest).toHaveBeenCalledWith('/decks/c.spkg')
  })

  it('pull より先に listen を張る（両者の隙間で要求を落とさない）', async () => {
    h.invoke.mockResolvedValue([])
    renderHook(() => useOpenSlideRequest(vi.fn()))

    await waitFor(() => expect(h.invoke).toHaveBeenCalled())
    // listen 登録が先に完了していること
    expect(h.listeners.length).toBe(1)
  })

  it('open-slide-package イベント受信時も take_pending_open_paths からパスを取り出して渡す', async () => {
    h.invoke.mockResolvedValue([])
    const onRequest = vi.fn()
    renderHook(() => useOpenSlideRequest(onRequest))

    await waitFor(() => expect(h.listeners.length).toBe(1))
    expect(h.listen).toHaveBeenCalledWith('open-slide-package', expect.any(Function))

    // 起動後に届いた要求（イベントは payload なしのシグナル）
    h.invoke.mockResolvedValue(['/decks/later.spkg'])
    await act(async () => {
      h.listeners[0]()
    })

    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('/decks/later.spkg'))
  })

  it('コールバック更新後にイベントを受けても最新のコールバックが呼ばれる（stale closure 回避）', async () => {
    h.invoke.mockResolvedValue([])
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }: { cb: (path: string) => void }) => useOpenSlideRequest(cb), { initialProps: { cb: first as (path: string) => void } })

    await waitFor(() => expect(h.listeners.length).toBe(1))
    rerender({ cb: second })

    h.invoke.mockResolvedValue(['/decks/x.spkg'])
    await act(async () => {
      h.listeners[0]()
    })

    await waitFor(() => expect(second).toHaveBeenCalledWith('/decks/x.spkg'))
    expect(first).not.toHaveBeenCalled()
  })

  it('invoke が reject しても握りつぶす（非 Tauri 環境の E2E / スクリーンショットを壊さない）', async () => {
    h.invoke.mockRejectedValue(new Error('Command take_pending_open_paths not found'))
    const onRequest = vi.fn()

    expect(() => renderHook(() => useOpenSlideRequest(onRequest))).not.toThrow()

    await waitFor(() => expect(h.invoke).toHaveBeenCalled())
    expect(onRequest).not.toHaveBeenCalled()
  })

  it('listen が reject しても握りつぶし、起動時の pull は実行する', async () => {
    h.listen.mockRejectedValue(new Error('window.__TAURI_INTERNALS__ is undefined'))
    h.invoke.mockResolvedValue(['/decks/a.spkg'])
    const onRequest = vi.fn()

    expect(() => renderHook(() => useOpenSlideRequest(onRequest))).not.toThrow()

    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('/decks/a.spkg'))
  })

  it('アンマウント時に unlisten する', async () => {
    h.invoke.mockResolvedValue([])
    const unlisten = vi.fn()
    h.listen.mockImplementation(async (_name: string, cb: () => void) => {
      h.listeners.push(cb)
      return unlisten
    })

    const { unmount } = renderHook(() => useOpenSlideRequest(vi.fn()))
    await waitFor(() => expect(h.listeners.length).toBe(1))

    unmount()
    expect(unlisten).toHaveBeenCalled()
  })
})
