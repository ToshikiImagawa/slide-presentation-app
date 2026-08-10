import { clampColumns, densityFromRows } from './multiColumnDensity'
import styles from './Toc.module.css'

export type TocItemData = {
  /** 章番号（手書き項目リストでは省略可）。自動導出時はrenderMasterTextの{sectionNumber:0N}書式で整形済み */
  number?: string
  title: string
  /** 開始ページ番号（表示用の文字列） */
  page: string
}

type Props = {
  items: TocItemData[]
  /** 多列配置の列数（1〜3）。省略時は縦1列 */
  columns?: number
}

/**
 * スライドJSONの`content.toc`を描画する目次（#195）。章番号（任意）・タイトル・開始ページ番号を横並びの行として
 * 表示し、タイトルとページ番号の間はドットの導線で結ぶ（紙の目次と同じ表記）。
 */
export function Toc({ items, columns }: Props) {
  const resolvedColumns = clampColumns(columns ?? 1)
  return (
    <ol className={styles.list} data-testid="toc" data-density={densityFromRows(items.length, resolvedColumns, { dense: 6, compact: 8 })} style={{ gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <li key={i} className={styles.item}>
          {item.number !== undefined && <span className={styles.number}>{item.number}</span>}
          <span className={styles.title}>{item.title}</span>
          <span className={styles.page}>{item.page}</span>
        </li>
      ))}
    </ol>
  )
}
