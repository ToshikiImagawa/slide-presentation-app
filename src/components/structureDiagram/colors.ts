import { resolveColorToken } from '../../applyTheme'
import { SERIES_KEYS } from '../chart/chartScale'

/** ノードの色分けは系列色トークンから引く（#205）。明示指定が無いノードには並び順で series1〜series6 を巡回して割り当てる */
export function defaultSeriesColor(index: number): string {
  return SERIES_KEYS[index % SERIES_KEYS.length]
}

/** shadeSeries が受け付ける alpha の下限（完全透明では色として認識されないため 0 は禁止する。0.05 未満は事実上見えない） */
const MIN_ALPHA = 0.05

/**
 * 色トークン（'series1'/'primary' 等）と 0〜1 の強度から、CSS の rgba 値文字列を返す（#207）。
 *
 * 分析図（ヒートマップの濃淡・2×2 マトリクスの背景・SWOT の淡色地）で、同じ系列色を「濃い〜淡い」の
 * 階調で表現するために使う。実装方式は `-rgb` companion 変数（`--theme-series-N-rgb` 等・#186 で
 * `applyTheme.ts` が全色に自動で設定している）＋ alpha を採用した:
 *
 * ①既存の仕組みで完結する（applyTheme が既に設定している変数を読むだけで、新たな仕組みを持ち込まない）。
 * ②テーマ差し替えに追従する（theme.colors の series1 を変えると、その系列で作った濃淡もすべて追従する）。
 * ③ブラウザ互換性が広い（`color-mix()` は比較的新しく、レンダラの実装差で微妙にズレる。alpha 合成は
 * 古くから同じ結果になる算術演算）。
 *
 * `--theme-series-N` を返す `resolveColorToken` と組で使い、CSS 変数名を書き写さない
 * （series-1 → series-1-rgb のような命名規則をここで直書きすると、将来 CSS 変数名が変わったとき
 * `applyTheme.ts` の setColorVar と乖離するため、必ず `resolveColorToken` を経由して名前を解決する）。
 */
export function shadeSeries(colorKey: string | undefined, alpha: number): string {
  const cssVar = resolveColorToken(colorKey)
  const clamped = Math.min(1, Math.max(MIN_ALPHA, alpha))
  return `rgba(var(${cssVar}-rgb), ${clamped})`
}
