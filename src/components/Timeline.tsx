import type { ReactNode } from 'react'
import styles from './Timeline.module.css'

type Props = {
  items: ReactNode[]
  /** 多列配置の列数（#199）。省略時は現行と同じ「連結線つきの横1列」。指定すると連結線を持たない
   * 番号付きリストとして 1〜3 列 × 複数行に並べる（項目が多いと横1列では1項目あたりの幅が破綻するため） */
  columns?: number
}

/** 多列配置で許す列数。1列は縦並びの番号付きリスト、3列は1項目あたりの幅が読める下限 */
const MIN_COLUMNS = 1
const MAX_COLUMNS = 3

/** 行数（項目数 ÷ 列数）から密度（行間・説明文の文字サイズの縮小段階）を決める。
 * Table の resolveDensity と同じ考え方で、実際にはみ出していないかは npm run reference-deck:inspect が実測で検出する */
function resolveDensity(count: number, columns: number): 'normal' | 'dense' | 'compact' {
  const rows = Math.ceil(count / columns)
  if (rows > 3) return 'compact'
  if (rows === 3) return 'dense'
  return 'normal'
}

export function Timeline({ items, columns }: Props) {
  if (columns === undefined) {
    return (
      <div className={styles.layout}>
        <div className={styles.line} />
        {items.map((item, i) => (
          <div key={i} className={styles.item}>
            {item}
          </div>
        ))}
      </div>
    )
  }

  const resolvedColumns = Math.min(Math.max(Math.round(columns), MIN_COLUMNS), MAX_COLUMNS)
  return (
    <div className={`${styles.layout} ${styles.multiColumn}`} data-testid="timeline-multi-column" data-density={resolveDensity(items.length, resolvedColumns)} style={{ gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <div key={i} className={styles.item}>
          {item}
        </div>
      ))}
    </div>
  )
}
