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
    // 見出し自身の並び順・件数で出現させる。呼び出し元が他の本体ノードと連結した配列を渡すため、
    // 配列位置ベースの自動 index/count に任せると本体ノードの出現が見出し分だけ遅れ、
    // ステップの圧縮量（--stagger-count）も見出し件数分だけ余計に含んでしまう
    staggerIndex: i,
    staggerCount: labels.length,
  }))
}
