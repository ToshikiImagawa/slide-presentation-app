import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { registerComponent, registerDefaultComponent, resolveComponent, getRegisteredComponents, clearRegistry, unregisterOwner, hasComponent, componentFillsContentArea } from '../ComponentRegistry'

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

  it('hasComponentはデフォルト登録済みコンポーネントに対してtrueを返す', () => {
    registerDefaultComponent('TestA', MockComponentA)
    expect(hasComponent('TestA')).toBe(true)
  })

  it('hasComponentはカスタム登録済みコンポーネントに対してtrueを返す', () => {
    registerComponent('TestB', MockComponentB)
    expect(hasComponent('TestB')).toBe(true)
  })

  it('hasComponentは未登録名に対してfalseを返す', () => {
    expect(hasComponent('NonExistent')).toBe(false)
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

  // #256: 本文領域を埋めるかどうかは描画側（SlideRenderer）が name から知り得ないため、登録側が traits で宣言する
  describe('traits（componentFillsContentArea）', () => {
    it('fillsContentArea を宣言した登録に対して true を返す', () => {
      registerDefaultComponent('Filling', MockComponentA, { fillsContentArea: true })
      expect(componentFillsContentArea('Filling')).toBe(true)
    })

    it('宣言のない登録・未登録名に対して false を返す', () => {
      registerDefaultComponent('Plain', MockComponentA)
      expect(componentFillsContentArea('Plain')).toBe(false)
      expect(componentFillsContentArea('NonExistent')).toBe(false)
    })

    it('カスタム登録で上書きすると traits も上書き側が使われる（コンポーネント本体と解決順が揃う）', () => {
      registerDefaultComponent('Shadowed', MockComponentA, { fillsContentArea: true })
      registerComponent('Shadowed', CustomOverride)
      expect(componentFillsContentArea('Shadowed')).toBe(false)
    })

    it('アドオン（owner 付きのカスタム登録）も traits を宣言できる', () => {
      registerComponent('FromAddon', MockComponentB, 'ownerA', { fillsContentArea: true })
      expect(componentFillsContentArea('FromAddon')).toBe(true)
    })
  })
})
