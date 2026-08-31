/** 比較項目の状態記号・状態色（pass=✓success / fail=✕danger / warn=!warning / neutral=–neutral）。省略時は記号なしの通常項目 */
export type CompareStatus = 'pass' | 'fail' | 'warn' | 'neutral'

export type CompareItem = {
  text: string
  status?: CompareStatus
  /** 特に注意を引きたい項目にだけ、状態記号バッジへ控えめな拡大縮小ループを付ける（opt-in・省略時はループなし） */
  pulse?: boolean
}

export type ComparePaneSpec = {
  heading?: string
  items?: CompareItem[]
}

/**
 * スライド JSON の `content.compare` の指定（#200）。
 * 可否・採用/非採用・Before/After 等の2ペイン比較。座標・寸法は持たず、左右ペインの高さは自動で揃う。
 */
export type CompareSpec = {
  left?: ComparePaneSpec
  right?: ComparePaneSpec
}
