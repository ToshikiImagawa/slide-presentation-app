import { describe, it, expect } from 'vitest'
import { getChartSpecIssues } from '../validateChart'

describe('getChartSpecIssues', () => {
  it('妥当な指定では issue を返さない', () => {
    expect(getChartSpecIssues({ type: 'bar', categories: ['A', 'B'], series: [{ values: [1, 2] }] })).toEqual([])
  })

  it('未知の type を検出する', () => {
    const issues = getChartSpecIssues({ type: 'radar' as never })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('radar')
  })

  it('categories と series が両方空だと検出する', () => {
    expect(getChartSpecIssues({ type: 'bar' })).toHaveLength(1)
  })

  it('series はあるが値が空で categories も無いと検出する', () => {
    expect(getChartSpecIssues({ type: 'bar', series: [{ name: '今期' }] })).toHaveLength(1)
  })

  it('categories だけあれば series の値が空でも検出しない（項目名だけの軸として成立する）', () => {
    expect(getChartSpecIssues({ type: 'bar', categories: ['A', 'B'], series: [{ name: '今期' }] })).toEqual([])
  })

  it('kpi は value か trend のいずれかがあれば検出しない', () => {
    expect(getChartSpecIssues({ type: 'kpi', value: 100 })).toEqual([])
    expect(getChartSpecIssues({ type: 'kpi', trend: [1, 2] })).toEqual([])
  })

  it('kpi で value も trend も無ければ検出する', () => {
    expect(getChartSpecIssues({ type: 'kpi', label: 'MAU' })).toHaveLength(1)
  })

  it('series/categories が配列でなくても落ちない', () => {
    expect(getChartSpecIssues({ type: 'bar', series: 'broken' as never, categories: 'broken' as never })).toHaveLength(1)
  })
})
