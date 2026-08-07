import { describe, expect, it } from 'vitest'
import { boundaryPointPx, centerOfPx, orthogonalPath, pathMidpoint, polylinePoints, pxToPercent, rectToPx, toPx, type CanvasSize, type NormRect, type PxPoint } from '../geometry'

const SIZE: CanvasSize = { width: 1200, height: 500 }

/** 経路の端点が矩形の辺の上に載っているか（離れていない・食い込んでいない）を判定する */
function isOnBoundary(point: PxPoint, rect: NormRect, size: CanvasSize): boolean {
  const px = rectToPx(rect, size)
  const onVerticalEdge = (Math.abs(point.x - px.x) < 1e-6 || Math.abs(point.x - (px.x + px.w)) < 1e-6) && point.y >= px.y - 1e-6 && point.y <= px.y + px.h + 1e-6
  const onHorizontalEdge = (Math.abs(point.y - px.y) < 1e-6 || Math.abs(point.y - (px.y + px.h)) < 1e-6) && point.x >= px.x - 1e-6 && point.x <= px.x + px.w + 1e-6
  return onVerticalEdge || onHorizontalEdge
}

describe('正規化座標 → px 変換', () => {
  it('点をキャンバスサイズに掛けて px にする', () => {
    expect(toPx({ x: 0.5, y: 0.25 }, SIZE)).toEqual({ x: 600, y: 125 })
  })

  it('矩形をキャンバスサイズに掛けて px にする', () => {
    expect(rectToPx({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, SIZE)).toEqual({ x: 120, y: 100, w: 600, h: 200 })
  })

  it('px をキャンバス相対の % 文字列にする', () => {
    expect(pxToPercent(300, 1200)).toBe('25%')
  })

  it('キャンバスサイズが 0 のときは % を 0 にする（ゼロ除算を避ける）', () => {
    expect(pxToPercent(300, 0)).toBe('0%')
  })

  it('px 矩形の中心を返す', () => {
    expect(centerOfPx({ x: 100, y: 200, w: 400, h: 100 })).toEqual({ x: 300, y: 250 })
  })
})

describe('boundaryPointPx', () => {
  const rect = { x: 100, y: 100, w: 200, h: 100 }

  it('右方向の点に対しては右辺の上を返す', () => {
    expect(boundaryPointPx(rect, { x: 900, y: 150 })).toEqual({ x: 300, y: 150 })
  })

  it('上方向の点に対しては上辺の上を返す', () => {
    expect(boundaryPointPx(rect, { x: 200, y: 0 })).toEqual({ x: 200, y: 100 })
  })

  it('斜め方向の点に対しても辺の上を返す', () => {
    const point = boundaryPointPx(rect, { x: 400, y: 300 })
    expect(point.x === 300 || point.y === 200).toBe(true)
  })

  it('中心そのものを指された場合は中心を返す（0 除算にしない）', () => {
    expect(boundaryPointPx(rect, { x: 200, y: 150 })).toEqual({ x: 200, y: 150 })
  })
})

describe('orthogonalPath', () => {
  it('中心の高さが揃った左右の矩形は 1 本の水平線で結ぶ', () => {
    const from: NormRect = { x: 0.05, y: 0.2, w: 0.2, h: 0.3 }
    const to: NormRect = { x: 0.5, y: 0.2, w: 0.2, h: 0.3 }
    const path = orthogonalPath(from, to, SIZE)

    expect(path).toHaveLength(2)
    expect(path[0].y).toBe(path[1].y)
    expect(path[0]).toEqual({ x: 0.25 * 1200, y: 0.35 * 500 })
    expect(path[1]).toEqual({ x: 0.5 * 1200, y: 0.35 * 500 })
  })

  it('高さがずれた左右の矩形は中間 x で 2 回折れる直交経路になる', () => {
    const from: NormRect = { x: 0.05, y: 0.05, w: 0.2, h: 0.25 }
    const to: NormRect = { x: 0.5, y: 0.6, w: 0.2, h: 0.25 }
    const path = orthogonalPath(from, to, SIZE)

    expect(path).toHaveLength(4)
    // 各区間が水平・垂直のいずれかであること（斜めの区間を作らない）
    path.slice(1).forEach((point, i) => {
      expect(point.x === path[i].x || point.y === path[i].y).toBe(true)
    })
    expect(path[0]).toEqual({ x: 0.25 * 1200, y: 0.175 * 500 })
    expect(path[3]).toEqual({ x: 0.5 * 1200, y: 0.725 * 500 })
  })

  it('上下に並ぶ矩形は上下の辺から出入りする', () => {
    const from: NormRect = { x: 0.4, y: 0.05, w: 0.2, h: 0.2 }
    const to: NormRect = { x: 0.4, y: 0.7, w: 0.2, h: 0.2 }
    const path = orthogonalPath(from, to, SIZE)

    expect(path).toHaveLength(2)
    expect(path[0]).toEqual({ x: 0.5 * 1200, y: 0.25 * 500 })
    expect(path[1]).toEqual({ x: 0.5 * 1200, y: 0.7 * 500 })
  })

  it('routing を明示すると自動判定より優先される', () => {
    const from: NormRect = { x: 0.05, y: 0.2, w: 0.2, h: 0.3 }
    const to: NormRect = { x: 0.5, y: 0.2, w: 0.2, h: 0.3 }
    const path = orthogonalPath(from, to, SIZE, 'vertical')

    // 中心の x がずれているので縦方向は 4 点になり、左右ではなく上下の辺から出入りする
    expect(path).toHaveLength(4)
    expect(path[0].y).toBe(0.5 * 500)
    expect(path[3].y).toBe(0.2 * 500)
  })

  it('両軸で重なる矩形は直交経路を諦め、中心同士を結ぶ直線の境界点を返す（相手を貫通させない）', () => {
    const from: NormRect = { x: 0.1, y: 0.1, w: 0.3, h: 0.4 }
    const to: NormRect = { x: 0.2, y: 0.2, w: 0.3, h: 0.4 }
    const path = orthogonalPath(from, to, SIZE)

    expect(path).toHaveLength(2)
    expect(isOnBoundary(path[0], from, SIZE)).toBe(true)
    expect(isOnBoundary(path[1], to, SIZE)).toBe(true)
  })

  it.each([
    ['水平に並ぶ', { x: 0.05, y: 0.2, w: 0.2, h: 0.3 }, { x: 0.6, y: 0.5, w: 0.2, h: 0.3 }],
    ['垂直に並ぶ', { x: 0.4, y: 0.05, w: 0.2, h: 0.2 }, { x: 0.35, y: 0.7, w: 0.2, h: 0.2 }],
    ['右から左へ戻る', { x: 0.7, y: 0.1, w: 0.2, h: 0.2 }, { x: 0.05, y: 0.6, w: 0.2, h: 0.2 }],
  ])('%s 配置でも経路の両端が要素境界に接する', (_name, from: NormRect, to: NormRect) => {
    const path = orthogonalPath(from, to, SIZE)
    expect(isOnBoundary(path[0], from, SIZE)).toBe(true)
    expect(isOnBoundary(path[path.length - 1], to, SIZE)).toBe(true)
  })

  it('キャンバスサイズを変えても経路の相対位置（サイズで割った値）は変わらない', () => {
    const from: NormRect = { x: 0.05, y: 0.05, w: 0.2, h: 0.25 }
    const to: NormRect = { x: 0.5, y: 0.6, w: 0.2, h: 0.25 }
    const small = orthogonalPath(from, to, { width: 1200, height: 500 })
    const large = orthogonalPath(from, to, { width: 1920, height: 800 })

    expect(large).toHaveLength(small.length)
    small.forEach((point, i) => {
      expect(large[i].x / 1920).toBeCloseTo(point.x / 1200, 10)
      expect(large[i].y / 800).toBeCloseTo(point.y / 500, 10)
    })
  })
})

describe('polylinePoints', () => {
  it('SVG の points 属性文字列にする', () => {
    expect(
      polylinePoints([
        { x: 10, y: 20 },
        { x: 30.5, y: 40 },
      ]),
    ).toBe('10,20 30.5,40')
  })

  it('小数第2位で丸める', () => {
    expect(polylinePoints([{ x: 10.123456, y: 20.987654 }])).toBe('10.12,20.99')
  })
})

describe('pathMidpoint', () => {
  it('直線では中点を返す', () => {
    expect(
      pathMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 })
  })

  it('折れ線では経路長の半分の位置を返す', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(pathMidpoint(path)).toEqual({ x: 100, y: 0 })
  })

  it('長さ 0 の経路では始点を返す', () => {
    expect(
      pathMidpoint([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).toEqual({ x: 5, y: 5 })
  })

  it('空の経路では原点を返す', () => {
    expect(pathMidpoint([])).toEqual({ x: 0, y: 0 })
  })
})
