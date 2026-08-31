import type { CSSProperties, ReactNode } from 'react'
import { clampColumns, densityFromRows } from './multiColumnDensity'
import styles from './Timeline.module.css'

type Props = {
  items: ReactNode[]
  /** 多列配置の列数（#199）。省略時は現行と同じ「連結線つきの横1列」。指定すると連結線を持たない
   * 番号付きリストとして 1〜3 列 × 複数行に並べる（項目が多いと横1列では1項目あたりの幅が破綻するため） */
  columns?: number
}

export function Timeline({ items, columns }: Props) {
  if (columns === undefined) {
    return (
      <div className={styles.layout}>
        <div className={styles.line} />
        {items.map((item, i) => (
          <div key={i} className={`${styles.item} stagger-item`} style={{ '--stagger-index': i, '--stagger-count': items.length } as CSSProperties}>
            {item}
          </div>
        ))}
      </div>
    )
  }

  const resolvedColumns = clampColumns(columns)
  const rowCount = Math.ceil(items.length / resolvedColumns)
  return (
    <div
      className={`${styles.layout} ${styles.multiColumn}`}
      data-testid="timeline-multi-column"
      data-density={densityFromRows(items.length, resolvedColumns, { dense: 3, compact: 3 })}
      style={{ gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={`${styles.item} stagger-item grid-stagger-item`}
          style={{ '--stagger-row': Math.floor(i / resolvedColumns), '--stagger-row-count': rowCount, '--stagger-col': i % resolvedColumns, '--stagger-col-count': resolvedColumns } as CSSProperties}
        >
          {item}
        </div>
      ))}
    </div>
  )
}
