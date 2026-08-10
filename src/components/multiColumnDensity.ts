/** 多列配置（1〜3列）の列数丸め・行数に応じた密度算出。Timeline（#199）・Toc（#195）で共有する */
export type Density = 'normal' | 'dense' | 'compact'

const MIN_COLUMNS = 1
const MAX_COLUMNS = 3

/** 列数を許容範囲（1〜3）に丸める */
export function clampColumns(columns: number): number {
  return Math.min(Math.max(Math.round(columns), MIN_COLUMNS), MAX_COLUMNS)
}

/** 行数（項目数 ÷ 列数）から密度（行間・文字サイズの縮小段階）を決める。しきい値はコンポーネントごとに
 * 異なる（Timeline は連結線つきの1列とレイアウトが変わるため厳しめ）ので呼び出し側から渡す。
 * 実際にはみ出していないかは npm run reference-deck:inspect が実測で検出する */
export function densityFromRows(count: number, columns: number, thresholds: { dense: number; compact: number }): Density {
  const rows = Math.ceil(count / columns)
  if (rows > thresholds.compact) return 'compact'
  if (rows >= thresholds.dense) return 'dense'
  return 'normal'
}
