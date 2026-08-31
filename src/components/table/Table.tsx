import type { CSSProperties } from 'react'
import { asArray } from '../../data/loader'
import type { TableColumnSpec, TableSpec } from './types'
import styles from './Table.module.css'

const DEFAULT_ALIGN = 'left'

function hasExplicitWidth(column: TableColumnSpec): boolean {
  return typeof column.width === 'number' && column.width > 0
}

/** 列の内容量（ヘッダーラベルと全セルの文字数のうち最大値）。空でも0にならないよう下限1 */
function contentLength(column: TableColumnSpec, rows: string[][], columnIndex: number): number {
  const lengths = [column.label.length, ...rows.map((row) => (row[columnIndex] ?? '').length)]
  return Math.max(...lengths, 1)
}

/**
 * 列幅比率を%へ変換する。width省略列は内容量（文字数）に応じた重みを自動算出する（#418）。
 * 省略列どうしの内容量が同じ（あるいは1列のみ）なら重みは全て1になり、従来の等分割と一致する。
 */
function columnWidths(columns: TableColumnSpec[], rows: string[][]): number[] {
  const lengths = columns.map((column, index) => contentLength(column, rows, index))
  const autoLengths = lengths.filter((_, index) => !hasExplicitWidth(columns[index]))
  const avgAutoLength = autoLengths.length > 0 ? autoLengths.reduce((sum, length) => sum + length, 0) / autoLengths.length : 1

  const weights = columns.map((column, index) => (hasExplicitWidth(column) ? (column.width as number) : lengths[index] / avgAutoLength))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  return weights.map((weight) => (weight / total) * 100)
}

/** 行数・列数から密度（padding・文字サイズの縮小段階）を決める */
function resolveDensity(rowCount: number, columnCount: number): 'normal' | 'dense' | 'compact' {
  if (rowCount > 10 || columnCount > 6) return 'compact'
  if (rowCount > 6 || columnCount > 4) return 'dense'
  return 'normal'
}

/**
 * スライド JSON の `content.table` を描画する表（#194）。
 * 罫線・ゼブラ・ヘッダ行の塗り・角丸は意匠トークンから引く。行数・列数が多いときは
 * data-density で padding・文字サイズを段階的に縮め、それでも収まらない分は
 * `.content-area` の overflow: hidden にゆだねる（スライドの外へはみ出させない）。
 * 高さは ContentLayout の fill 変種（global.css の .content-area-fill-item・#225）から受け取る（#256）。
 */
export function Table(spec: TableSpec) {
  const columns = asArray(spec.columns)
  const rows = asArray(spec.rows)

  if (columns.length === 0) {
    console.warn('[Table] columnsが空のため描画できません')
    return null
  }

  const widths = columnWidths(columns, rows)
  const density = resolveDensity(rows.length, columns.length)

  return (
    <div className={`content-area-fill-item ${styles.wrapper}`} data-testid="table" data-density={density}>
      <table className={styles.table}>
        <colgroup>
          {widths.map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className={styles.th} style={{ textAlign: column.align ?? DEFAULT_ALIGN }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={styles.tr} style={{ '--stagger-index': rowIndex, '--stagger-count': rows.length } as CSSProperties}>
              {columns.map((column, columnIndex) => (
                <td key={columnIndex} className={styles.td} style={{ textAlign: column.align ?? DEFAULT_ALIGN }}>
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
