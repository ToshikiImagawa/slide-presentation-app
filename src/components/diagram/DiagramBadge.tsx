import type { CSSProperties, ReactNode } from 'react'
import { resolveColorToken } from '../../applyTheme'
import { normToPercent, type NormPoint } from './geometry'
import styles from './DiagramBadge.module.css'

type Props = {
  children: ReactNode
  /** 指定するとキャンバス上のこの正規化座標に中心を合わせて置く。省略時はインライン要素として親に従う */
  at?: NormPoint
  /** カラーパレットキー名（例: 'series2'）。省略時は 'primary' */
  color?: string
  /** 省略時は 'circle' */
  shape?: 'circle' | 'square'
  /** 注意を引くべき状態（Compare の warn/fail 等）にだけ、控えめな拡大縮小ループを付ける（opt-in・既定オフ）。
   * transform で scale するため、at 指定時の中央合わせ（translate）とは併用しない想定 */
  pulse?: boolean
}

/** 番号バッジ・記号バッジ（#202）。カード内の連番や、図解上の注意記号に使う */
export function DiagramBadge({ children, at, color, shape = 'circle', pulse }: Props) {
  const cssVar = resolveColorToken(color)
  const style = {
    '--diagram-color': `var(${cssVar})`,
    ...(at ? { left: normToPercent(at.x), top: normToPercent(at.y) } : {}),
  } as CSSProperties

  const className = [styles.badge, shape === 'square' && styles.square, at && styles.positioned, pulse && styles.pulse].filter(Boolean).join(' ')

  return (
    <span className={className} style={style}>
      {children}
    </span>
  )
}
