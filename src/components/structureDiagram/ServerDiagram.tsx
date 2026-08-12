import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from './colors'
import { packAxis } from './packAxis'
import type { StructureEdge, StructureNode } from './types'

const ZONE_GAP = 0.06
const ZONE_MARGIN = 0.02
const NODE_GAP = 0.03
const NODE_INSET = 0.03
/** ゾーン帯のうち、ラベルチップの分だけ上を空けて残りにノードを詰める比率 */
const LABEL_STRIP = 0.32
const ITEM_AREA = 0.58

export type ServerZone = {
  title?: string
  color?: string
  nodes?: StructureNode[]
}

export type ServerDiagramSpec = {
  zones?: ServerZone[]
  connections?: StructureEdge[]
}

/**
 * スライド JSON の `content.serverDiagram` を描画するサーバ/クラウド構成図（ゾーン+ノード・#205）。
 *
 * ゾーン（サブネット等の枠）は入力配列の順（上から下）、ゾーン内のノードは配列の順（左から右）が
 * そのまま配置の明示指定になる。ゾーンの背景枠は #202 の DiagramCard（variant: plain）を再利用し、
 * ラベルはカードの中央寄せに埋もれないよう、ノードより後に描かれる badges（Diagram の描画順:
 * 線→カード→バッジ→引出線）でゾーン左上に載せる。connections はゾーンをまたいでノードidを結べる。
 */
export function ServerDiagram({ zones, connections }: ServerDiagramSpec) {
  const zoneList = asArray(zones)
  if (zoneList.length === 0) return null

  const zoneSlots = packAxis(zoneList.length, 0, 1, ZONE_GAP)

  const zoneBoxes = zoneList.map((_zone, i) => ({
    id: `zone-${i}`,
    rect: { x: ZONE_MARGIN, y: zoneSlots[i].offset, w: 1 - ZONE_MARGIN * 2, h: zoneSlots[i].size },
    variant: 'plain' as const,
  }))

  // ゾーンをまたぐ全ノードを先に平坦化してから連番を振る（ミュータブルなカウンタを持たない）
  const placedItems = zoneList.flatMap((zone, i) => {
    const zoneRect = zoneBoxes[i].rect
    const nodeList = asArray(zone.nodes).filter((node) => node.id)
    const itemSlots = packAxis(nodeList.length, zoneRect.x + NODE_INSET, zoneRect.w - NODE_INSET * 2, NODE_GAP)
    return nodeList.map((node, j) => ({
      node,
      rect: { x: itemSlots[j].offset, y: zoneRect.y + zoneRect.h * LABEL_STRIP, w: itemSlots[j].size, h: zoneRect.h * ITEM_AREA },
    }))
  })
  const itemNodes = placedItems.map(({ node, rect }, index) => ({
    id: node.id,
    rect,
    title: node.label,
    body: node.description,
    color: node.color ?? defaultSeriesColor(index),
    variant: node.variant,
  }))

  const badges = zoneList.map((zone, i) => ({
    at: { x: zoneBoxes[i].rect.x + 0.08, y: zoneBoxes[i].rect.y + zoneBoxes[i].rect.h * 0.16 },
    text: zone.title ?? '',
    color: zone.color ?? 'neutral',
    shape: 'square' as const,
  }))

  return <Diagram nodes={[...zoneBoxes, ...itemNodes]} connectors={asArray(connections)} badges={badges} />
}
