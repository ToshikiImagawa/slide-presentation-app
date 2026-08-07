import type { CSSProperties, ReactNode } from 'react'
import { resolveColorToken } from '../../applyTheme'
import type { NormPoint } from './geometry'
import styles from './DiagramBadge.module.css'

type Props = {
  children: ReactNode
  /** 指定するとキャンバス上のこの正規化座標に中心を合わせて置く。省略時はインライン要素として親に従う */
  at?: NormPoint
  /** カラーパレットキー名（例: 'series2'）。省略時は 'primary' */
  color?: string
  /** 省略時は 'circle' */
  shape?: 'circle' | 'square'
  /** 一辺の大きさ（px）。文字サイズはこの値から比例で決まる */
  size?: number
}

const DEFAULT_SIZE = 34

/** 番号バッジ・記号バッジ（#202）。カード内の連番や、図解上の注意記号に使う */
export function DiagramBadge({ children, at, color, shape = 'circle', size = DEFAULT_SIZE }: Props) {
  const cssVar = resolveColorToken(color)
  const style = {
    '--diagram-badge-size': `${size}px`,
    '--diagram-color': `var(${cssVar})`,
    ...(at ? { left: `${at.x * 100}%`, top: `${at.y * 100}%` } : {}),
  } as CSSProperties

  const className = [styles.badge, shape === 'square' && styles.square, at && styles.positioned].filter(Boolean).join(' ')

  return (
    <span className={className} style={style}>
      {children}
    </span>
  )
}
