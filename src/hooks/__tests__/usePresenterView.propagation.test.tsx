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
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import { ToastProvider } from '../../toast'

const EVENT_NAME = 'presenter-view'
const slides = [{ id: 's1', layout: 'center' }] as unknown as SlideData[]

/** usePresenterView は useTranslation/useToast を使うため、テストでも Provider でラップする */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[]}>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  )
}

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
    renderHook(() => usePresenterView({ slides, currentIndex: 0, addonOwner: '/pkgA', addonScripts: ['asset://localhost/pkgA/addons/a.js'] }), { wrapper })
    const calls = addonsChangedCalls()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe(EVENT_NAME)
    expect(calls[0][1]).toEqual({ type: 'addonsChanged', payload: { owner: '/pkgA', scripts: ['asset://localhost/pkgA/addons/a.js'] } })
  })

  it('presenterViewReady 受信時に addonsChanged を slideChanged より先に emit する', async () => {
    renderHook(() => usePresenterView({ slides, currentIndex: 0, addonOwner: '/pkgA', addonScripts: ['asset://localhost/pkgA/addons/a.js'] }), { wrapper })

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

/** emit 呼び出しのうち themeChanged のものを抽出 */
function themeChangedCalls() {
  return h.emit.mock.calls.filter((c) => (c[1] as { type?: string })?.type === 'themeChanged')
}

describe('usePresenterView テーマ伝搬', () => {
  beforeEach(() => {
    h.emit.mockClear()
    h.listeners.length = 0
  })

  it('マウント時に themeChanged を emit する（既に開いている発表者ビュー向け）', () => {
    renderHook(() => usePresenterView({ slides, currentIndex: 0, themeColors: 'theme/colors.json', theme: { colors: { primary: '#000000' } } }), { wrapper })
    const calls = themeChangedCalls()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][0]).toBe(EVENT_NAME)
    expect(calls[0][1]).toEqual({ type: 'themeChanged', payload: { themeColors: 'theme/colors.json', theme: { colors: { primary: '#000000' } } } })
  })

  it('presenterViewReady 受信時に themeChanged を slideChanged より先に emit する', async () => {
    renderHook(() => usePresenterView({ slides, currentIndex: 0, themeColors: 'theme/colors.json' }), { wrapper })

    // listen 登録を待つ
    await waitFor(() => expect(h.listeners.length).toBe(1))
    h.emit.mockClear()

    // 発表者ビューからの ready を模擬
    act(() => {
      h.listeners[0]({ payload: { type: 'presenterViewReady' } })
    })

    const types = h.emit.mock.calls.map((c) => (c[1] as { type?: string })?.type)
    const themeIdx = types.indexOf('themeChanged')
    const slideIdx = types.indexOf('slideChanged')
    expect(themeIdx).toBeGreaterThanOrEqual(0)
    expect(slideIdx).toBeGreaterThanOrEqual(0)
    // テーマを先に伝搬する（描画前適用のため）
    expect(themeIdx).toBeLessThan(slideIdx)
  })
})

/** emit 呼び出しのうち slideChanged のものを抽出 */
function slideChangedCalls() {
  return h.emit.mock.calls.filter((c) => (c[1] as { type?: string })?.type === 'slideChanged')
}

describe('usePresenterView 初期表示位置', () => {
  beforeEach(() => {
    h.emit.mockClear()
    h.listeners.length = 0
  })

  it('presenterViewReady 受信時、本編の現在位置（currentIndex）を初期表示として送信する', async () => {
    // 本編側でスライドを進めてから発表者ビューを開く状況を模擬
    renderHook(() => usePresenterView({ slides, currentIndex: 3 }), { wrapper })

    await waitFor(() => expect(h.listeners.length).toBe(1))
    h.emit.mockClear()

    act(() => {
      h.listeners[0]({ payload: { type: 'presenterViewReady' } })
    })

    const calls = slideChangedCalls()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0][1]).toEqual({ type: 'slideChanged', payload: { currentIndex: 3, slides } })
  })
})
