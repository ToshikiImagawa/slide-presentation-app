import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollSpeed, DEFAULT_SCROLL_SPEED } from '../useScrollSpeed'

const STORAGE_KEY = 'slide-app-scroll-speed'

describe('useScrollSpeed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('保存値がなければデフォルト値を返す', () => {
    const { result } = renderHook(() => useScrollSpeed())

    expect(result.current[0]).toBe(DEFAULT_SCROLL_SPEED)
    expect(DEFAULT_SCROLL_SPEED).toBe(20)
  })

  it('localStorage の保存値を復元する', () => {
    localStorage.setItem(STORAGE_KEY, '45')

    const { result } = renderHook(() => useScrollSpeed())

    expect(result.current[0]).toBe(45)
  })

  it.each([
    ['数値でない', 'abc'],
    ['0', '0'],
    ['負値', '-5'],
    ['空文字', ''],
  ])('不正な保存値（%s）は無視してデフォルト値を返す', (_label, stored) => {
    localStorage.setItem(STORAGE_KEY, stored)

    const { result } = renderHook(() => useScrollSpeed())

    expect(result.current[0]).toBe(DEFAULT_SCROLL_SPEED)
  })

  it('setter が state と localStorage の両方を更新する', () => {
    const { result } = renderHook(() => useScrollSpeed())

    act(() => {
      result.current[1](30)
    })

    expect(result.current[0]).toBe(30)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('30')
  })
})
