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

/** shadeStep が受け付ける離散段の範囲（#323）。3段固定（可変段数は follow-up issue とし、本 issue では広げない） */
type ShadeStep = 1 | 2 | 3

/** 範囲外の段番号（0・4等）は最も近い有効な段へ丸める（shadeSeries の alpha クランプと同じ「呼び出し側を落とさない」方針） */
function clampShadeStep(step: number): ShadeStep {
  return Math.min(3, Math.max(1, Math.round(step))) as ShadeStep
}

/** 明示の濃淡トークンが未定義の色に対する shadeStep のフォールバック alpha（段1〜3を等間隔にする。MIN_ALPHA より十分大きい） */
const FALLBACK_ALPHA_BY_STEP: Record<ShadeStep, number> = { 1: 0.3, 2: 0.6, 3: 0.9 }

/**
 * 明示の濃淡トークン（`--<系列色var>-shade-<step>`・#323）が定義されているかを判定する。
 *
 * `theme.tokens` の全体スコープ（`'*'`）は `:root` セレクタとして適用され（masters.ts の buildMasterCss）、
 * `document.documentElement` は CSS の `:root` と同一要素なので、その computed style で判定できる。
 * マスター/章スコープでの値の上書きは、shadeStep が返す `var()` 参照を通じて CSS のカスケードがそのまま
 * 解決する（呼び出し元がどの DOM 位置で描画されるかをここで追う必要はない）ため、この判定は
 * 「全体スコープに定義されているか」の1点だけで足りる。全体スコープに置かず、特定のマスター/章
 * スコープだけに濃淡トークンを書いた場合はこの判定では検出されず shadeSeries へフォールバックする
 * （ブランドの濃淡ランプは通常デッキ全体の意匠であり、まず全体スコープに基準値を置く運用を前提にした割り切り）。
 */
function isShadeTokenDefined(cssVar: string): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() !== ''
}

/**
 * 色トークンと離散段（1〜3。範囲外は丸める）から、明示の濃淡ランプ用の色を返す（#323）。
 *
 * `theme.tokens` に `<系列色var>-shade-<step>`（例: `theme-series-1-shade-2`）が定義されていれば
 * その CSS 変数参照 `var(...)` を返し、未定義なら同じファイル内の `shadeSeries` に委譲して現行の
 * alpha 合成にフォールバックする。alpha の算出はここでは行わない（合成算出は shadeSeries の1箇所に
 * 閉じたままにする）。
 *
 * ヒートマップ（#207）が使う値に比例した連続階調（`shadeSeries` を直接使う）とは用途が異なる。
 * 離散段（構成図のカード塗り分け等、有限個の見た目に量子化してよい場面）向けの入口であり、
 * `shadeSeries` 自体の挙動・呼び出し元（Heatmap）は変えない。
 */
export function shadeStep(colorKey: string | undefined, step: number): string {
  const cssVar = resolveColorToken(colorKey)
  const clampedStep = clampShadeStep(step)
  const shadeVar = `${cssVar}-shade-${clampedStep}`
  if (isShadeTokenDefined(shadeVar)) {
    return `var(${shadeVar})`
  }
  return shadeSeries(colorKey, FALLBACK_ALPHA_BY_STEP[clampedStep])
}
