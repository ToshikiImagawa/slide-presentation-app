import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// 永続ストア（plugin-store）越しの読み書きをモックし、楽観更新とロールバックを観測する
const h = vi.hoisted(() => ({
  isEmbeddedAddonsDisabled: vi.fn(),
  setEmbeddedAddonsDisabled: vi.fn(),
  getAddonTrustMap: vi.fn(),
  resetAddonTrust: vi.fn(),
  setAddonTrustDecision: vi.fn(),
  clearAddonTrustDecision: vi.fn(),
}))

vi.mock('../../localSlideLoader', () => h)

import { useAddonSettings } from '../useAddonSettings'
import type { RecentSlidePackageEntry } from '../../localSlideLoader'

const recentPackages: RecentSlidePackageEntry[] = [{ path: '/a.spkg', title: 'デッキA', openedAt: 1 }]

describe('useAddonSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.isEmbeddedAddonsDisabled.mockResolvedValue(false)
    h.getAddonTrustMap.mockResolvedValue({})
    h.setEmbeddedAddonsDisabled.mockResolvedValue(undefined)
    h.resetAddonTrust.mockResolvedValue(undefined)
    h.setAddonTrustDecision.mockResolvedValue(undefined)
    h.clearAddonTrustDecision.mockResolvedValue(undefined)
  })

  it('一律無効化フラグを永続ストアから復元する', async () => {
    h.isEmbeddedAddonsDisabled.mockResolvedValue(true)

    const { result } = renderHook(() => useAddonSettings({ active: false, recentPackages: [] }))

    await waitFor(() => expect(result.current.addonsDisabled).toBe(true))
  })

  it('active が false の間は信頼一覧を取得しない', () => {
    renderHook(() => useAddonSettings({ active: false, recentPackages: [] }))

    expect(h.getAddonTrustMap).not.toHaveBeenCalled()
  })

  it('active で trustMap を基点に一覧を作り、title は最近リストから補完する', async () => {
    h.getAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed', '/gone.spkg': 'denied' })

    // trustMap に無い /b.spkg は一覧に出ない
    const recent: RecentSlidePackageEntry[] = [...recentPackages, { path: '/b.spkg', title: 'デッキB', openedAt: 2 }]
    const { result } = renderHook(() => useAddonSettings({ active: true, recentPackages: recent }))

    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(2))
    expect(result.current.addonTrustList).toEqual([
      { path: '/a.spkg', title: 'デッキA', decision: 'allowed' },
      // 最近リストから追い出されたパッケージは path をそのまま title に使う
      { path: '/gone.spkg', title: '/gone.spkg', decision: 'denied' },
    ])
  })

  it('一律無効化トグルが state と永続ストアの両方を更新する', async () => {
    const { result } = renderHook(() => useAddonSettings({ active: false, recentPackages: [] }))
    // 永続ストアからの復元（非同期）を先に流し切ってからトグルする
    await waitFor(() => expect(h.isEmbeddedAddonsDisabled).toHaveBeenCalled())

    act(() => {
      result.current.handleToggleAddonsDisabled(true)
    })

    expect(result.current.addonsDisabled).toBe(true)
    expect(h.setEmbeddedAddonsDisabled).toHaveBeenCalledWith(true)
  })

  it('個別許可は楽観更新され、保存成功時はそのまま維持される', async () => {
    h.getAddonTrustMap.mockResolvedValue({ '/a.spkg': 'denied' })

    const { result } = renderHook(() => useAddonSettings({ active: true, recentPackages }))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleSetAddonTrust('/a.spkg', 'allowed')
    })

    expect(result.current.addonTrustList[0].decision).toBe('allowed')
    expect(h.setAddonTrustDecision).toHaveBeenCalledWith('/a.spkg', 'allowed')
  })

  it('decision が undefined なら未設定へ戻す（trustMap からキー削除）', async () => {
    h.getAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed' })

    const { result } = renderHook(() => useAddonSettings({ active: true, recentPackages }))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleSetAddonTrust('/a.spkg', undefined)
    })

    expect(result.current.addonTrustList[0].decision).toBeUndefined()
    expect(h.clearAddonTrustDecision).toHaveBeenCalledWith('/a.spkg')
    expect(h.setAddonTrustDecision).not.toHaveBeenCalled()
  })

  it('個別許可の保存に失敗したら実態へロールバックする', async () => {
    h.getAddonTrustMap.mockResolvedValue({ '/a.spkg': 'denied' })
    h.setAddonTrustDecision.mockRejectedValue(new Error('保存失敗'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAddonSettings({ active: true, recentPackages }))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleSetAddonTrust('/a.spkg', 'allowed')
    })

    // 楽観更新の後、store の実態（denied）へ戻る
    await waitFor(() => expect(result.current.addonTrustList[0].decision).toBe('denied'))
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('許可履歴のリセットは一覧を未設定へ戻し、失敗時は実態へロールバックする', async () => {
    h.getAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed' })
    h.resetAddonTrust.mockRejectedValue(new Error('リセット失敗'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAddonSettings({ active: true, recentPackages }))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleResetAddonTrust()
    })

    await waitFor(() => expect(result.current.addonTrustList[0].decision).toBe('allowed'))
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
