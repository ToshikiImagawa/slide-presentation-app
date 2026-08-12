import { BarChart } from './BarChart'
import { buildAxisScale, defaultValueLabels, formatValue, seriesColor, type AxisChartProps } from './chartScale'
import { ChartLegend, type LegendEntry } from './ChartLegend'
import { asArray, getChartSpecIssues } from './validateChart'
import { HBarChart } from './HBarChart'
import { KpiTrend } from './KpiTrend'
import { LineChart } from './LineChart'
import { PieChart } from './PieChart'
import type { ChartSpec, ResolvedSeries } from './types'
import styles from './Chart.module.css'

/** チャートのルート要素。高さは ContentLayout の fill 変種（global.css の .content-area-fill-item・#225）から受け取る（#256） */
const ROOT_CLASS_NAME = `content-area-fill-item ${styles.chart}`

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
  const issues = getChartSpecIssues(spec)
  if (issues.length > 0) {
    issues.forEach((issue) => console.warn(`[Chart] ${issue}`))
    return null
  }

  const type = spec.type ?? 'bar'
  const series = resolveSeries(spec)
  const categories = resolveCategories(spec, series)

  if (type === 'kpi') {
    return (
      <div className={ROOT_CLASS_NAME} data-testid="chart" data-chart-type={type}>
        <KpiTrend value={spec.value} label={spec.label} delta={spec.delta} unit={spec.unit} trend={asArray(spec.trend).map(Number)} color={seriesColor(0, spec.color)} />
      </div>
    )
  }

  const axis = spec.axis !== false
  const valueLabels = spec.valueLabels ?? defaultValueLabels(type, categories.length, series.length)
  const scale = buildAxisScale(
    series.flatMap((entry) => entry.values),
    spec.min,
    spec.max,
  )
  const axisChartProps: AxisChartProps = { categories, series, scale, unit: spec.unit, axis, valueLabels }

  // 円は項目ごとに色が変わるため、凡例（項目名＋実数値）と扇形描画の両方で使う色配列を1回だけ作る
  const pieColors = type === 'pie' ? categories.map((_, index) => seriesColor(index)) : []
  const legendEntries: LegendEntry[] =
    type === 'pie'
      ? categories.map((category, index) => ({ label: `${category} ${formatValue(series[0].values[index], spec.unit)}`.trim(), color: pieColors[index] }))
      : series.filter((entry) => entry.name).map((entry) => ({ label: entry.name as string, color: entry.color }))
  const showLegend = spec.legend ?? legendEntries.length > 1

  return (
    <div className={ROOT_CLASS_NAME} data-testid="chart" data-chart-type={type}>
      {type === 'bar' && <BarChart {...axisChartProps} />}
      {type === 'line' && <LineChart {...axisChartProps} />}
      {type === 'hbar' && <HBarChart {...axisChartProps} />}
      {type === 'pie' && <PieChart values={series[0].values} colors={pieColors} valueLabels={valueLabels} />}
      {showLegend && <ChartLegend entries={legendEntries} />}
    </div>
  )
}
