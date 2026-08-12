import type { AxisSlot } from '../structureDiagram/packAxis'

/**
 * 文字列配列を、共有の列軸（colSlots）に沿った見出し行の DiagramCard ノードにする
 * （Gantt の軸見出し・Swimlane のフェーズ見出しで共通の小さいパターン・#206）。
 */
export function axisHeaderNodes(labels: string[], colSlots: AxisSlot[], height: number, idPrefix: string) {
  return labels.map((label, i) => ({
    id: `${idPrefix}-${i}`,
    rect: { x: colSlots[i].offset, y: 0, w: colSlots[i].size, h: height },
    title: label,
    variant: 'plain' as const,
  }))
}
