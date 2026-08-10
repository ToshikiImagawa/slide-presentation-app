import type { ReactNode } from 'react'
import { DiagramBadge } from './diagram'
import styles from './Checklist.module.css'

export type ChecklistItemData = {
  title: string
  /** 項目の補足説明（省略可） */
  description?: ReactNode
  /** 完了なら true。省略時は未完了 */
  checked?: boolean
}

type Props = {
  items: ChecklistItemData[]
}

/** 項目数から密度（行間・文字サイズの縮小段階）を決める。Table の resolveDensity と同じ考え方で、
 * 実際にはみ出していないかは npm run reference-deck:inspect が実測で検出する */
function resolveDensity(count: number): 'normal' | 'dense' | 'compact' {
  if (count > 6) return 'compact'
  if (count > 4) return 'dense'
  return 'normal'
}

/**
 * スライド JSON の `content.checklist` を描画するチェックリスト（#199）。
 * リリース前確認・要件確認のように「完了記号＋項目＋説明」で並べる用途に使う。
 *
 * 記号は #202 の DiagramBadge を再利用するので色・角丸・フォントは意匠トークンに追従する。
 * 済は丸＋✓・未は角丸の空枠で、色だけでなく形でも区別できるようにする（Compare の状態記号と同じ考え方）。
 */
export function Checklist({ items }: Props) {
  return (
    <ul className={styles.list} data-testid="checklist" data-density={resolveDensity(items.length)}>
      {items.map((item, i) => (
        <li key={i} className={styles.item}>
          <DiagramBadge color={item.checked ? 'success' : 'neutral'} shape={item.checked ? 'circle' : 'square'}>
            {item.checked ? '✓' : ''}
          </DiagramBadge>
          <div className={styles.body}>
            <span className={styles.title}>{item.title}</span>
            {item.description && <span className={styles.description}>{item.description}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
