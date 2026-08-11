import { describe, expect, it } from 'vitest'
import { computeTreeLayout, resolveTree } from '../treeLayout'

describe('resolveTree', () => {
  it('parent省略のノードをルートとして扱う', () => {
    const { roots, childrenOf } = resolveTree([{ id: 'a' }, { id: 'b', parent: 'a' }])
    expect(roots).toEqual(['a'])
    expect(childrenOf.get('a')).toEqual(['b'])
  })

  it('複数ルートを許容する', () => {
    const { roots } = resolveTree([{ id: 'a' }, { id: 'b' }, { id: 'c', parent: 'a' }])
    expect(roots).toEqual(['a', 'b'])
  })

  it('存在しないparentを参照するノードはルート扱いにする（クラッシュしない）', () => {
    const { roots } = resolveTree([{ id: 'a', parent: 'missing' }])
    expect(roots).toEqual(['a'])
  })

  it('循環参照はルート扱いにして無限再帰を避ける', () => {
    const { roots } = resolveTree([
      { id: 'a', parent: 'b' },
      { id: 'b', parent: 'a' },
    ])
    // aを辿るとb→a…と循環するのでルート扱いになる
    expect(roots).toContain('a')
  })
})

describe('computeTreeLayout', () => {
  it('空配列には空のMapを返す', () => {
    expect(computeTreeLayout([]).size).toBe(0)
  })

  it('親は深さ0（y座標が最小）、子はより下に配置される', () => {
    const rects = computeTreeLayout([{ id: 'root' }, { id: 'child1', parent: 'root' }, { id: 'child2', parent: 'root' }])
    const root = rects.get('root')!
    const child1 = rects.get('child1')!
    const child2 = rects.get('child2')!
    expect(root.y).toBeLessThan(child1.y)
    expect(child1.y).toBe(child2.y)
  })

  it('子同士の中心x位置が異なる（水平方向に分散配置される）', () => {
    const rects = computeTreeLayout([{ id: 'root' }, { id: 'child1', parent: 'root' }, { id: 'child2', parent: 'root' }])
    const child1 = rects.get('child1')!
    const child2 = rects.get('child2')!
    expect(child1.x).not.toBe(child2.x)
  })

  it('親ノードの中心xは子の中心xの平均に近い（部分木の中央に配置される）', () => {
    const rects = computeTreeLayout([{ id: 'root' }, { id: 'a', parent: 'root' }, { id: 'b', parent: 'root' }])
    const root = rects.get('root')!
    const a = rects.get('a')!
    const b = rects.get('b')!
    const rootCenter = root.x + root.w / 2
    const avgChildCenter = (a.x + a.w / 2 + (b.x + b.w / 2)) / 2
    expect(rootCenter).toBeCloseTo(avgChildCenter, 3)
  })

  it('すべての矩形が[0,1]の範囲内に収まる', () => {
    const rects = computeTreeLayout([{ id: 'root' }, { id: 'a', parent: 'root' }, { id: 'b', parent: 'root' }, { id: 'c', parent: 'a' }])
    for (const rect of rects.values()) {
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w).toBeLessThanOrEqual(1)
      expect(rect.y + rect.h).toBeLessThanOrEqual(1)
    }
  })

  it('同じ入力からは常に同じ結果になる（決定的）', () => {
    const input = [{ id: 'root' }, { id: 'a', parent: 'root' }, { id: 'b', parent: 'root' }]
    expect([...computeTreeLayout(input).entries()]).toEqual([...computeTreeLayout(input).entries()])
  })
})
