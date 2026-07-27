import { describe, it, expect } from 'vitest'
import { renderHook, act, screen, waitFor } from '@testing-library/react'
import { ToastProvider, useToast } from '../toastProvider'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

describe('useToast', () => {
  it('Provider の外で使うとエラーになる', () => {
    expect(() => renderHook(() => useToast())).toThrow('useToast must be used within a ToastProvider')
  })

  it('showToast を呼ぶとメッセージが表示される', async () => {
    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('テストメッセージ')
    })

    await waitFor(() => expect(screen.getByText('テストメッセージ')).toBeTruthy())
  })
})
