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

const MIN_COLUMNS = 1
const MAX_COLUMNS = 3

/** 行数（項目数 ÷ 列数）から密度（行間・文字サイズの縮小段階）を決める。Timeline/ChecklistのresolveDensityと
 * 同じ考え方で、実際にはみ出していないかは npm run reference-deck:inspect が実測で検出する */
function resolveDensity(count: number, columns: number): 'normal' | 'dense' | 'compact' {
  const rows = Math.ceil(count / columns)
  if (rows > 8) return 'compact'
  if (rows > 5) return 'dense'
  return 'normal'
}

/**
 * スライドJSONの`content.toc`を描画する目次（#195）。章番号（任意）・タイトル・開始ページ番号を横並びの行として
 * 表示し、タイトルとページ番号の間はドットの導線で結ぶ（紙の目次と同じ表記）。
 */
export function Toc({ items, columns }: Props) {
  const resolvedColumns = columns === undefined ? MIN_COLUMNS : Math.min(Math.max(Math.round(columns), MIN_COLUMNS), MAX_COLUMNS)
  return (
    <ol className={styles.list} data-testid="toc" data-density={resolveDensity(items.length, resolvedColumns)} style={{ gridTemplateColumns: `repeat(${resolvedColumns}, minmax(0, 1fr))` }}>
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
