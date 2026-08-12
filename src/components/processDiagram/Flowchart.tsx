import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { computeGridLayout } from '../structureDiagram/gridLayout'
import { asArray, type StructureEdge, type StructureNode } from '../structureDiagram/types'

export type FlowchartSpec = {
  nodes?: StructureNode[]
  edges?: StructureEdge[]
}

/** ノード種別（StructureNode.shape）から DiagramCard の外形へのマッピング。
 * process/未指定は既定の矩形（DiagramCard の shape 省略と同じ）なのでここには含めない */
const NODE_SHAPES: Record<'start' | 'end' | 'decision', 'pill' | 'diamond'> = {
  start: 'pill',
  end: 'pill',
  decision: 'diamond',
}

/**
 * スライド JSON の `content.flowchart` を描画するフローチャート（#206）。
 *
 * ノードは #205 の structureDiagram と同じ `computeGridLayout`（UMLクラス図と共通）を再利用する:
 * row/col を明示指定した分岐・合流のレイアウトも、省略時の決定的な自動グリッドも同じ経路で扱える
 * （再実装しない）。分岐（1つのノードから複数エッジ）・合流（複数エッジが1つのノードに集約）は
 * どちらも StructureEdge をそのまま複数渡すだけで表現でき、専用のデータ構造は不要（#202のConnectorが
 * ノード境界の辺の中点に自動で接続するため、直交経路がノードを貫通したり離れたりしない）。
 */
export function Flowchart({ nodes, edges }: FlowchartSpec) {
  const list = asArray(nodes).filter((node) => node.id)
  if (list.length === 0) return null

  const rects = computeGridLayout(list)
  const diagramNodes = list.map((node, i) => ({
    id: node.id,
    rect: rects[i],
    title: node.label,
    body: node.description,
    color: node.color ?? defaultSeriesColor(i),
    variant: node.variant,
    shape: node.shape && node.shape !== 'process' ? NODE_SHAPES[node.shape] : undefined,
  }))

  return <Diagram nodes={diagramNodes} connectors={asArray(edges)} />
}
