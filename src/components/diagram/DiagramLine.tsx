import { useId, type CSSProperties, type ReactNode } from 'react'
import { resolveColorToken } from '../../applyTheme'
import { useDiagramSize } from './DiagramCanvas'
import { pathMidpoint, polylinePoints, pxToPercent, type PxPoint } from './geometry'
import styles from './DiagramCanvas.module.css'

/** 線の端点に付ける形状。'arrow' は開いた矢羽、'triangle' は塗りつぶし、'dot' は丸 */
export type LineEndShape = 'arrow' | 'triangle' | 'dot' | 'none'

/** 線系プリミティブ（Arrow / Connector / Callout）の共通オプション */
export type DiagramLineStyleProps = {
  /** カラーパレットキー名（例: 'series2'）。省略時は 'neutral' */
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

const DEFAULT_THICKNESS = 2

/** 端点形状ごとのマーカー定義（markerUnits は既定の strokeWidth のままなので、線幅に比例して拡縮する） */
function EndMarker({ id, shape, color, atStart }: { id: string; shape: LineEndShape; color: string; atStart: boolean }) {
  if (shape === 'none') return null
  // marker-start に付けたマーカーは auto-start-reverse で向きを反転させ、同じ形状定義を両端で使い回す
  const orient = atStart ? 'auto-start-reverse' : 'auto'

  if (shape === 'dot') {
    return (
      <marker id={id} viewBox="0 0 10 10" refX={5} refY={5} markerWidth={4} markerHeight={4} orient={orient}>
        <circle cx={5} cy={5} r={4} fill={color} />
      </marker>
    )
  }
  if (shape === 'triangle') {
    return (
      <marker id={id} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={5} markerHeight={5} orient={orient}>
        <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} />
      </marker>
    )
  }
  return (
    <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient={orient}>
      <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  )
}

/**
 * 矢印・コネクタ・引出線が共有する折れ線の描画（#202）。
 *
 * 経路は px で受け取る（縦横比で太さや先端形状が歪まないようにするため）。線幅・破線の刻みは
 * --theme-border-width の倍率、色はカラーパレットキー経由の CSS 変数で持つので、いずれもテーマに追従する。
 */
export function DiagramLine({ points, color, thickness = DEFAULT_THICKNESS, dashed, head = 'arrow', tail = 'none', label }: Props) {
  const size = useDiagramSize()
  // useId の戻り値は url(#...) に使えない記号を含むため、識別子として使える文字だけを残す
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const strokeColor = `var(${resolveColorToken(color)})`
  const lineWidth = `calc(var(--theme-border-width) * ${thickness})`

  if (size.width === 0 || size.height === 0 || points.length < 2) return null

  const headId = `${uid}-head`
  const tailId = `${uid}-tail`
  const strokeStyle: CSSProperties = {
    strokeWidth: lineWidth,
    strokeDasharray: dashed ? `calc(var(--theme-border-width) * ${thickness * 4}) calc(var(--theme-border-width) * ${thickness * 3})` : undefined,
  }
  const mid = pathMidpoint(points)

  return (
    <>
      <svg className={styles.lineLayer} width={size.width} height={size.height} aria-hidden="true">
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
          style={strokeStyle}
          markerEnd={head === 'none' ? undefined : `url(#${headId})`}
          markerStart={tail === 'none' ? undefined : `url(#${tailId})`}
        />
      </svg>
      {label !== undefined && label !== null && (
        <span className={styles.lineLabel} style={{ left: pxToPercent(mid.x, size.width), top: pxToPercent(mid.y, size.height) }}>
          {label}
        </span>
      )}
    </>
  )
}
