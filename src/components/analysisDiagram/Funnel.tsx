import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'

export type FunnelStage = {
  label?: string
  /** 段の相対的な絞り込み量（例: 通過人数）。値の比率で段幅を決める。省略時は等幅 */
  value?: number
  description?: string
  color?: string
}

export type FunnelSpec = {
  stages?: FunnelStage[]
  /** 数値の単位（ラベル横に "件" 等）。省略時は数値そのまま */
  unit?: string
}

/** ラベル領域（右側）の幅と、段バーの領域（左側）の間の隙間 */
const LABEL_WIDTH = 0.3
const LABEL_GAP = 0.02
const ROW_GAP = 0.02
/** 段バーの左右マージン。上段（幅=1）と最終段（幅=最小比率）の中央揃えに使う */
const BAR_MARGIN = 0.02
/** 最終段の最小相対幅（value が 0 でも「段」として見える最小幅。破綻を防ぐ縮退値） */
const MIN_WIDTH_RATIO = 0.15

/**
 * スライド JSON の `content.funnel` を描画するファネル（段階ごとの絞り込み・#207）。
 *
 * 上から下へ段を積み、`value` の比率で各段の幅を決める（value 省略時は等幅）。段の色は
 * `defaultSeriesColor` を並び順で巡回するので、段数を変えても意味は色に依存しない
 * （単一のアクセント色に意味を持たせすぎない・受け入れ基準）。ラベル・値は右側の別領域に
 * 置き、段の中に文字を詰め込まない（段幅が狭くなると読めなくなるため）。
 */
export function Funnel({ stages, unit }: FunnelSpec) {
  const stageList = asArray(stages)
  if (stageList.length === 0) return null

  const values = stageList.map((s) => (typeof s.value === 'number' && Number.isFinite(s.value) && s.value >= 0 ? s.value : NaN))
  const maxValue = Math.max(...values.filter((v) => !Number.isNaN(v)), 0)
  const barExtent = 1 - LABEL_WIDTH - BAR_MARGIN * 2
  const rowSlots = packAxis(stageList.length, 0, 1, ROW_GAP)

  const stageBars = stageList.map((stage, i) => {
    const row = rowSlots[i]
    const ratio = Number.isNaN(values[i]) || maxValue <= 0 ? 1 : values[i] / maxValue
    // 段幅は正の下限を設ける（value=0 でも段の存在は保つ）。範囲外の縮退にも同じ効果
    const width = Math.max(MIN_WIDTH_RATIO, ratio) * barExtent
    return {
      id: `stage-${i}`,
      // 中央揃え: 左マージン基準に (barExtent - width) の半分だけ内側へ寄せる
      rect: { x: BAR_MARGIN + (barExtent - width) / 2, y: row.offset, w: width, h: row.size },
      title: stage.label,
      color: stage.color ?? defaultSeriesColor(i),
      variant: 'filled' as const,
    }
  })

  const labelBoxes = stageList.map((stage, i) => {
    const row = rowSlots[i]
    const valueText = typeof stage.value === 'number' && Number.isFinite(stage.value) ? formatValue(stage.value, unit) : ''
    const body = [valueText, stage.description].filter(Boolean).join('\n')
    return {
      id: `label-${i}`,
      rect: { x: 1 - LABEL_WIDTH, y: row.offset, w: LABEL_WIDTH - LABEL_GAP, h: row.size },
      title: stage.label,
      body: body || undefined,
      variant: 'plain' as const,
    }
  })

  return <Diagram nodes={[...stageBars, ...labelBoxes]} />
}

/** 数値と単位を結合する（既存 chart.unit と同じく、単位が空文字なら数値のみ・桁区切りあり） */
function formatValue(value: number, unit?: string): string {
  const formatted = value.toLocaleString()
  return unit ? `${formatted}${unit}` : formatted
}
