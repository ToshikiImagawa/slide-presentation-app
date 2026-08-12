import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from './colors'
import { computeGridLayout } from './gridLayout'
import type { StructureEdge, StructureEdgeType, StructureNode } from './types'

export type ClassDiagramSpec = {
  classes?: StructureNode[]
  relations?: StructureEdge[]
}

/** UMLの関係種別ごとの線の見た目の既定値。head/dashedを明示指定した場合はそちらが勝つ（#205） */
const RELATION_DEFAULTS: Record<StructureEdgeType, { head: 'arrow' | 'triangle'; dashed: boolean }> = {
  association: { head: 'arrow', dashed: false },
  inheritance: { head: 'triangle', dashed: false },
  implements: { head: 'triangle', dashed: true },
  dependency: { head: 'arrow', dashed: true },
}

/** 属性・メソッドを改行区切りで1つの body にまとめる（DiagramCard は単一の本文スロットのみ持つため、
 * 3コンパートメントのUML表記を模した簡易表示にする。区切りは空行のみ（罫線は引かない）。
 * 改行はDiagramCard.module.cssのwhite-space: pre-lineが他の本文フィールドと同じ"\n"規約で解釈する */
function renderMembers(attributes: string[] | undefined, methods: string[] | undefined): string | undefined {
  const attrs = asArray(attributes)
  const methodList = asArray(methods)
  const lines = [...attrs, ...(attrs.length > 0 && methodList.length > 0 ? [''] : []), ...methodList]
  return lines.length === 0 ? undefined : lines.join('\n')
}

/**
 * スライド JSON の `content.classDiagram` を描画する UML クラス図（#205）。
 *
 * classes[].row/col を指定すると明示配置、省略時は決定的な自動グリッド配置になる
 * （gridLayout.ts。行・列の明示指定と自動配置の両方に対応する・#205 の受け入れ基準）。
 * 関係線は #202 のコネクタを再利用し、relations[].type で継承・実装・依存の見た目の
 * 既定値（矢印/三角・実線/破線）を切り替える。
 */
export function ClassDiagram({ classes, relations }: ClassDiagramSpec) {
  const list = asArray(classes).filter((node) => node.id)
  if (list.length === 0) return null

  const rects = computeGridLayout(list)
  const diagramNodes = list.map((node, i) => ({
    id: node.id,
    rect: rects[i],
    title: node.label,
    body: renderMembers(node.attributes, node.methods),
    color: node.color ?? defaultSeriesColor(i),
    variant: node.variant,
  }))

  const connectors = asArray(relations).map((relation) => {
    const defaults = relation.type ? RELATION_DEFAULTS[relation.type] : undefined
    return { ...relation, head: relation.head ?? defaults?.head, dashed: relation.dashed ?? defaults?.dashed }
  })

  return <Diagram nodes={diagramNodes} connectors={connectors} />
}
