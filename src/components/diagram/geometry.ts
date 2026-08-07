/**
 * 図解プリミティブの座標系と経路計算（#202）。
 *
 * 座標系はキャンバス相対の**正規化座標**（x/y/w/h いずれも 0〜1・左上原点）を基本にする。
 * カード・バッジはこの正規化値をそのまま CSS の % 指定に載せるため、キャンバスサイズが
 * 変わっても相対配置が保たれる。一方で線（矢印・コネクタ・引出線）は SVG で描くため、
 * 太さや矢印先端が縦横比で歪まないよう、DiagramCanvas の実測サイズ（CSS px）を掛けて
 * px 空間で経路を組む。この変換と経路計算だけをこのモジュールに集め、純関数として検証する。
 */

/** 正規化座標の点（キャンバス相対 0〜1・左上原点） */
export type NormPoint = { x: number; y: number }

/** 正規化座標の矩形（x/y は左上、w/h は幅・高さ。いずれも 0〜1） */
export type NormRect = { x: number; y: number; w: number; h: number }

/** DiagramCanvas の実測サイズ（CSS px）。未計測の間は 0 になる */
export type CanvasSize = { width: number; height: number }

export type PxPoint = { x: number; y: number }

export type PxRect = { x: number; y: number; w: number; h: number }

/** コネクタの経路方向。'auto' は矩形の隙間と中心距離から決める */
export type ConnectorRouting = 'auto' | 'horizontal' | 'vertical'

/** 中心が実質揃っているとみなす px 閾値。これ以下のずれは折れ線にせず 1 本の直線にする */
const ALIGN_EPSILON = 0.5

/** 正規化座標を px へ変換する */
export function toPx(point: NormPoint, size: CanvasSize): PxPoint {
  return { x: point.x * size.width, y: point.y * size.height }
}

/** 正規化矩形を px へ変換する */
export function rectToPx(rect: NormRect, size: CanvasSize): PxRect {
  return { x: rect.x * size.width, y: rect.y * size.height, w: rect.w * size.width, h: rect.h * size.height }
}

