import { describe, expect, it } from 'vitest'
import { computeGridLayout } from '../gridLayout'

describe('computeGridLayout', () => {
  it('空配列には空配列を返す', () => {
    expect(computeGridLayout([])).toEqual([])
  })

  it('row/col省略時は決定的な正方形グリッドへ自動配置する（4件→2x2）', () => {
    const rects = computeGridLayout([{}, {}, {}, {}])
    expect(rects).toHaveLength(4)
    // 1行目(row0): 0,1 が同じy / 2行目(row1): 2,3 が同じy
    expect(rects[0].y).toBe(rects[1].y)
    expect(rects[2].y).toBe(rects[3].y)
    expect(rects[0].y).not.toBe(rects[2].y)
    // 1列目(col0): 0,2 が同じx / 2列目(col1): 1,3 が同じx
    expect(rects[0].x).toBe(rects[2].x)
    expect(rects[1].x).toBe(rects[3].x)
  })

  it('row/colを明示指定した場合はそこに配置する', () => {
    const rects = computeGridLayout([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ])
    expect(rects[0].y).toBe(rects[1].y)
    expect(rects[0].x).toBe(rects[2].x)
    expect(rects[1].y).not.toBe(rects[2].y)
  })

  it('すべての矩形が[0,1]の範囲内に収まる', () => {
    const rects = computeGridLayout(Array.from({ length: 7 }, () => ({})))
    rects.forEach((rect) => {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w).toBeLessThanOrEqual(1)
      expect(rect.y + rect.h).toBeLessThanOrEqual(1)
    })
  })

  it('同じ入力からは常に同じ結果になる（決定的）', () => {
    const input = [{ row: 1, col: 0 }, {}, { col: 2 }]
    expect(computeGridLayout(input)).toEqual(computeGridLayout(input))
  })

  it('rowが負値・非整数でも例外にならず描画を続ける（#276）', () => {
    const rects = computeGridLayout([{ row: -1, col: 0 }, { row: 0.5, col: 1 }, {}])
    expect(rects).toHaveLength(3)
    rects.forEach((rect) => {
      expect(Number.isFinite(rect.x)).toBe(true)
      expect(Number.isFinite(rect.y)).toBe(true)
    })
  })

  it('colが負値でも例外にならず描画を続ける（#276）', () => {
    const rects = computeGridLayout([
      { row: 0, col: -1 },
      { row: 1, col: 0 },
    ])
    expect(rects).toHaveLength(2)
  })
})
