/** 対応するチャート種別（#204）。棒（縦）・折れ線・円（構成比）・横棒（項目比較）・大数値＋推移線 */
export type ChartType = 'bar' | 'line' | 'pie' | 'hbar' | 'kpi'

export type ChartSeriesSpec = {
  /** 凡例に出す系列名 */
  name?: string
  /** categories と同じ順序の値。欠けた分は描画しない */
  values?: number[]
  /** カラーパレットキー名（series1〜series6 等）。省略時は系列順に series1〜series6 */
  color?: string
}

/**
 * スライド JSON の `content.chart` の指定（#204）。
 * 座標や寸法は持たず、データと表示制御だけを宣言する（描画は本文領域いっぱいに自動で収める）。
 */
export type ChartSpec = {
  type?: ChartType
  /** 横軸（円は内訳）の項目名 */
  categories?: string[]
  series?: ChartSeriesSpec[]
  /** 値ラベル・軸ラベルに付ける単位（"%" / "件" 等） */
  unit?: string
  /** 軸の目盛りラベルと格子線。省略時は表示する */
  axis?: boolean
  /** 凡例。省略時は系列名が2つ以上あるとき（円は categories があるとき）表示する */
  legend?: boolean
  /** 値ラベル。省略時は描画点の数から自動判定する */
  valueLabels?: boolean
  /** 軸の下限・上限。省略時はデータから 1/2/5 刻みの範囲を導出する */
  min?: number
  max?: number
  /** type: "kpi" の大数値 */
  value?: string | number
  /** type: "kpi" の見出し */
  label?: string
  /** type: "kpi" の増減注記（"+12% 前年比" 等） */
  delta?: string
  /** type: "kpi" の推移線の値 */
  trend?: number[]
  /** type: "kpi" の大数値・推移線の色トークン。省略時は series1 */
  color?: string
}

/** ChartSpec の系列を描画用に正規化したもの（値を数値配列へ整え、色トークンを CSS 変数参照へ解決した状態） */
export type ResolvedSeries = {
  name?: string
  values: number[]
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}
