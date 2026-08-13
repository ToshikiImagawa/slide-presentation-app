import { describe, expect, it } from 'vitest'
import { clampAxisIndex, getAxisSlot, packAxis } from '../packAxis'

describe('packAxis', () => {
  it('countが0以下なら空配列を返す', () => {
    expect(packAxis(0, 0, 1, 0.05)).toEqual([])
    expect(packAxis(-1, 0, 1, 0.05)).toEqual([])
  })

  it('1個の場合はextent全体を1枠として返す', () => {
    expect(packAxis(1, 0, 1, 0.05)).toEqual([{ offset: 0, size: 1 }])
  })

  it('gap込みでextentを等分する', () => {
    // (1 - 0.1*2) / 3 = 0.26666...
    const slots = packAxis(3, 0, 1, 0.1)
    expect(slots).toHaveLength(3)
    slots.forEach((slot) => expect(slot.size).toBeCloseTo(0.2667, 3))
    expect(slots[0].offset).toBeCloseTo(0, 5)
    expect(slots[1].offset).toBeCloseTo(0.2667 + 0.1, 3)
    expect(slots[2].offset).toBeCloseTo((0.2667 + 0.1) * 2, 3)
  })

  it('startとextentのオフセットを反映する', () => {
    const slots = packAxis(2, 0.1, 0.5, 0.02)
    // size = (0.5 - 0.02) / 2 = 0.24
    expect(slots[0]).toEqual({ offset: 0.1, size: 0.24 })
    expect(slots[1].offset).toBeCloseTo(0.1 + 0.24 + 0.02, 5)
  })

  it('同じ入力からは常に同じ結果になる（決定的）', () => {
    expect(packAxis(4, 0, 1, 0.03)).toEqual(packAxis(4, 0, 1, 0.03))
  })
})

describe('getAxisSlot', () => {
  const slots = packAxis(4, 0, 1, 0.03)

  it('範囲内の整数indexはそのままそのスロットを返す', () => {
    expect(getAxisSlot(slots, 2)).toEqual(slots[2])
  })

  it('負のindexは先頭スロットへクランプする（#276）', () => {
    expect(getAxisSlot(slots, -1)).toEqual(slots[0])
  })

  it('過大なindexは末尾スロットへクランプする（#276）', () => {
    expect(getAxisSlot(slots, 100)).toEqual(slots[3])
  })

  it('非整数のindexは最も近い整数へ丸める（#276）', () => {
    expect(getAxisSlot(slots, 0.5)).toEqual(slots[1])
    expect(getAxisSlot(slots, 1.4)).toEqual(slots[1])
  })

  it('空配列には例外を出さず既定スロットを返す（#276）', () => {
    expect(getAxisSlot([], 0)).toEqual({ offset: 0, size: 0 })
  })
})

// #279: 範囲外警告（applyTheme.ts の getDiagramWarnings）が getAxisSlot と同じクランプ結果を得るための
// 単一の真実源。count は常に整数である前提（computeGridDimensions・computeGanttColCount が
// packAxis の Array.from({ length: count }) と同じ整数化を導出側の1箇所で保証する）
describe('clampAxisIndex', () => {
  it('範囲内の整数indexはそのまま返す', () => {
    expect(clampAxisIndex(4, 2)).toBe(2)
  })

  it('負のindexは0へクランプする', () => {
    expect(clampAxisIndex(4, -1)).toBe(0)
  })

  it('過大なindexはcount-1へクランプする', () => {
    expect(clampAxisIndex(4, 100)).toBe(3)
  })

  it('非整数のindexは最も近い整数へ丸める', () => {
    expect(clampAxisIndex(4, 0.5)).toBe(1)
    expect(clampAxisIndex(4, 1.4)).toBe(1)
  })

  it('countが0以下なら0を返す', () => {
    expect(clampAxisIndex(0, 5)).toBe(0)
    expect(clampAxisIndex(-1, 5)).toBe(0)
  })
})
