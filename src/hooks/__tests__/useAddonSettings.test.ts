import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAddonSettings } from '../useAddonSettings'
import { clearAddonTrustDecision, getAddonTrustMap, getRecentSlidePackages, isEmbeddedAddonsDisabled, resetAddonTrust, setAddonTrustDecision, setEmbeddedAddonsDisabled } from '../../localSlideLoader'

vi.mock('../../localSlideLoader', () => ({
  isEmbeddedAddonsDisabled: vi.fn(),
  setEmbeddedAddonsDisabled: vi.fn(),
  getRecentSlidePackages: vi.fn(),
  getAddonTrustMap: vi.fn(),
  resetAddonTrust: vi.fn(),
  setAddonTrustDecision: vi.fn(),
  clearAddonTrustDecision: vi.fn(),
}))

const mockIsEmbeddedAddonsDisabled = vi.mocked(isEmbeddedAddonsDisabled)
const mockSetEmbeddedAddonsDisabled = vi.mocked(setEmbeddedAddonsDisabled)
const mockGetRecentSlidePackages = vi.mocked(getRecentSlidePackages)
const mockGetAddonTrustMap = vi.mocked(getAddonTrustMap)
const mockResetAddonTrust = vi.mocked(resetAddonTrust)
const mockSetAddonTrustDecision = vi.mocked(setAddonTrustDecision)
const mockClearAddonTrustDecision = vi.mocked(clearAddonTrustDecision)

describe('useAddonSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEmbeddedAddonsDisabled.mockResolvedValue(false)
    mockGetRecentSlidePackages.mockResolvedValue([])
    mockGetAddonTrustMap.mockResolvedValue({})
    mockSetEmbeddedAddonsDisabled.mockResolvedValue(undefined)
    mockResetAddonTrust.mockResolvedValue(undefined)
    mockSetAddonTrustDecision.mockResolvedValue(undefined)
    mockClearAddonTrustDecision.mockResolvedValue(undefined)
  })

  it('一律無効化フラグを永続ストアから復元する', async () => {
    mockIsEmbeddedAddonsDisabled.mockResolvedValue(true)

    const { result } = renderHook(() => useAddonSettings(false))

    await waitFor(() => expect(result.current.addonsDisabled).toBe(true))
  })

  it('settingsOpen が false の間は信頼一覧を取得しない', () => {
    renderHook(() => useAddonSettings(false))

    expect(mockGetAddonTrustMap).not.toHaveBeenCalled()
  })

  it('settingsOpen で trustMap を基点に一覧を作り、title は recent から補完する', async () => {
    mockGetAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed', '/gone.spkg': 'denied' })
    mockGetRecentSlidePackages.mockResolvedValue([
      { path: '/a.spkg', title: 'デッキA', openedAt: 1 },
      // trustMap に無いパッケージは一覧に出ない
      { path: '/b.spkg', title: 'デッキB', openedAt: 2 },
    ])

    const { result } = renderHook(() => useAddonSettings(true))

    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(2))
    expect(result.current.addonTrustList).toEqual([
      { path: '/a.spkg', title: 'デッキA', decision: 'allowed' },
      // recent から追い出されたパッケージは path をそのまま title に使う
      { path: '/gone.spkg', title: '/gone.spkg', decision: 'denied' },
    ])
  })

  it('一律無効化トグルが state と永続ストアの両方を更新する', async () => {
    const { result } = renderHook(() => useAddonSettings(false))
    // 永続ストアからの復元（非同期）を先に流し切ってからトグルする
    await waitFor(() => expect(mockIsEmbeddedAddonsDisabled).toHaveBeenCalled())

    act(() => {
      result.current.handleToggleAddonsDisabled(true)
    })

    expect(result.current.addonsDisabled).toBe(true)
    expect(mockSetEmbeddedAddonsDisabled).toHaveBeenCalledWith(true)
  })

  it('個別許可は楽観更新され、保存成功時はそのまま維持される', async () => {
    mockGetAddonTrustMap.mockResolvedValue({ '/a.spkg': 'denied' })
    mockGetRecentSlidePackages.mockResolvedValue([{ path: '/a.spkg', title: 'デッキA', openedAt: 1 }])

    const { result } = renderHook(() => useAddonSettings(true))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleSetAddonTrust('/a.spkg', 'allowed')
    })

    expect(result.current.addonTrustList[0].decision).toBe('allowed')
    expect(mockSetAddonTrustDecision).toHaveBeenCalledWith('/a.spkg', 'allowed')
  })

  it('decision が undefined なら未設定へ戻す（trustMap からキー削除）', async () => {
    mockGetAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed' })
    mockGetRecentSlidePackages.mockResolvedValue([{ path: '/a.spkg', title: 'デッキA', openedAt: 1 }])

    const { result } = renderHook(() => useAddonSettings(true))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleSetAddonTrust('/a.spkg', undefined)
    })

    expect(result.current.addonTrustList[0].decision).toBeUndefined()
    expect(mockClearAddonTrustDecision).toHaveBeenCalledWith('/a.spkg')
    expect(mockSetAddonTrustDecision).not.toHaveBeenCalled()
  })

  it('個別許可の保存に失敗したら実態へロールバックする', async () => {
    mockGetAddonTrustMap.mockResolvedValue({ '/a.spkg': 'denied' })
    mockGetRecentSlidePackages.mockResolvedValue([{ path: '/a.spkg', title: 'デッキA', openedAt: 1 }])
    mockSetAddonTrustDecision.mockRejectedValue(new Error('保存失敗'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAddonSettings(true))
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
    mockGetAddonTrustMap.mockResolvedValue({ '/a.spkg': 'allowed' })
    mockGetRecentSlidePackages.mockResolvedValue([{ path: '/a.spkg', title: 'デッキA', openedAt: 1 }])
    mockResetAddonTrust.mockRejectedValue(new Error('リセット失敗'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useAddonSettings(true))
    await waitFor(() => expect(result.current.addonTrustList).toHaveLength(1))

    act(() => {
      result.current.handleResetAddonTrust()
    })

    await waitFor(() => expect(result.current.addonTrustList[0].decision).toBe('allowed'))
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
