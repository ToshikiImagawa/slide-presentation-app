import type { CSSProperties, ReactNode } from 'react'
import { resolveColorToken } from '../../applyTheme'
import { normToPercent, type NormRect } from './geometry'
import styles from './DiagramCard.module.css'

type Props = {
  /** カードの位置と大きさ（正規化座標） */
  rect: NormRect
  title?: ReactNode
  children?: ReactNode
  /** カラーパレットキー名（例: 'series2'）。省略時は 'primary' */
  color?: string
  /** 面の塗り方。'plain' は色に意味を持たせず中立色にする。省略時は 'outline' */
  variant?: 'outline' | 'filled' | 'plain'
  /** 左上に重ねるバッジ（番号バッジ等） */
  badge?: ReactNode
}

/**
 * 図解用の角丸カード／パネル（#202）。
 *
 * 位置は正規化座標をそのまま % 指定に載せるため、キャンバスサイズが変わっても相対配置が保たれる
 * （px へ落とさないのでサイズ計測の完了を待つ必要もない）。
 */
export function DiagramCard({ rect, title, children, color, variant = 'outline', badge }: Props) {
  const cssVar = resolveColorToken(color)
  const style = {
    left: normToPercent(rect.x),
    top: normToPercent(rect.y),
    width: normToPercent(rect.w),
    height: normToPercent(rect.h),
    '--diagram-color': `var(${cssVar})`,
  } as CSSProperties

  const className = [styles.card, variant === 'filled' && styles.filled, variant === 'plain' && styles.plain, badge && styles.withBadge].filter(Boolean).join(' ')

  return (
    <div className={className} style={style}>
      {badge && <span className={styles.badge}>{badge}</span>}
      {title != null && <span className={styles.title}>{title}</span>}
      {children != null && <span className={styles.body}>{children}</span>}
    </div>
  )
}
