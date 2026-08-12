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

/** type: "kpi" の増減注記の方向（記号の向きを決める）。良し悪しの判定ではない（例: 解約率の増加は
 * direction: "up" だが deltaStatus: "danger" になる。方向と状態色は直交する概念なので分離する。#196 */
export type KpiDirection = 'up' | 'down' | 'flat'

/** type: "kpi" の1指標分の指定。単体指定（ChartSpec 直下の value/label/delta 等）も items[0] として
 * 同じ形で扱われる（#196・KPI行と単一KPIの描画・検証ロジックを分裂させないための単一の形） */
export type KpiItemSpec = {
  value?: string | number
  label?: string
  /** 値ラベルに付ける単位（"%" / "件" 等）。省略時は ChartSpec.unit を使う */
  unit?: string
  /** 増減注記（"+12% 前年比" 等） */
  delta?: string
  /** 増減注記の方向記号（▲/▼/–）。省略時は記号なし */
  deltaDirection?: KpiDirection
  /** 増減注記の色トークン名（success/warning/danger/neutral 等）。省略時は value/trend と同じ color */
  deltaStatus?: string
  /** 推移線の数値配列（2点以上で描画） */
  trend?: number[]
  /** 大数値・推移線の色トークン。省略時は系列順（series1〜） */
  color?: string
}

/**
 * スライド JSON の `content.chart` の指定（#204）。
 * 座標や寸法は持たず、データと表示制御だけを宣言する（描画は本文領域いっぱいに自動で収める）。
 *
 * type: "kpi" の単体フィールド（value/label/delta 等）は KpiItemSpec を交差型で取り込む（#196）。
 * items[0] として同じ形で扱われるため、フィールド定義を二重管理しない（unit は bar/line 等でも使う
 * 軸ラベル用の意味を兼ねるので上で宣言済み、KpiItemSpec 側は除く）
 */
export type ChartSpec = {
  type?: ChartType
  /** 横軸（円は内訳）の項目名 */
  categories?: string[]
  series?: ChartSeriesSpec[]
  /** 値ラベル・軸ラベルに付ける単位（"%" / "件" 等）。type: "kpi" では大数値の単位を兼ねる */
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
  /** type: "kpi" を2〜5個横に並べる場合の指標配列（#196）。省略時は下記（KpiItemSpec由来）の単体フィールドを
   * 要素数1のKPIとして扱う（単一KPIとKPI行は同じ描画経路を通る） */
  items?: KpiItemSpec[]
} & Omit<KpiItemSpec, 'unit'>

/** ChartSpec の系列を描画用に正規化したもの（値を数値配列へ整え、色トークンを CSS 変数参照へ解決した状態） */
export type ResolvedSeries = {
  name?: string
  values: number[]
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}