/** px 矩形の中心 */
export function centerOfPx(rect: PxRect): PxPoint {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

/**
 * 矩形の中心から target へ引いた半直線が矩形の辺と交わる点を返す。
 * 返り値は必ず辺の上（＝要素境界に接する）なので、線が矩形から離れたり食い込んだりしない。
 */
export function boundaryPointPx(rect: PxRect, target: PxPoint): PxPoint {
  const center = centerOfPx(rect)
  const dx = target.x - center.x
  const dy = target.y - center.y
  if (dx === 0 && dy === 0) return center

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : rect.w / 2 / Math.abs(dx)
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : rect.h / 2 / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

/** x 方向の隙間（重なっている場合は負） */
function horizontalGap(from: PxRect, to: PxRect): number {
  if (to.x >= from.x + from.w) return to.x - (from.x + from.w)
  if (from.x >= to.x + to.w) return from.x - (to.x + to.w)
  return -1
}

/** y 方向の隙間（重なっている場合は負） */
function verticalGap(from: PxRect, to: PxRect): number {
  if (to.y >= from.y + from.h) return to.y - (from.y + from.h)
  if (from.y >= to.y + to.h) return from.y - (to.y + to.h)
  return -1
}

/**
 * 'auto' の経路方向を決める。直交経路はどちらかの軸に隙間が無いと相手の矩形を貫通してしまうため、
 * 両軸で重なっている場合だけは直交経路を諦めて中心同士を結ぶ直線（'direct'）にする。
 */
function resolveRouting(from: PxRect, to: PxRect): 'horizontal' | 'vertical' | 'direct' {
  const hGap = horizontalGap(from, to)
  const vGap = verticalGap(from, to)
  if (hGap < 0 && vGap < 0) return 'direct'
  if (hGap < 0) return 'vertical'
  if (vGap < 0) return 'horizontal'

  const fromCenter = centerOfPx(from)
  const toCenter = centerOfPx(to)
  return Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y) ? 'horizontal' : 'vertical'
}

/** 左右の辺から出て左右の辺へ入る経路（必要なら中間 x で 2 回折れる） */
function horizontalRoute(from: PxRect, to: PxRect): PxPoint[] {
  const fromCenter = centerOfPx(from)
  const toCenter = centerOfPx(to)
  const goRight = toCenter.x >= fromCenter.x
  const startX = goRight ? from.x + from.w : from.x
  const endX = goRight ? to.x : to.x + to.w

  if (Math.abs(fromCenter.y - toCenter.y) <= ALIGN_EPSILON) {
    // わずかなずれで斜めに見えるのを防ぎ、完全な水平線にする
    return [
      { x: startX, y: fromCenter.y },
      { x: endX, y: fromCenter.y },
    ]
  }
  const midX = (startX + endX) / 2
  return [
    { x: startX, y: fromCenter.y },
    { x: midX, y: fromCenter.y },
    { x: midX, y: toCenter.y },
    { x: endX, y: toCenter.y },
  ]
}

/** 上下の辺から出て上下の辺へ入る経路（必要なら中間 y で 2 回折れる） */
function verticalRoute(from: PxRect, to: PxRect): PxPoint[] {
  const fromCenter = centerOfPx(from)
  const toCenter = centerOfPx(to)
  const goDown = toCenter.y >= fromCenter.y
  const startY = goDown ? from.y + from.h : from.y
  const endY = goDown ? to.y : to.y + to.h

  if (Math.abs(fromCenter.x - toCenter.x) <= ALIGN_EPSILON) {
    return [
      { x: fromCenter.x, y: startY },
      { x: fromCenter.x, y: endY },
    ]
  }
  const midY = (startY + endY) / 2
  return [
    { x: fromCenter.x, y: startY },
    { x: fromCenter.x, y: midY },
    { x: toCenter.x, y: midY },
    { x: toCenter.x, y: endY },
  ]
}

/**
 * 2 つの正規化矩形を結ぶ経路を px で返す。
 * 先頭・末尾の点は必ず各矩形の辺の上に載るため、コネクタが境界から離れず・食い込まない。
 */
export function orthogonalPath(from: NormRect, to: NormRect, size: CanvasSize, routing: ConnectorRouting = 'auto'): PxPoint[] {
  const fromPx = rectToPx(from, size)
  const toPx = rectToPx(to, size)
  const resolved = routing === 'auto' ? resolveRouting(fromPx, toPx) : routing

  if (resolved === 'direct') {
    return [boundaryPointPx(fromPx, centerOfPx(toPx)), boundaryPointPx(toPx, centerOfPx(fromPx))]
  }
  return resolved === 'horizontal' ? horizontalRoute(fromPx, toPx) : verticalRoute(fromPx, toPx)
}

/** SVG の points 属性文字列に変換する（小数第2位で丸め、無意味な差分を出さない） */
export function polylinePoints(points: PxPoint[]): string {
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ')
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 経路長の半分の位置にある点。折れ線でもラベルが線の上に載るようにするために使う */
export function pathMidpoint(points: PxPoint[]): PxPoint {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  const total = lengths.reduce((sum, l) => sum + l, 0)
  if (total === 0) return points[0]

  let remaining = total / 2
  for (const [i, length] of lengths.entries()) {
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length
      return { x: points[i].x + (points[i + 1].x - points[i].x) * ratio, y: points[i].y + (points[i + 1].y - points[i].y) * ratio }
    }
    remaining -= length
  }
  return points[points.length - 1]
}

/** px 座標をキャンバス相対の % 文字列にする（HTML 要素をキャンバス上に置くため） */
export function pxToPercent(value: number, extent: number): string {
  return extent === 0 ? '0%' : `${(value / extent) * 100}%`
}
