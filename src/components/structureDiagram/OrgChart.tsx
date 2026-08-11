import { Diagram } from '../diagram'
import { defaultSeriesColor } from './colors'
import { computeTreeLayout, resolveTree } from './treeLayout'
import { asArray, type StructureNode } from './types'

export type OrgChartSpec = {
  nodes?: StructureNode[]
}

/**
 * スライド JSON の `content.orgChart` を描画する組織図・体制図（階層+親子関係・#205）。
 *
 * nodes[].parent の親子関係を明示指定し、行（親からの深さ）と列位置はそこから決定的に
 * 自動導出する（treeLayout.ts。乱数・力学モデルは使わない）。親子の接続線は #202 の
 * コネクタを再利用し、境界に接する（head: 'none' の素の線。組織図は矢印の意味を持たない）。
 */
export function OrgChart({ nodes }: OrgChartSpec) {
  const list = asArray(nodes).filter((node) => node.id)
  if (list.length === 0) return null

  const rects = computeTreeLayout(list)
  const { childrenOf } = resolveTree(list)

  const diagramNodes = list.map((node, i) => ({
    id: node.id,
    rect: rects.get(node.id)!,
    title: node.label,
    body: node.description,
    color: node.color ?? defaultSeriesColor(i),
    variant: node.variant,
  }))

  const connectors = list.flatMap((node) => (childrenOf.get(node.id) ?? []).map((child) => ({ from: node.id, to: child, head: 'none' as const })))

  return <Diagram nodes={diagramNodes} connectors={connectors} />
}
