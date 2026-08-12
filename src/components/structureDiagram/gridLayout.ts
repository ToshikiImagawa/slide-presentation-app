import type { NormRect } from '../diagram'
import { packAxis } from './packAxis'

const MARGIN = 0.02
const GAP = 0.05
/** 行数が少ないときにボックスの縦幅が間延びしないための上限（クラスボックスらしい縦横比を保つ）。
 * 行数が増えれば自然に1行の高さがこれを下回るので、多くのクラスがある場合は上限は効かない */
const MAX_ROW_HEIGHT = 0.42

export type GridPosition = { row?: number; col?: number }

/**
 * UMLクラス図（#205）・フローチャート（#206）のグリッド配置。row/colを明示指定したノードはそこに置き、
 * 省略したノードは決定的な自動グリッド（配列順に正方形へ近い行列へ詰める）に配置する（行・列の明示指定と
 * 自動配置の両方に対応する・#205 の受け入れ基準）。
 *
 * 戻り値は入力と同じ順序の配列（nodes[i] の配置は戻り値[i]に対応する）。
 */
export function computeGridLayout(nodes: GridPosition[]): NormRect[] {
  const count = nodes.length
  if (count === 0) return []

  const autoCols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const positions = nodes.map((node, i) => ({
    row: node.row ?? Math.floor(i / autoCols),
    col: node.col ?? i % autoCols,
  }))

  const rowCount = Math.max(...positions.map((p) => p.row)) + 1
  const colCount = Math.max(...positions.map((p) => p.col)) + 1

  const rowSlots = packAxis(rowCount, MARGIN, 1 - MARGIN * 2, GAP)
  const colSlots = packAxis(colCount, MARGIN, 1 - MARGIN * 2, GAP)

  return positions.map(({ row, col }) => {
    const rowSlot = rowSlots[row]
    const h = Math.min(rowSlot.size, MAX_ROW_HEIGHT)
    return { x: colSlots[col].offset, y: rowSlot.offset + (rowSlot.size - h) / 2, w: colSlots[col].size, h }
  })
}
