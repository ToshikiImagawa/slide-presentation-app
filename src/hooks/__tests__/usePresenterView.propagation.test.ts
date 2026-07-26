import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Tauri の event / webviewWindow をモックする。emit の呼び出しと listen へ渡されたコールバックを観測する。
const h = vi.hoisted(() => ({
  emit: vi.fn(async (..._args: unknown[]) => {}),
  listeners: [] as Array<(event: { payload: unknown }) => void>,
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: h.emit,
  listen: vi.fn(async (_name: string, cb: (event: { payload: unknown }) => void) => {
    h.listeners.push(cb)
    return () => {}
  }),
}))
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    static getByLabel = vi.fn(async () => null)
  },
}))

import { usePresenterView } from '../usePresenterView'
import type { SlideData } from '../../data'

const EVENT_NAME = 'presenter-view'
const slides = [{ id: 's1', layout: 'center' }] as unknown as SlideData[]

/** emit 呼び出しのうち addonsChanged のものを抽出 */
function addonsChangedCalls() {
  return h.emit.mock.calls.filter((c) => (c[1] as { type?: string })?.type === 'addonsChanged')
}

describe('usePresenterView アドオン伝搬', () => {
  beforeEach(() => {
    h.emit.mockClear()
    h.listeners.length = 0
  })

  it('マウント時に addonsChanged を emit する（既に開いている発表者ビュー向け）', () => {
    renderHook(() => usePresenterView({ slides, addonOwner: '/pkgA', addonScripts: ['asset://localhost/pkgA/addons/a.js'] }))
    const calls = addonsChangedCalls()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe(EVENT_NAME)
    expect(calls[0][1]).toEqual({ type: 'addonsChanged', payload: { owner: '/pkgA', scripts: ['asset://localhost/pkgA/addons/a.js'] } })
  })

  it('presenterViewReady 受信時に addonsChanged を slideChanged より先に emit する', async () => {
    renderHook(() => usePresenterView({ slides, addonOwner: '/pkgA', addonScripts: ['asset://localhost/pkgA/addons/a.js'] }))

    // listen 登録を待つ
    await waitFor(() => expect(h.listeners.length).toBe(1))
    h.emit.mockClear()

    // 発表者ビューからの ready を模擬
    act(() => {
      h.listeners[0]({ payload: { type: 'presenterViewReady' } })
    })

    const types = h.emit.mock.calls.map((c) => (c[1] as { type?: string })?.type)
    const addonsIdx = types.indexOf('addonsChanged')
    const slideIdx = types.indexOf('slideChanged')
    expect(addonsIdx).toBeGreaterThanOrEqual(0)
    expect(slideIdx).toBeGreaterThanOrEqual(0)
    // アドオンを先に伝搬する（描画前ロードのため）
    expect(addonsIdx).toBeLessThan(slideIdx)
  })
})
