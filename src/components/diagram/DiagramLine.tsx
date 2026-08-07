import { useId, type ReactNode } from 'react'
import { resolveColorToken } from '../../applyTheme'
import { useDiagramSize } from './DiagramCanvas'
import { pathMidpoint, polylinePoints, pxToPercent, type PxPoint } from './geometry'
import styles from './DiagramLine.module.css'

/** 線の端点に付ける形状。'arrow' は開いた矢羽、'triangle' は塗りつぶし、'dot' は丸 */
export type LineEndShape = 'arrow' | 'triangle' | 'dot' | 'none'

/** 線系プリミティブ（Arrow / Connector / Callout）の共通オプション */
export type DiagramLineStyleProps = {
  /** カラーパレットキー名（例: 'series2'）。省略時は resolveColorToken の既定＝'primary' */
  color?: string
  /** 線幅。--theme-border-width に掛ける倍率（意匠トークンに追従させるため絶対値では持たない） */
  thickness?: number
  dashed?: boolean
  /** 終点（to）側の端点形状。省略時は 'arrow' */
  head?: LineEndShape
  /** 始点（from）側の端点形状。省略時は 'none' */
  tail?: LineEndShape
  /** 線に添えるラベル。経路長の中央に置く */
  label?: ReactNode
}

type Props = DiagramLineStyleProps & { points: PxPoint[] }

/**
 * 端点形状の定義。viewBox は 0 0 10 10 で共通、size は markerWidth/markerHeight（markerUnits は
 * 既定の strokeWidth なので線幅に比例して拡縮する）、refX は端点に合わせる基準点。
 * Record にしているので LineEndShape に形状を足すと定義漏れが型エラーになる。
 */
const MARKER_SHAPES: Record<Exclude<LineEndShape, 'none'>, { refX: number; size: number; render: (color: string) => ReactNode }> = {
  arrow: { refX: 9, size: 6, render: (color) => <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> },
  triangle: { refX: 10, size: 5, render: (color) => <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} /> },
  dot: { refX: 5, size: 4, render: (color) => <circle cx={5} cy={5} r={4} fill={color} /> },
}

function EndMarker({ id, shape, color, atStart }: { id: string; shape: LineEndShape; color: string; atStart: boolean }) {
  if (shape === 'none') return null
  const { refX, size, render } = MARKER_SHAPES[shape]

  return (
    // marker-start に付けたマーカーは auto-start-reverse で向きを反転させ、同じ形状定義を両端で使い回す
    <marker id={id} viewBox="0 0 10 10" refX={refX} refY={5} markerWidth={size} markerHeight={size} orient={atStart ? 'auto-start-reverse' : 'auto'}>
      {render(color)}
    </marker>
  )
}

/**
 * 矢印・コネクタ・引出線が共有する折れ線の描画（#202）。
 *
 * 経路は px で受け取る（縦横比で太さや先端形状が歪まないようにするため）。線幅・破線の刻みは
 * --theme-border-width の倍率、色はカラーパレットキー経由の CSS 変数で持つので、いずれもテーマに追従する。
 */
export function DiagramLine({ points, color, thickness = 2, dashed, head = 'arrow', tail = 'none', label }: Props) {
  const size = useDiagramSize()
  // useId の戻り値は url(#...) に使えない記号を含むため、識別子として使える文字だけを残す
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  if (size.width === 0 || size.height === 0 || points.length < 2) return null

  const headId = `${uid}-head`
  const tailId = `${uid}-tail`
  const strokeColor = `var(${resolveColorToken(color)})`
  const lineWidth = `calc(var(--theme-border-width) * ${thickness})`
  const mid = label == null ? null : pathMidpoint(points)

  return (
    <>
      <svg className={styles.layer} width={size.width} height={size.height} aria-hidden="true">
        <defs>
          <EndMarker id={headId} shape={head} color={strokeColor} atStart={false} />
          <EndMarker id={tailId} shape={tail} color={strokeColor} atStart={true} />
        </defs>
        <polyline
          points={polylinePoints(points)}
          fill="none"
          stroke={strokeColor}
          strokeLinecap="butt"
          strokeLinejoin="round"
          style={{
            strokeWidth: lineWidth,
            strokeDasharray: dashed ? `calc(var(--theme-border-width) * ${thickness * 4}) calc(var(--theme-border-width) * ${thickness * 3})` : undefined,
          }}
          markerEnd={head === 'none' ? undefined : `url(#${headId})`}
          markerStart={tail === 'none' ? undefined : `url(#${tailId})`}
        />
      </svg>
      {mid && (
        <span className={`${styles.chip} ${styles.chipCentered}`} style={{ left: pxToPercent(mid.x, size.width), top: pxToPercent(mid.y, size.height) }}>
          {label}
        </span>
      )}
    </>
  )
}
