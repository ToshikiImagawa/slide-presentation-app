import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from './colors'
import { packAxis } from './packAxis'

const INSET = 0.03
const GAP = 0.04

export type HierarchyLayer = {
  title?: string
  description?: string
  color?: string
}

export type HierarchyDiagramSpec = {
  layers?: HierarchyLayer[]
}

/**
 * スライド JSON の `content.hierarchyDiagram` を描画する階層構成図（層を積む構造図・#205）。
 *
 * 層は入力配列の順（上から下）がそのまま配置の明示指定になるため、乱数・力学モデルによる
 * 自動配置は使わない。隣接する層同士は #202 のコネクタで結び、境界に接する（再実装しない）。
 * ノードの座標を算出して Diagram に渡す層としてこのコンポーネントを作る（#205 の設計指定）。
 */
export function HierarchyDiagram({ layers }: HierarchyDiagramSpec) {
  const list = asArray(layers)
  if (list.length === 0) return null

  const rowSlots = packAxis(list.length, 0, 1, GAP)
  const nodes = list.map((layer, i) => ({
    id: `layer-${i}`,
    rect: { x: INSET, y: rowSlots[i].offset, w: 1 - INSET * 2, h: rowSlots[i].size },
    title: layer.title,
    body: layer.description,
    color: layer.color ?? defaultSeriesColor(i),
  }))
  const connectors = list.slice(1).map((_, i) => ({ from: `layer-${i}`, to: `layer-${i + 1}`, routing: 'vertical' as const, head: 'none' as const }))

  return <Diagram nodes={nodes} connectors={connectors} />
}
