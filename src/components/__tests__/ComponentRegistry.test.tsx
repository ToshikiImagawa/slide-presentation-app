import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { registerComponent, registerDefaultComponent, resolveComponent, getRegisteredComponents, clearRegistry, unregisterOwner } from '../ComponentRegistry'

function MockComponentA() {
  return <div>ComponentA</div>
}

function MockComponentB() {
  return <div>ComponentB</div>
}

function CustomOverride() {
  return <div>CustomOverride</div>
}

describe('ComponentRegistry', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('デフォルトコンポーネントを登録・解決できる', () => {
    registerDefaultComponent('TestA', MockComponentA)
    expect(resolveComponent('TestA')).toBe(MockComponentA)
  })

  it('カスタムコンポーネントを登録・解決できる', () => {
    registerComponent('TestB', MockComponentB)
    expect(resolveComponent('TestB')).toBe(MockComponentB)
  })

  it('カスタムコンポーネントがデフォルトを上書きする', () => {
    registerDefaultComponent('Test', MockComponentA)
    registerComponent('Test', CustomOverride)
    expect(resolveComponent('Test')).toBe(CustomOverride)
  })

  it('未登録名でフォールバックコンポーネントが返される', () => {
    const Fallback = resolveComponent('NonExistent')
    expect(Fallback).toBeDefined()
    expect(Fallback).not.toBe(MockComponentA)
    expect(Fallback).not.toBe(MockComponentB)
  })

  it('登録済みコンポーネント名一覧を取得できる', () => {
    registerDefaultComponent('Alpha', MockComponentA)
    registerDefaultComponent('Beta', MockComponentB)
    registerComponent('Gamma', CustomOverride)
    const names = getRegisteredComponents()
    expect(names).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('デフォルトとカスタムの両方に同名がある場合、一覧には1つだけ含まれる', () => {
    registerDefaultComponent('Shared', MockComponentA)
    registerComponent('Shared', CustomOverride)
    const names = getRegisteredComponents()
    expect(names).toEqual(['Shared'])
  })

  it('clearRegistryで全登録がクリアされる', () => {
    registerDefaultComponent('A', MockComponentA)
    registerComponent('B', MockComponentB)
    clearRegistry()
    expect(getRegisteredComponents()).toEqual([])
  })

  describe('owner スコープ', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('owner 省略時は従来どおり登録・解決できる（後方互換）', () => {
      registerComponent('NoOwner', MockComponentA)
      expect(resolveComponent('NoOwner')).toBe(MockComponentA)
    })

    it('unregisterOwner は指定 owner のカスタム登録のみ削除する', () => {
      registerComponent('FromA', MockComponentA, 'ownerA')
      registerComponent('FromB', MockComponentB, 'ownerB')
      unregisterOwner('ownerA')
      expect(resolveComponent('FromA')).not.toBe(MockComponentA)
      expect(resolveComponent('FromB')).toBe(MockComponentB)
    })

    it('unregisterOwner はデフォルト登録を温存する', () => {
      registerDefaultComponent('Kept', MockComponentA)
      registerComponent('Kept', CustomOverride, 'ownerA')
      unregisterOwner('ownerA')
      // custom が消え、default が解決される
      expect(resolveComponent('Kept')).toBe(MockComponentA)
    })

    it('owner を指定しない登録は unregisterOwner の対象外', () => {
      registerComponent('Global', MockComponentB)
      unregisterOwner('ownerA')
      expect(resolveComponent('Global')).toBe(MockComponentB)
    })

    it('同名で異なる owner による上書き時に警告する', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      registerComponent('Dup', MockComponentA, 'ownerA')
      registerComponent('Dup', MockComponentB, 'ownerB')
      expect(warn).toHaveBeenCalledOnce()
      expect(resolveComponent('Dup')).toBe(MockComponentB)
    })

    it('同一 owner による同名再登録では警告しない', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      registerComponent('Same', MockComponentA, 'ownerA')
      registerComponent('Same', MockComponentB, 'ownerA')
      expect(warn).not.toHaveBeenCalled()
    })
  })
})
