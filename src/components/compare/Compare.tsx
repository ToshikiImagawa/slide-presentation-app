import { DiagramBadge } from '../diagram'
import type { CompareItem, ComparePaneSpec, CompareSpec, CompareStatus } from './types'
import styles from './Compare.module.css'

/** 状態記号・状態色（色に依存せず意味が伝わるよう、色と記号の両方で状態を表す） */
const STATUS: Record<CompareStatus, { mark: string; color: string }> = {
  pass: { mark: '✓', color: 'success' },
  fail: { mark: '✕', color: 'danger' },
  warn: { mark: '!', color: 'warning' },
  neutral: { mark: '–', color: 'neutral' },
}

/** JSON 由来の値は配列でない可能性があるため、描画前に配列だけを通す（不正なデッキでデッキ全体を落とさない） */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function CompareItemRow({ item }: { item: CompareItem }) {
  const status = item.status && STATUS[item.status]
  return (
    <li className={styles.item}>
      {status && <DiagramBadge color={status.color}>{status.mark}</DiagramBadge>}
      <span className={styles.text}>{item.text}</span>
    </li>
  )
}

function ComparePane({ pane }: { pane: ComparePaneSpec | undefined }) {
  if (!pane) return <div className={styles.pane} />
  const items = asArray(pane.items)

  return (
    <div className={styles.pane}>
      {pane.heading && <div className={styles.heading}>{pane.heading}</div>}
      {items.length > 0 && (
        <ul className={styles.items}>
          {items.map((item, i) => (
            <CompareItemRow key={i} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * スライド JSON の `content.compare` を描画する2ペイン比較（#200）。
 * 可否・採用/非採用・Before/After 等の比較に使う。左右ペインはグリッドの stretch で
 * 高さが自動で揃い、項目の状態記号・状態色（success/warning/danger/neutral）はテーマトークンに追従する。
 */
export function Compare({ left, right }: CompareSpec) {
  return (
    <div className={styles.grid} data-testid="compare">
      <ComparePane pane={left} />
      <ComparePane pane={right} />
    </div>
  )
}
