import type { TableColumnSpec, TableSpec } from './types'
import styles from './Table.module.css'

const DEFAULT_ALIGN = 'left'

/** JSON 由来の値は配列でない可能性があるため、描画前に配列だけを通す（不正なデッキでデッキ全体を落とさない） */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/** 列幅比率を%へ変換する。省略列は1として等分する */
function columnWidths(columns: TableColumnSpec[]): number[] {
  const weights = columns.map((column) => (typeof column.width === 'number' && column.width > 0 ? column.width : 1))
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

  const widths = columnWidths(columns)
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
            <tr key={rowIndex} className={styles.tr}>
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
