import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollSpeed, DEFAULT_SCROLL_SPEED } from '../useScrollSpeed'

const STORAGE_KEY = 'slide-app-scroll-speed'

describe('useScrollSpeed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存値がなければデフォルト値（20秒）を返す', () => {
    const { result } = renderHook(() => useScrollSpeed())

    const [speed] = result.current
    expect(speed).toBe(20)
    expect(speed).toBe(DEFAULT_SCROLL_SPEED)
  })

  it('localStorage の保存値を復元する', () => {
    localStorage.setItem(STORAGE_KEY, '45')

    const { result } = renderHook(() => useScrollSpeed())

    const [speed] = result.current
    expect(speed).toBe(45)
  })

  // 数値でない / 0 / 負値 / 空文字
  it.each(['abc', '0', '-5', ''])('不正な保存値（%j）は無視してデフォルト値を返す', (stored) => {
    localStorage.setItem(STORAGE_KEY, stored)

    const { result } = renderHook(() => useScrollSpeed())

    const [speed] = result.current
    expect(speed).toBe(DEFAULT_SCROLL_SPEED)
  })

  it('setter が state と localStorage の両方を更新する', () => {
    const { result } = renderHook(() => useScrollSpeed())

    const [, setSpeed] = result.current
    act(() => setSpeed(30))

    const [speed] = result.current
    expect(speed).toBe(30)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('30')
  })
})
