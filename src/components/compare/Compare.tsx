import type { CSSProperties } from 'react'
import { resolveColorToken } from '../../applyTheme'
import type { CompareItem, ComparePaneSpec, CompareSpec, CompareStatus } from './types'
import styles from './Compare.module.css'

/** 状態記号（色に依存せず意味が伝わるよう、色と記号の両方で状態を表す） */
const STATUS_MARK: Record<CompareStatus, string> = {
  pass: '✓',
  fail: '✕',
  warn: '!',
  neutral: '–',
}

/** 状態色トークン名（THEME_COLOR_TOKENSのキー） */
const STATUS_COLOR: Record<CompareStatus, string> = {
  pass: 'success',
  fail: 'danger',
  warn: 'warning',
  neutral: 'neutral',
}

/** JSON 由来の値は配列でない可能性があるため、描画前に配列だけを通す（不正なデッキでデッキ全体を落とさない） */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function CompareMark({ status }: { status: CompareStatus }) {
  const style = { '--mark-color': `var(${resolveColorToken(STATUS_COLOR[status])})` } as CSSProperties
  return (
    <span className={styles.mark} style={style}>
      {STATUS_MARK[status]}
    </span>
  )
}

function CompareItemRow({ item }: { item: CompareItem }) {
  return (
    <li className={styles.item}>
      {item.status && <CompareMark status={item.status} />}
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
