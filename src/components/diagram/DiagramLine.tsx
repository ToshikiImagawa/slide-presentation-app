import { useId, type CSSProperties, type ReactNode } from 'react'
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
  /** 表示順のインデックス。指定すると線が手前に引かれてくるドローイン演出になる（dashed 時は適用しない） */
  staggerIndex?: number
  /** 同じ出現グループの総数。件数が多いときに出現delayのステップを圧縮するため（省略時1） */
  staggerCount?: number
  /** ソリッド線に「データが流れる」向きを示す小さな光の粒を無限に流す（dashed 時は既存の破線流れと重複するため無視） */
  flow?: boolean
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

function EndMarker({ id, shape, color, atStart, revealStyle }: { id: string; shape: LineEndShape; color: string; atStart: boolean; revealStyle?: CSSProperties }) {
  if (shape === 'none') return null
  const { refX, size, render } = MARKER_SHAPES[shape]

  return (
    // marker-start に付けたマーカーは auto-start-reverse で向きを反転させ、同じ形状定義を両端で使い回す
    <marker id={id} viewBox="0 0 10 10" refX={refX} refY={5} markerWidth={size} markerHeight={size} orient={atStart ? 'auto-start-reverse' : 'auto'}>
      {/* SVG の marker は stroke-dashoffset のドローイン演出と連動せず、要素がマウントされた瞬間から
       * 常に終点の位置に表示される（マーカーは path の頂点に配置されるだけで、線がどこまで描かれたかは
       * 見ない仕様）。revealStyle 指定時（draw=true）は先端自体もフェードインさせ、線が描き終わる
       * タイミングまで先端が見えないようにする（DiagramLine.module.css の .markerReveal 参照） */}
      <g className={revealStyle ? styles.markerReveal : undefined} style={revealStyle}>
        {render(color)}
      </g>
    </marker>
  )
}

/**
 * 矢印・コネクタ・引出線が共有する折れ線の描画（#202）。
 *
 * 経路は px で受け取る（縦横比で太さや先端形状が歪まないようにするため）。線幅・破線の刻みは
 * --theme-border-width の倍率、色はカラーパレットキー経由の CSS 変数で持つので、いずれもテーマに追従する。
 */
export function DiagramLine({ points, color, thickness = 2, dashed, head = 'arrow', tail = 'none', label, staggerIndex, staggerCount, flow }: Props) {
  const size = useDiagramSize()
  // useId の戻り値は url(#...) に使えない記号を含むため、識別子として使える文字だけを残す
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  if (size.width === 0 || size.height === 0 || points.length < 2) return null

  const headId = `${uid}-head`
  const tailId = `${uid}-tail`
  const strokeColor = `var(${resolveColorToken(color)})`
  const lineWidth = `calc(var(--theme-border-width) * ${thickness})`
  const mid = label == null ? null : pathMidpoint(points)
  // dashed は絶対px由来のダッシュ間隔を使うため、pathLength=1 による正規化と組み合わせられない（#202）
  const draw = !dashed && staggerIndex != null
  // dashed 線は「データが流れる」向きを持つ接続として、ダッシュの1周期分だけ無限に流すループ演出にする
  const dashPeriod = `calc(var(--theme-border-width) * ${thickness * 7})`
  const markerRevealStyle = draw ? ({ '--stagger-index': staggerIndex, '--stagger-count': staggerCount ?? 1 } as CSSProperties) : undefined
  // ソリッド線用の flow は dashed 線の .flow と役割が重複するため dashed 指定時は無視する（opt-in・既定オフ）
  const showFlowComet = flow && !dashed
  const flowCometStyle = showFlowComet ? ({ '--stagger-index': staggerIndex ?? 0, '--stagger-count': staggerCount ?? 1 } as CSSProperties) : undefined

  return (
    <>
      <svg className={styles.layer} width={size.width} height={size.height} aria-hidden="true">
        <defs>
          <EndMarker id={headId} shape={head} color={strokeColor} atStart={false} revealStyle={markerRevealStyle} />
          <EndMarker id={tailId} shape={tail} color={strokeColor} atStart={true} revealStyle={markerRevealStyle} />
        </defs>
        <polyline
          points={polylinePoints(points)}
          fill="none"
          stroke={strokeColor}
          strokeLinecap="butt"
          strokeLinejoin="round"
          className={dashed ? styles.flow : draw ? styles.draw : undefined}
          pathLength={draw ? 1 : undefined}
          style={{
            strokeWidth: lineWidth,
            strokeDasharray: dashed ? `calc(var(--theme-border-width) * ${thickness * 4}) calc(var(--theme-border-width) * ${thickness * 3})` : draw ? 1 : undefined,
            ...(dashed ? ({ '--flow-dash-period': dashPeriod } as CSSProperties) : {}),
            ...(markerRevealStyle ?? {}),
          }}
          markerEnd={head === 'none' ? undefined : `url(#${headId})`}
          markerStart={tail === 'none' ? undefined : `url(#${tailId})`}
        />
        {showFlowComet && (
          <polyline
            points={polylinePoints(points)}
            fill="none"
            stroke={strokeColor}
            strokeLinecap="round"
            className={styles.flowComet}
            pathLength={1}
            style={{ strokeWidth: `calc(var(--theme-border-width) * ${thickness * 1.8})`, strokeDasharray: '0.08 0.92', ...flowCometStyle }}
          />
        )}
      </svg>
      {mid && (
        <span className={`${styles.chip} ${styles.chipCentered}`} style={{ left: pxToPercent(mid.x, size.width), top: pxToPercent(mid.y, size.height) }}>
          {label}
        </span>
      )}
    </>
  )
}
