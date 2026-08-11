import { resolveColorToken } from '../../applyTheme'
import type { ChartType } from './types'

/** Y軸（横棒はX軸）の目盛りの目標本数。1/2/5刻みに丸めるので実際の本数はこの前後になる */
const DEFAULT_TICK_COUNT = 5

/** 系列色の既定。明示指定が無い系列にはこの順で割り当てる（#186 で確定した系列色トークン）。
 * 構成図（structureDiagram・#205）のノード色の既定にも流用するため export する（複製しない） */
export const SERIES_KEYS = ['series1', 'series2', 'series3', 'series4', 'series5', 'series6']

export type AxisScale = {
  min: number
  max: number
  /** 目盛り値（min から max まで等間隔） */
  ticks: number[]
  /** 0 の位置（min→0, max→1）。棒の基準線に使う */
  zeroRatio: number
}

/** 目盛りの刻み幅を 1/2/5×10^n に丸める（軸ラベルが読める値になるようにする） */
function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const base = 10 ** Math.floor(Math.log10(rough))
  const norm = rough / base
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * base
}

/** 刻み幅から必要な桁数で丸める（0.1刻みの積み上げで 0.30000000000000004 のような目盛りが出るのを防ぐ） */
function roundToStep(value: number, step: number): number {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 2)
  return Number(value.toFixed(digits))
}

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/**
 * データ範囲から軸のスケールを導出する。min/max を明示すればそのまま使い、省略時は
 * 0 を必ず含む範囲を 1/2/5 刻みへ切り上げる（棒の高さが基準線 0 から読めるようにするため）。
 */
export function buildAxisScale(values: number[], min?: number, max?: number, tickCount = DEFAULT_TICK_COUNT): AxisScale {
  const finite = values.filter((value) => Number.isFinite(value))
  const rawMin = min ?? Math.min(0, ...finite)
  const rawMax = max ?? Math.max(0, ...finite)
  const step = niceStep((rawMax - rawMin) / tickCount)
  const scaleMin = min ?? roundToStep(Math.floor(rawMin / step) * step, step)
  // 全項目が同値（0 のみ等）だと幅が 0 になり比率が発散するため、1刻み分の幅を持たせる
  const scaleMax = max !== undefined && max > scaleMin ? max : Math.max(max ?? roundToStep(Math.ceil(rawMax / step) * step, step), scaleMin + step)

  const ticks: number[] = []
  for (let tick = scaleMin; tick <= scaleMax + step / 2; tick += step) {
    ticks.push(roundToStep(tick, step))
  }

  return { min: scaleMin, max: scaleMax, ticks, zeroRatio: clamp01((0 - scaleMin) / (scaleMax - scaleMin)) }
}

/** 値の軸上の位置（min→0, max→1） */
export function ratioOf(value: number, scale: AxisScale): number {
  if (!Number.isFinite(value)) return scale.zeroRatio
  return clamp01((value - scale.min) / (scale.max - scale.min))
}

/**
 * 軸ラベルが重ならないよう、表示する項目のインデックスを最大 max 個まで一定間隔で選ぶ（#204 の間引き規則）。
 * 間隔は整数なので目盛りの見た目が均等になり、末尾は必ず含める（範囲の右端が読めないと推移が判断できないため）。
 */
export function pickLabelIndices(count: number, max: number): Set<number> {
  if (count <= 0) return new Set()
  if (count <= max || max < 2) return new Set(Array.from({ length: count }, (_, index) => index))

  const step = Math.ceil((count - 1) / (max - 1))
  const picked = new Set<number>()
  for (let index = 0; index < count; index += step) {
    picked.add(index)
  }
  picked.add(count - 1)
  return picked
}

/**
 * 値ラベルの既定表示可否。描画点が増えるとラベルが重なるため、点が少ないときだけ既定で表示する。
 * chart.valueLabels を明示した場合はそちらを優先する（作者の判断を上書きしない）。
 */
export function defaultValueLabels(type: ChartType, categoryCount: number, seriesCount: number): boolean {
  if (type === 'line') return seriesCount === 1 && categoryCount <= 8
  return categoryCount * seriesCount <= 16
}

/** 系列色のCSS変数参照。明示指定が無ければ series1〜series6 を巡回して割り当てる */
export function seriesColor(index: number, color?: string): string {
  return `var(${resolveColorToken(color ?? SERIES_KEYS[index % SERIES_KEYS.length])})`
}

/**
 * 数値を軸ラベル・値ラベル用の文字列にする。桁区切りは ja / en で同じ書式なのでロケールを固定し、
 * 4経路（本編・発表者ビュー・編集プレビュー・PDF）で同一の表記になるようにする。
 */
export function formatValue(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return ''
  const abs = Math.abs(value)
  const digits = Number.isInteger(value) || abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })}${unit ?? ''}`
}

export type PieSlice = {
  /** 元の values / categories 上の位置（色と凡例の対応を保つ） */
  index: number
  /** 全体に対する構成比（0〜1） */
  share: number
  startAngle: number
  endAngle: number
  midAngle: number
}

/** 構成比の扇形を12時起点・時計回りで求める。0以下・非数値は面積を持たない項目として除く */
export function pieSlices(values: number[]): PieSlice[] {
  const positives = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0))
  const total = positives.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return []

  let angle = -90
  return positives
    .map((value, index) => {
      const share = value / total
      const startAngle = angle
      angle += share * 360
      return { index, share, startAngle, endAngle: angle, midAngle: startAngle + (share * 360) / 2 }
    })
    .filter((slice) => slice.share > 0)
}

/** SVG の座標値を2桁に丸める（浮動小数の誤差がそのまま属性値に出るのを防ぐ） */
export function round2(value: number): number {
  return Number(value.toFixed(2))
}

/** 角度（度・0度が右、時計回り）上の点を返す */
export function polarPoint(cx: number, cy: number, r: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  return { x: round2(cx + r * Math.cos(rad)), y: round2(cy + r * Math.sin(rad)) }
}

/** 扇形のパス。全周（1項目のみ）はパスで表現できないため呼び出し側で円として描く */
export function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const from = polarPoint(cx, cy, r, startAngle)
  const to = polarPoint(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${from.x} ${from.y} A ${r} ${r} 0 ${largeArc} 1 ${to.x} ${to.y} Z`
}
