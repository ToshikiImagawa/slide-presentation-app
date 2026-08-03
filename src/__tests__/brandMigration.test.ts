import { describe, it, expect } from 'vitest'
import { delegateThemeColors, listOverriddenThemeColorKeys, planThemeColorsDelegation } from '../brandMigration'
import type { PresentationData } from '../data'

describe('listOverriddenThemeColorKeys', () => {
  it('値が指定されているキーのみを返す', () => {
    expect(listOverriddenThemeColorKeys({ primary: '#112233', accent: '', background: undefined, text: '#000000' })).toEqual(['primary', 'text'])
  })

  it('空オブジェクトなら空配列を返す', () => {
    expect(listOverriddenThemeColorKeys({})).toEqual([])
  })
})

describe('planThemeColorsDelegation', () => {
  it('brand と同一色（表記違い含む）は redundantKeys、異なる色は overrideKeys に分類する', () => {
    const plan = planThemeColorsDelegation({ primary: '#112233', accent: '#ABCDEF', background: '#ffffff' }, { primary: '#112233', accent: '#abcdef' })

    expect(plan.redundantKeys.sort()).toEqual(['accent', 'primary'])
    expect(plan.overrideKeys).toEqual(['background'])
  })

  it('brand 側に対応キーが無い場合は意図的な上書きとして扱う（overrideKeys）', () => {
    const plan = planThemeColorsDelegation({ primary: '#112233' }, {})
    expect(plan.overrideKeys).toEqual(['primary'])
    expect(plan.redundantKeys).toEqual([])
  })

  it('色として解釈できない値は異なる色として安全側に倒す（overrideKeys）', () => {
    const plan = planThemeColorsDelegation({ primary: 'not-a-color' }, { primary: 'not-a-color' })
    expect(plan.overrideKeys).toEqual(['primary'])
    expect(plan.redundantKeys).toEqual([])
  })
})

describe('delegateThemeColors', () => {
  const baseData: PresentationData = { meta: { title: 'T', themeColors: '/theme/theme-colors.json' }, slides: [] }

  it('meta.themeColors を撤去し、brand と異なるキーだけ theme.colors へ移す', () => {
    const result = delegateThemeColors(baseData, { primary: '#112233', accent: '#ff0000' }, { primary: '#112233' })

    expect(result.meta.themeColors).toBeUndefined()
    expect(result.theme?.colors).toEqual({ accent: '#ff0000' })
  })

  it('既存の theme.colors（デッキ固有の上書き）を優先して保持する', () => {
    const data: PresentationData = { ...baseData, theme: { colors: { accent: '#0000ff' } } }
    const result = delegateThemeColors(data, { primary: '#112233', accent: '#ff0000' }, {})

    expect(result.theme?.colors).toEqual({ primary: '#112233', accent: '#0000ff' })
  })

  it('meta の他フィールド（title・brandTheme等）を保持する', () => {
    const data: PresentationData = { meta: { title: 'T', brandTheme: '/theme/brand.json', themeColors: '/theme/theme-colors.json' }, slides: [] }
    const result = delegateThemeColors(data, { primary: '#112233' }, { primary: '#112233' })

    expect(result.meta.title).toBe('T')
    expect(result.meta.brandTheme).toBe('/theme/brand.json')
    expect(result.meta.themeColors).toBeUndefined()
  })
})
