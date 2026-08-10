import { BarChart } from './BarChart'
import { buildAxisScale, defaultValueLabels, formatValue, seriesColor } from './chartScale'
import { ChartLegend, type LegendEntry } from './ChartLegend'
import { HBarChart } from './HBarChart'
import { KpiTrend } from './KpiTrend'
import { LineChart } from './LineChart'
import { PieChart } from './PieChart'
import type { ChartSpec, ChartType, ResolvedSeries } from './types'
import styles from './Chart.module.css'

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'hbar', 'kpi']

/** チャートのルート要素。高さは ContentLayout の fill 変種（global.css の .content-area-fill-item・#225）から受け取る（#256） */
const ROOT_CLASS_NAME = `content-area-fill-item ${styles.chart}`

/** JSON 由来の値は配列でない可能性があるため、描画前に配列だけを通す（不正なデッキでデッキ全体を落とさない） */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/** 系列を描画用に正規化する。値は数値化し（非数値は NaN として各種別が描画から除く）、色は系列順のトークンで補う */
function resolveSeries(spec: ChartSpec): ResolvedSeries[] {
  return asArray(spec.series).map((entry, index) => ({
    name: typeof entry?.name === 'string' ? entry.name : undefined,
    values: asArray(entry?.values).map(Number),
    color: seriesColor(index, entry?.color),
  }))
}

/** 項目名。系列の値の方が長い場合は空文字で埋め、マークと項目名の対応がずれないようにする */
function resolveCategories(spec: ChartSpec, series: ResolvedSeries[]): string[] {
  const declared = asArray(spec.categories).map(String)
  const count = Math.max(declared.length, ...series.map((entry) => entry.values.length), 0)
  return Array.from({ length: count }, (_, index) => declared[index] ?? '')
}

/**
 * スライド JSON の `content.chart` を描画するチャート（#204）。
 *
 * 依存を追加せず、HTML と SVG のプリミティブだけで描く（オフラインで動作し、バンドルサイズを増やさず、
 * 色・線幅・角丸を意匠トークンから引けてテーマに追従するため）。テキストはすべて HTML 要素で描くので、
 * 本編・発表者ビュー・編集プレビュー・PDF の4経路で同じ表示になる。
 */
export function Chart(spec: ChartSpec) {
  const type = spec.type ?? 'bar'
  if (!CHART_TYPES.includes(type)) {
    console.warn(`[Chart] 未知のチャート種別です: "${type}"（${CHART_TYPES.join(' / ')} のいずれかを指定してください）`)
    return null
  }

  const series = resolveSeries(spec)
  const categories = resolveCategories(spec, series)

  if (type === 'kpi') {
    return (
      <div className={ROOT_CLASS_NAME} data-testid="chart" data-chart-type={type}>
        <KpiTrend value={spec.value} label={spec.label} delta={spec.delta} unit={spec.unit} trend={asArray(spec.trend).map(Number)} color={seriesColor(0, spec.color)} />
      </div>
    )
  }

  if (series.length === 0 || categories.length === 0) {
    console.warn('[Chart] categories と series の少なくとも一方が空のため描画できません')
    return null
  }

  const axis = spec.axis !== false
  const valueLabels = spec.valueLabels ?? defaultValueLabels(type, categories.length, series.length)
  const scale = buildAxisScale(
    series.flatMap((entry) => entry.values),
    spec.min,
    spec.max,
  )

  // 円は内訳項目ごとに色が変わるので凡例は項目名＋実数値、それ以外は系列名を並べる
  const legendEntries: LegendEntry[] =
    type === 'pie'
      ? categories.map((category, index) => ({ label: `${category} ${formatValue(series[0].values[index], spec.unit)}`.trim(), color: seriesColor(index) }))
      : series.filter((entry) => entry.name).map((entry) => ({ label: entry.name as string, color: entry.color }))
  const showLegend = spec.legend ?? legendEntries.length > 1

  return (
    <div className={ROOT_CLASS_NAME} data-testid="chart" data-chart-type={type}>
      {type === 'bar' && <BarChart categories={categories} series={series} scale={scale} unit={spec.unit} axis={axis} valueLabels={valueLabels} />}
      {type === 'line' && <LineChart categories={categories} series={series} scale={scale} unit={spec.unit} axis={axis} valueLabels={valueLabels} />}
      {type === 'hbar' && <HBarChart categories={categories} series={series} scale={scale} unit={spec.unit} axis={axis} valueLabels={valueLabels} />}
      {type === 'pie' && <PieChart values={series[0].values} colors={categories.map((_, index) => seriesColor(index))} valueLabels={valueLabels} />}
      {showLegend && <ChartLegend entries={legendEntries} />}
    </div>
  )
}
