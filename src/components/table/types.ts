/** 列内の文字揃え */
export type TableColumnAlign = 'left' | 'center' | 'right'

export type TableColumnSpec = {
  label: string
  align?: TableColumnAlign
  /** 列幅の比率（例: 2は1の倍の幅）。省略時は全列等分 */
  width?: number
}

/**
 * スライド JSON の `content.table` の指定（#194）。
 * ヘッダー行＋本文行の表。座標・寸法は持たず本文領域いっぱいに自動で収まり、
 * 罫線・ゼブラ・ヘッダ行の塗り・角丸はテーマトークンに追従する。
 */
export type TableSpec = {
  columns?: TableColumnSpec[]
  /** 本文行。各要素はcolumnsと同じ順序・数のセル文字列配列 */
  rows?: string[][]
}
