import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'

/** 軸見出し（optional）。x/y 軸それぞれで両端ラベル（low/high）と軸名（label）を書ける */
export type AxisSpec = {
  label?: string
  low?: string
  high?: string
}

export type TwoByTwoQuadrant = {
  title?: string
  description?: string
  color?: string
}

export type TwoByTwoItem = {
  label?: string
  /** マトリクス内の正規化座標 x（0〜1・左端=0 / 右端=1） */
  x: number
  /** マトリクス内の正規化座標 y（0〜1・上端=0 / 下端=1。CSS と同じく上原点） */
  y: number
  color?: string
}

export type TwoByTwoMatrixSpec = {
  /** 4象限の見出し。並びは左上・右上・左下・右下（Zパターン）。省略時は無地の枠のみ */
  quadrants?: TwoByTwoQuadrant[]
  items?: TwoByTwoItem[]
  axes?: { x?: AxisSpec; y?: AxisSpec }
}

const MARGIN_X = 0.09
const MARGIN_Y = 0.09
const ITEM_SIZE = 0.06

/**
 * スライド JSON の `content.twoByTwo` を描画する 2×2 マトリクス（散布配置・#207）。
 *
 * 4象限を outline カードで敷き、`items` を正規化座標で散布する。座標系は Diagram の NormRect と
 * 揃えた左上原点（x=0 左端 / y=0 上端）で、独自の座標系は作らない。象限の色分けは
 * `defaultSeriesColor` を巡回し、単一のアクセント色に意味を持たせすぎない（受け入れ基準）。
 * 項目の色は明示指定または落ちる先の象限のインデックスから決定する。
 */
export function TwoByTwoMatrix({ quadrants, items, axes }: TwoByTwoMatrixSpec) {
  const quadList = asArray(quadrants)
  const itemList = asArray(items)
  if (quadList.length === 0 && itemList.length === 0) return null

  const rowSlots = packAxis(2, MARGIN_Y, 1 - MARGIN_Y * 2, 0)
  const colSlots = packAxis(2, MARGIN_X, 1 - MARGIN_X * 2, 0)

  const quadrantNodes = [0, 1, 2, 3].map((i) => {
    const row = rowSlots[Math.floor(i / 2)]
    const col = colSlots[i % 2]
    const spec = quadList[i]
    return {
      id: `quadrant-${i}`,
      rect: { x: col.offset, y: row.offset, w: col.size, h: row.size },
      title: spec?.title,
      body: spec?.description,
      color: spec?.color ?? defaultSeriesColor(i),
      variant: 'outline' as const,
    }
  })

  const itemNodes = itemList.map((item, i) => {
    const cx = clamp01(item.x)
    const cy = clamp01(item.y)
    const px = MARGIN_X + cx * (1 - MARGIN_X * 2)
    const py = MARGIN_Y + cy * (1 - MARGIN_Y * 2)
    return {
      id: `item-${i}`,
      rect: { x: px - ITEM_SIZE / 2, y: py - ITEM_SIZE / 2, w: ITEM_SIZE, h: ITEM_SIZE },
      color: item.color ?? defaultSeriesColor(quadrantIndex(cx, cy)),
      variant: 'filled' as const,
      shape: 'pill' as const,
    }
  })

  const itemCallouts = itemList
    .map((item) => {
      if (!item.label) return null
      const cx = clamp01(item.x)
      const cy = clamp01(item.y)
      const px = MARGIN_X + cx * (1 - MARGIN_X * 2)
      const py = MARGIN_Y + cy * (1 - MARGIN_Y * 2)
      // 象限に応じてラベルを内側方向へずらす（マトリクス外へはみ出さないように）
      const offX = cx < 0.5 ? 0.06 : -0.06
      const offY = cy < 0.5 ? 0.06 : -0.06
      return { at: { x: px, y: py }, to: { x: px + offX, y: py + offY }, label: item.label }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  return <Diagram nodes={[...quadrantNodes, ...itemNodes]} callouts={itemCallouts} badges={buildAxisBadges(axes)} />
}

/** 0〜1 の範囲に丸める（NaN・範囲外は端に押しやる。破綻ではなく縮退させる・受け入れ基準） */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

/** 座標→象限インデックス（0:左上 / 1:右上 / 2:左下 / 3:右下）。項目色のフォールバックに使う */
function quadrantIndex(x: number, y: number): number {
  return (y >= 0.5 ? 2 : 0) + (x >= 0.5 ? 1 : 0)
}

/** 軸ラベル・軸見出しを DiagramBadge の集合として組み立てる（独自 CSS を書かず badges にまとめる） */
function buildAxisBadges(axes: TwoByTwoMatrixSpec['axes']) {
  const badges: { at: { x: number; y: number }; text: string; color: string; shape: 'square' }[] = []
  const x = axes?.x
  const y = axes?.y

  // 軸バッジは中心点座標を基準に配置されるため、セーフエリア（グローバルCSSの .master-body padding）に
  // 掛からない位置に押し戻す。y=1-MARGIN_Y/2 の位置が下端セーフエリアの内側に収まる（実測ベース）
  if (x?.low) badges.push({ at: { x: MARGIN_X, y: 1 - MARGIN_Y / 2 }, text: x.low, color: 'neutral', shape: 'square' })
  if (x?.high) badges.push({ at: { x: 1 - MARGIN_X, y: 1 - MARGIN_Y / 2 }, text: x.high, color: 'neutral', shape: 'square' })
  if (x?.label) badges.push({ at: { x: 0.5, y: 1 - MARGIN_Y / 2 }, text: x.label, color: 'primary', shape: 'square' })
  if (y?.low) badges.push({ at: { x: MARGIN_X / 2, y: 1 - MARGIN_Y }, text: y.low, color: 'neutral', shape: 'square' })
  if (y?.high) badges.push({ at: { x: MARGIN_X / 2, y: MARGIN_Y }, text: y.high, color: 'neutral', shape: 'square' })
  if (y?.label) badges.push({ at: { x: MARGIN_X / 2, y: 0.5 }, text: y.label, color: 'primary', shape: 'square' })

  return badges
}
