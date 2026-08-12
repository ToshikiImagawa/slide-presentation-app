import type { NormRect } from '../diagram'
import { getAxisSlot, packAxis } from './packAxis'

const MARGIN = 0.02
const GAP = 0.05
/** 行数が少ないときにボックスの縦幅が間延びしないための上限（クラスボックスらしい縦横比を保つ）。
 * 行数が増えれば自然に1行の高さがこれを下回るので、多くのクラスがある場合は上限は効かない */
const MAX_ROW_HEIGHT = 0.42

export type GridPosition = { row?: number; col?: number }

/**
 * row/col省略時の自動配置（配列順に正方形へ近い行列へ詰める）を含めた実効位置と、そこから決まる行数・列数を
 * 導出する（純関数）。computeGridLayout本体と #279 の範囲外警告（applyTheme.ts の getDiagramWarnings）が
 * 行数・列数の導出式を複製せずに済むよう export する。
 */
export function computeGridDimensions(nodes: GridPosition[]): { rowCount: number; colCount: number; positions: Required<GridPosition>[] } {
  const count = nodes.length
  if (count === 0) return { rowCount: 0, colCount: 0, positions: [] }

  const autoCols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const positions = nodes.map((node, i) => ({
    row: node.row ?? Math.floor(i / autoCols),
    col: node.col ?? i % autoCols,
  }))

  // 明示指定のrow/colが非整数だとMax計算の結果も非整数になり得るが、packAxisは
  // Array.from({ length: count }) で count を暗黙に整数化する（ToLengthがfloorする）。
  // ここでMath.floorし、rowCount/colCountが常に整数であることをこの関数1箇所で保証する
  // （clampAxisIndex・packAxis側にこの整数化を書き写さない・#279）。
  return {
    rowCount: Math.floor(Math.max(...positions.map((p) => p.row)) + 1),
    colCount: Math.floor(Math.max(...positions.map((p) => p.col)) + 1),
    positions,
  }
}

/**
 * UMLクラス図（#205）・フローチャート（#206）のグリッド配置。row/colを明示指定したノードはそこに置き、
 * 省略したノードは決定的な自動グリッド（配列順に正方形へ近い行列へ詰める）に配置する（行・列の明示指定と
 * 自動配置の両方に対応する・#205 の受け入れ基準）。
 *
 * 戻り値は入力と同じ順序の配列（nodes[i] の配置は戻り値[i]に対応する）。
 */
export function computeGridLayout(nodes: GridPosition[]): NormRect[] {
  const { rowCount, colCount, positions } = computeGridDimensions(nodes)
  if (positions.length === 0) return []

  const rowSlots = packAxis(rowCount, MARGIN, 1 - MARGIN * 2, GAP)
  const colSlots = packAxis(colCount, MARGIN, 1 - MARGIN * 2, GAP)

  return positions.map(({ row, col }) => {
    // getAxisSlotで範囲外・非整数のrow/colをガードする（#276）
    const rowSlot = getAxisSlot(rowSlots, row)
    const colSlot = getAxisSlot(colSlots, col)
    const h = Math.min(rowSlot.size, MAX_ROW_HEIGHT)
    return { x: colSlot.offset, y: rowSlot.offset + (rowSlot.size - h) / 2, w: colSlot.size, h }
  })
}
