import type { CSSProperties } from 'react'
import { asArray } from '../../data/loader'
import { normToPercent } from '../diagram/geometry'
import { DiagramCanvas } from '../diagram/DiagramCanvas'
import { shadeSeries } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'
import styles from './Heatmap.module.css'

export type HeatmapSpec = {
  /** 行見出し（縦軸ラベル。上から下） */
  rows?: string[]
  /** 列見出し（横軸ラベル。左から右） */
  cols?: string[]
  /** 行×列の値の2次元配列（`values[rowIndex][colIndex]`）。行数・列数が rows/cols と揃わない場合、余った分は空セルにする */
  values?: number[][]
  /** 濃淡を作る基準色（例: 'series1'）。省略時は 'primary'。alpha を段階的に振るため、色の意味は色相ではなく濃さで表す */
  color?: string
  /** 濃度写像の下限値。省略時はデータの最小値 */
  min?: number
  /** 濃度写像の上限値。省略時はデータの最大値 */
  max?: number
  /** 各セルに数値ラベルを重ねるか。省略時は 8×8 以下なら表示 */
  valueLabels?: boolean
  /** 数値の単位（"%" 等）。valueLabels 表示時に数値の後ろへ連結する */
  unit?: string
}

/** ラベル領域（左・上）の相対幅・高さ。文字が短い前提で狭めに取り、セル領域を大きく確保する */
const ROW_LABEL_WIDTH = 0.14
const COL_LABEL_HEIGHT = 0.1
const CELL_GAP = 0.005
/** 濃度写像の最小・最大の alpha。0 は色が付かず「セルが無い」ように見えるので下限を持たせる */
const MIN_ALPHA = 0.1
const MAX_ALPHA = 0.95
/** 値ラベルの既定表示上限（行数×列数）。これを超えるとセルが狭くなり文字が読めないので既定で省く */
const VALUE_LABEL_MAX_CELLS = 64

/**
 * スライド JSON の `content.heatmap` を描画するヒートマップ（行×列の値の濃淡・#207）。
 *
 * セルの塗りは `shadeSeries`（`src/components/structureDiagram/colors.ts`）で作る単一の系列色 + alpha の
 * 階調。濃淡の生成は 1 箇所のヘルパーに集約し（4図式で複製しない・受け入れ基準）、
 * `-rgb` companion 変数 + alpha 方式を採用した理由は `shadeSeries` の解説に記載。
 *
 * 行数×列数が既定閾値（8×8）を超えると値ラベルを省く（自動縮退。破綻ではなく縮退・受け入れ基準）。
 * 数値の描画は CSS Grid で行い DiagramCanvas を親にすることで、他の分析図と同じく本文領域の
 * 残り高さに追従する。
 */
export function Heatmap({ rows, cols, values, color, min, max, valueLabels, unit }: HeatmapSpec) {
  const rowList = asArray(rows)
  const colList = asArray(cols)
  const valueMatrix = asArray(values).map((r) => asArray(r))
  const rowCount = Math.max(rowList.length, valueMatrix.length)
  const colCount = Math.max(colList.length, ...valueMatrix.map((r) => r.length), 1)
  if (rowCount === 0) return null

  const flatValues = valueMatrix.flat().filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const dataMin = flatValues.length > 0 ? Math.min(...flatValues) : 0
  const dataMax = flatValues.length > 0 ? Math.max(...flatValues) : 1
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : dataMin
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : dataMax
  const range = hi - lo

  const showLabels = valueLabels ?? rowCount * colCount <= VALUE_LABEL_MAX_CELLS

  const rowSlots = packAxis(rowCount, COL_LABEL_HEIGHT, 1 - COL_LABEL_HEIGHT, CELL_GAP)
  const colSlots = packAxis(colCount, ROW_LABEL_WIDTH, 1 - ROW_LABEL_WIDTH, CELL_GAP)

  const cells: { key: string; style: CSSProperties; label?: string }[] = []
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const value = valueMatrix[r]?.[c]
      const normalized = typeof value === 'number' && Number.isFinite(value) && range > 0 ? (value - lo) / range : 0
      const alpha = MIN_ALPHA + Math.min(1, Math.max(0, normalized)) * (MAX_ALPHA - MIN_ALPHA)
      const row = rowSlots[r]
      const col = colSlots[c]
      cells.push({
        key: `cell-${r}-${c}`,
        style: {
          left: normToPercent(col.offset),
          top: normToPercent(row.offset),
          width: normToPercent(col.size),
          height: normToPercent(row.size),
          backgroundColor: typeof value === 'number' && Number.isFinite(value) ? shadeSeries(color, alpha) : 'transparent',
          // 行・列を別々の delay 成分にする（Heatmap.module.css 参照）。1本の連番（r*colCount+c）を
          // 要素数で単純に圧縮すると、列数が多いグリッドでは行間の間隔まで潰れてしまい、最後の行の
          // 全セルがほぼ同時に現れて「一気に濃くなる」ように見える。行の間隔は列数に関わらず確保する
          '--stagger-row': r,
          '--stagger-row-count': rowCount,
          '--stagger-col': c,
          '--stagger-col-count': colCount,
        } as CSSProperties,
        label: showLabels && typeof value === 'number' && Number.isFinite(value) ? formatValue(value, unit) : undefined,
      })
    }
  }

  const rowLabels = rowList.slice(0, rowCount).map((label, r) => ({
    key: `row-${r}`,
    style: { left: 0, top: normToPercent(rowSlots[r].offset), width: normToPercent(ROW_LABEL_WIDTH), height: normToPercent(rowSlots[r].size) },
    text: label,
  }))
  const colLabels = colList.slice(0, colCount).map((label, c) => ({
    key: `col-${c}`,
    style: { left: normToPercent(colSlots[c].offset), top: 0, width: normToPercent(colSlots[c].size), height: normToPercent(COL_LABEL_HEIGHT) },
    text: label,
  }))

  return (
    <DiagramCanvas>
      {cells.map((cell) => (
        <div key={cell.key} className={styles.cell} style={cell.style}>
          {cell.label && <span className={styles.value}>{cell.label}</span>}
        </div>
      ))}
      {rowLabels.map((label) => (
        <div key={label.key} className={styles.rowLabel} style={label.style}>
          {label.text}
        </div>
      ))}
      {colLabels.map((label) => (
        <div key={label.key} className={styles.colLabel} style={label.style}>
          {label.text}
        </div>
      ))}
    </DiagramCanvas>
  )
}

function formatValue(value: number, unit?: string): string {
  const formatted = value.toLocaleString()
  return unit ? `${formatted}${unit}` : formatted
}
