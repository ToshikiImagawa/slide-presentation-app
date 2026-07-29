import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import { ToastProvider } from '../../toast'

const h = vi.hoisted(() => ({ checkForUpdate: vi.fn(), installUpdate: vi.fn() }))

vi.mock('../../update', () => ({ checkForUpdate: h.checkForUpdate, installUpdate: h.installUpdate }))

import { useUpdateCheck } from '../useUpdateCheck'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: { updater: { installFailed: 'Failed to install the update' } },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[enUS]} defaultLocale="en-US">
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  )
}

describe('useUpdateCheck', () => {
  beforeEach(() => {
    h.checkForUpdate.mockReset()
    h.installUpdate.mockReset()
  })

  it('更新が見つかったら updateInfo を設定し、ダイアログを開く', async () => {
    const info = { version: '2.1.0', currentVersion: '2.0.0', body: 'notes' }
    h.checkForUpdate.mockResolvedValue(info)

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.updateInfo).toEqual(info))
    expect(result.current.updateDialogOpen).toBe(true)
  })

  it('更新がなければダイアログを開かない', async () => {
    h.checkForUpdate.mockResolvedValue(null)

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })

    await waitFor(() => expect(h.checkForUpdate).toHaveBeenCalled())
    expect(result.current.updateInfo).toBeNull()
    expect(result.current.updateDialogOpen).toBe(false)
  })

  it('確認に失敗しても無言で諦める（例外を投げない）', async () => {
    h.checkForUpdate.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })

    await waitFor(() => expect(h.checkForUpdate).toHaveBeenCalled())
    expect(result.current.updateInfo).toBeNull()
  })

  it('screenKey が変わるとダイアログを閉じる', async () => {
    h.checkForUpdate.mockResolvedValue({ version: '2.1.0', currentVersion: '2.0.0', body: null })

    const { result, rerender } = renderHook(({ screenKey }) => useUpdateCheck(screenKey), {
      wrapper: Wrapper,
      initialProps: { screenKey: 'home' },
    })

    await waitFor(() => expect(result.current.updateDialogOpen).toBe(true))

    rerender({ screenKey: 'presentation' })

    await waitFor(() => expect(result.current.updateDialogOpen).toBe(false))
  })

  it('closeUpdateDialog を呼ぶとダイアログを閉じる', async () => {
    h.checkForUpdate.mockResolvedValue({ version: '2.1.0', currentVersion: '2.0.0', body: null })

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.updateDialogOpen).toBe(true))

    act(() => result.current.closeUpdateDialog())

    expect(result.current.updateDialogOpen).toBe(false)
  })

  it('handleInstallUpdate は installing を true にしてから installUpdate を呼ぶ', async () => {
    h.checkForUpdate.mockResolvedValue(null)
    h.installUpdate.mockResolvedValue(undefined)

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })
    await waitFor(() => expect(h.checkForUpdate).toHaveBeenCalled())

    act(() => result.current.handleInstallUpdate())

    expect(result.current.installingUpdate).toBe(true)
    expect(h.installUpdate).toHaveBeenCalledTimes(1)
  })

  it('installUpdate が失敗したら installing を false に戻す', async () => {
    h.checkForUpdate.mockResolvedValue(null)
    h.installUpdate.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useUpdateCheck('home'), { wrapper: Wrapper })
    await waitFor(() => expect(h.checkForUpdate).toHaveBeenCalled())

    act(() => result.current.handleInstallUpdate())
    expect(result.current.installingUpdate).toBe(true)

    await waitFor(() => expect(result.current.installingUpdate).toBe(false))
  })
})
