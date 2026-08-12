import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'
import { asArray, type StructureEdge, type StructureNode } from '../structureDiagram/types'

const LANE_MARGIN = 0.02
const LANE_GAP = 0.05
const HEADER_HEIGHT = 0.1
const COL_MARGIN = 0.02
const COL_GAP = 0.03
const NODE_INSET = 0.03
/** レーン帯のうち、レーンラベルチップの分だけ上を空けて残りにノードを詰める比率（ServerDiagram のゾーンと同じ考え方） */
const LABEL_STRIP = 0.32
const ITEM_AREA = 0.58

export type SwimlaneLane = {
  title?: string
  color?: string
  nodes?: StructureNode[]
}

export type SwimlaneSpec = {
  /** 列見出し（工程名）。省略時は見出しなしで、列数はノードの配置から自動導出する */
  phases?: string[]
  lanes?: SwimlaneLane[]
  /** レーンをまたいでノードのidを結ぶ */
  connections?: StructureEdge[]
}

/**
 * スライド JSON の `content.swimlane` を描画するスイムレーン（担当×工程・#206）。
 *
 * レーン（担当）は入力配列の順（上から下）で積む。ServerDiagram のゾーンは各ゾーンが独立して
 * ノードを詰める（ゾーンごとにノード数が違ってよい）が、スイムレーンは「同じ工程を誰が担当するか」
 * を縦に比較できることが要件のため、列（フェーズ）位置を全レーンで共有する 1 本の軸にする
 * （ServerDiagram の zoneごとpackAxisをそのまま複製すると列が揃わない）。
 * 各ノードの列は node.col（明示指定）またはレーン内での配列順（省略時）で決まる決定的な配置。
 */
export function Swimlane({ phases, lanes, connections }: SwimlaneSpec) {
  const laneList = asArray(lanes)
  if (laneList.length === 0) return null

  const phaseList = asArray(phases)
  const hasHeader = phaseList.length > 0
  const headerHeight = hasHeader ? HEADER_HEIGHT : 0
  const colCount = Math.max(phaseList.length, ...laneList.map((lane) => asArray(lane.nodes).length), 1)

  const laneSlots = packAxis(laneList.length, headerHeight, 1 - headerHeight - LANE_MARGIN, LANE_GAP)
  const colSlots = packAxis(colCount, COL_MARGIN, 1 - COL_MARGIN * 2, COL_GAP)

  const laneBoxes = laneList.map((_lane, i) => ({
    id: `lane-${i}`,
    rect: { x: LANE_MARGIN, y: laneSlots[i].offset, w: 1 - LANE_MARGIN * 2, h: laneSlots[i].size },
    variant: 'plain' as const,
  }))

  const headerBoxes = hasHeader
    ? phaseList.map((phase, i) => ({
        id: `phase-${i}`,
        rect: { x: colSlots[i].offset, y: 0, w: colSlots[i].size, h: headerHeight },
        title: phase,
        variant: 'plain' as const,
      }))
    : []

  // レーンをまたぐ全ノードを先に平坦化してから連番を振る（ミュータブルなカウンタを持たない・ServerDiagramと同じ考え方）
  const placedItems = laneList.flatMap((lane, i) => {
    const laneRect = laneBoxes[i].rect
    const nodeList = asArray(lane.nodes).filter((node) => node.id)
    return nodeList.map((node, j) => {
      const col = Math.min(node.col ?? j, colSlots.length - 1)
      return {
        node,
        rect: { x: colSlots[col].offset + NODE_INSET, y: laneRect.y + laneRect.h * LABEL_STRIP, w: colSlots[col].size - NODE_INSET * 2, h: laneRect.h * ITEM_AREA },
      }
    })
  })
  const itemNodes = placedItems.map(({ node, rect }, index) => ({
    id: node.id,
    rect,
    title: node.label,
    body: node.description,
    color: node.color ?? defaultSeriesColor(index),
    variant: node.variant,
  }))

  const laneBadges = laneList.map((lane, i) => ({
    at: { x: laneBoxes[i].rect.x + 0.08, y: laneBoxes[i].rect.y + laneBoxes[i].rect.h * 0.16 },
    text: lane.title ?? '',
    color: lane.color ?? 'neutral',
    shape: 'square' as const,
  }))

  return <Diagram nodes={[...laneBoxes, ...headerBoxes, ...itemNodes]} connectors={asArray(connections)} badges={laneBadges} />
}
