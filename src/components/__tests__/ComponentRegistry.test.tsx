import { describe, expect, it, beforeEach } from 'vitest'
import { registerComponent, registerDefaultComponent, resolveComponent, getRegisteredComponents, clearRegistry } from '../ComponentRegistry'

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
})
