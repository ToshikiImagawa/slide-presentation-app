import { describe, it, expect } from 'vitest'
import { arcPath, buildAxisScale, defaultValueLabels, formatValue, pickLabelIndices, pieSlices, polarPoint, ratioOf, seriesColor } from '../chartScale'

describe('buildAxisScale', () => {
  it('0を含む1/2/5刻みの範囲へ切り上げる', () => {
    const scale = buildAxisScale([42, 51, 58, 67])
    expect(scale.min).toBe(0)
    expect(scale.max).toBe(80)
    expect(scale.ticks).toEqual([0, 20, 40, 60, 80])
    expect(scale.zeroRatio).toBe(0)
  })

  it('min/maxを明示すればそのまま使う', () => {
    const scale = buildAxisScale([42, 51], 0, 100)
    expect(scale.min).toBe(0)
    expect(scale.max).toBe(100)
    expect(scale.ticks).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('負の値を含む場合は0の位置を基準線として返す', () => {
    const scale = buildAxisScale([-40, 20])
    expect(scale.min).toBeLessThan(0)
    expect(scale.max).toBeGreaterThan(0)
    expect(scale.zeroRatio).toBeCloseTo((0 - scale.min) / (scale.max - scale.min))
    expect(scale.zeroRatio).toBeGreaterThan(0)
    expect(scale.zeroRatio).toBeLessThan(1)
  })

  it('全項目が0でも幅を持ち、比率が発散しない', () => {
    const scale = buildAxisScale([0, 0, 0])
    expect(scale.max).toBeGreaterThan(scale.min)
    expect(ratioOf(0, scale)).toBe(0)
  })

  it('小数の刻みでも浮動小数の誤差が目盛りに出ない', () => {
    const scale = buildAxisScale([0.4, 0.9])
    expect(scale.ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('非数値は範囲の算出から除く', () => {
    const scale = buildAxisScale([10, Number.NaN, 20])
    expect(scale.max).toBe(20)
  })
})

describe('ratioOf', () => {
  it('minを0・maxを1に写す', () => {
    const scale = buildAxisScale([0, 100], 0, 100)
    expect(ratioOf(0, scale)).toBe(0)
    expect(ratioOf(50, scale)).toBe(0.5)
    expect(ratioOf(100, scale)).toBe(1)
  })

  it('範囲外は0〜1に丸め、非数値は基準線に置く', () => {
    const scale = buildAxisScale([0, 100], 0, 100)
    expect(ratioOf(150, scale)).toBe(1)
    expect(ratioOf(-50, scale)).toBe(0)
    expect(ratioOf(Number.NaN, scale)).toBe(scale.zeroRatio)
  })
})

describe('pickLabelIndices', () => {
  it('上限以下なら全件表示する', () => {
    expect(pickLabelIndices(4, 12)).toEqual(new Set([0, 1, 2, 3]))
  })

  it('上限を超えると一定間隔に間引き、先頭と末尾は必ず含める', () => {
    const picked = pickLabelIndices(24, 12)
    expect(picked.size).toBeLessThanOrEqual(12)
    expect(picked.has(0)).toBe(true)
    expect(picked.has(23)).toBe(true)
    // 間隔は ceil(23/11) = 3
    expect([...picked].sort((a, b) => a - b)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 23])
  })

  it('項目が無ければ空', () => {
    expect(pickLabelIndices(0, 12)).toEqual(new Set())
  })
})

describe('defaultValueLabels', () => {
  it('描画点が少ないときだけ既定で表示する', () => {
    expect(defaultValueLabels('bar', 4, 2)).toBe(true)
    expect(defaultValueLabels('bar', 24, 2)).toBe(false)
    expect(defaultValueLabels('hbar', 6, 1)).toBe(true)
  })

  it('折れ線は単一系列で点が少ないときだけ既定で表示する', () => {
    expect(defaultValueLabels('line', 6, 1)).toBe(true)
    expect(defaultValueLabels('line', 6, 2)).toBe(false)
    expect(defaultValueLabels('line', 20, 1)).toBe(false)
  })
})

describe('seriesColor', () => {
  it('明示が無ければ系列順にseries1〜series6を巡回する', () => {
    expect(seriesColor(0)).toBe('var(--theme-series-1)')
    expect(seriesColor(5)).toBe('var(--theme-series-6)')
    expect(seriesColor(6)).toBe('var(--theme-series-1)')
  })

  it('明示したトークン名を優先する', () => {
    expect(seriesColor(0, 'warning')).toBe('var(--theme-warning)')
  })

  it('未知のトークン名はprimaryへフォールバックする', () => {
    expect(seriesColor(0, 'unknown')).toBe('var(--theme-primary)')
  })
})

describe('formatValue', () => {
  it('桁区切りと単位を付ける', () => {
    expect(formatValue(128400, '件')).toBe('128,400件')
    expect(formatValue(42, '%')).toBe('42%')
  })

  it('小数は桁数に応じて丸める', () => {
    expect(formatValue(1.234)).toBe('1.23')
    expect(formatValue(12.345)).toBe('12.3')
    expect(formatValue(123.456)).toBe('123')
  })

  it('非数値は空文字にする', () => {
    expect(formatValue(Number.NaN)).toBe('')
  })
})

describe('pieSlices', () => {
  it('12時起点・時計回りで構成比を割り当てる', () => {
    const slices = pieSlices([25, 25, 50])
    expect(slices.map((slice) => slice.share)).toEqual([0.25, 0.25, 0.5])
    expect(slices[0].startAngle).toBe(-90)
    expect(slices[0].endAngle).toBe(0)
    expect(slices[2].endAngle).toBe(270)
  })

  it('0以下・非数値は面積を持たない項目として除きつつ、元の位置を保つ', () => {
    const slices = pieSlices([10, 0, 30])
    expect(slices.map((slice) => slice.index)).toEqual([0, 2])
  })

  it('合計が0なら描画対象なし', () => {
    expect(pieSlices([0, 0])).toEqual([])
  })
})

describe('arcPath / polarPoint', () => {
  it('0度は右、-90度は上を指す', () => {
    expect(polarPoint(50, 50, 10, 0)).toEqual({ x: 60, y: 50 })
    expect(polarPoint(50, 50, 10, -90)).toEqual({ x: 50, y: 40 })
  })

  it('180度を超える扇形はlarge-arc-flagを立てる', () => {
    expect(arcPath(50, 50, 40, -90, 0)).toContain('A 40 40 0 0 1')
    expect(arcPath(50, 50, 40, -90, 180)).toContain('A 40 40 0 1 1')
  })
})
